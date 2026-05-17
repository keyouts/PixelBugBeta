const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pixelBug", {
  saveFile: options => ipcRenderer.invoke("save-file", options),
  openProject: () => ipcRenderer.invoke("open-project")
});
