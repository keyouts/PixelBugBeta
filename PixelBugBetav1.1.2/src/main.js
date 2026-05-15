const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("fs/promises");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: "Pixel Bug Beta",
    icon: path.join(__dirname, "../assets/icon.png"),
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("save-file", async (_event, options) => {
  const { title, defaultPath, filters, data, encoding = "utf8" } = options;
  const result = await dialog.showSaveDialog({ title, defaultPath, filters });
  if (result.canceled || !result.filePath) return { ok: false };

  const payload = encoding === "base64" ? Buffer.from(data, "base64") : data;
  await fs.writeFile(result.filePath, payload);
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle("open-project", async () => {
  const result = await dialog.showOpenDialog({
    title: "Open Pixel Bug Beta Project",
    properties: ["openFile"],
    filters: [{ name: "Pixel Bug Beta Project", extensions: ["pxbuild", "json"] }]
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false };

  const text = await fs.readFile(result.filePaths[0], "utf8");
  return { ok: true, text, filePath: result.filePaths[0] };
});
