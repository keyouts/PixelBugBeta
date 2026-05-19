const { app, BrowserWindow, dialog, ipcMain, session } = require("electron");
const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");

const APP_TITLE = "Pixel Bug";
const INDEX_PATH = path.join(__dirname, "index.html");
const INDEX_URL = pathToFileURL(INDEX_PATH).toString();

function isTrustedSender(event) {
  return event.senderFrame && event.senderFrame.url === INDEX_URL;
}

function cleanExtraFilename(filename) {
  const safe = path.basename(String(filename || "")).replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim();
  return safe || "pixel-bug-extra.txt";
}


function configureAppPaths() {
  if (app.isPackaged) return;

  const cacheRoot = path.join(app.getPath("temp"), "PixelBugElectron");
  const userDataPath = path.join(cacheRoot, "UserData");
  const sessionDataPath = path.join(cacheRoot, "SessionData");
  const diskCachePath = path.join(cacheRoot, "DiskCache");

  app.setPath("userData", userDataPath);
  try {
    app.setPath("sessionData", sessionDataPath);
  } catch (_error) {
    app.commandLine.appendSwitch("user-data-dir", userDataPath);
  }

  app.commandLine.appendSwitch("disk-cache-dir", diskCachePath);
  app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: APP_TITLE,
    icon: path.join(__dirname, "../assets/icon.png"),
    backgroundColor: "#f8f1dc",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      spellcheck: false
    }
  });

  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", event => event.preventDefault());
  win.once("ready-to-show", () => win.show());
  win.loadFile(INDEX_PATH);
}

configureAppPaths();
app.commandLine.appendSwitch("disable-features", "AutofillServerCommunication");

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("save-file", async (event, options = {}) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted sender");

  const { title, defaultPath, filters, data, encoding = "utf8", extraFiles = [] } = options;
  const result = await dialog.showSaveDialog({ title, defaultPath, filters });
  if (result.canceled || !result.filePath) return { ok: false };

  const payload = encoding === "base64" ? Buffer.from(String(data || ""), "base64") : String(data ?? "");
  await fs.writeFile(result.filePath, payload);

  for (const extra of Array.isArray(extraFiles) ? extraFiles : []) {
    const extraPath = path.join(path.dirname(result.filePath), cleanExtraFilename(extra.filename));
    const extraPayload = extra.encoding === "base64" ? Buffer.from(String(extra.data || ""), "base64") : String(extra.data ?? "");
    await fs.writeFile(extraPath, extraPayload);
  }

  return { ok: true, filePath: result.filePath };
});

ipcMain.handle("open-project", async event => {
  if (!isTrustedSender(event)) throw new Error("Untrusted sender");

  const result = await dialog.showOpenDialog({
    title: "Open Pixel Bug Project",
    properties: ["openFile"],
    filters: [{ name: "Pixel Bug Project", extensions: ["pxbuild", "json"] }]
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false };

  const text = await fs.readFile(result.filePaths[0], "utf8");
  return { ok: true, text, filePath: result.filePaths[0] };
});
