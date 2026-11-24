const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yumeFriend", {
  version: "0.1.0",
  openPet: (friendId) => ipcRenderer.invoke("pet:open", friendId),
  closePet: () => ipcRenderer.invoke("pet:close"),
  openMain: () => ipcRenderer.invoke("pet:open-main"),
  checkUpdate: (url) => ipcRenderer.invoke("update:check", url),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  setZoomFactor: (scale) => ipcRenderer.invoke("window:set-zoom", scale),
  onUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  },
});
