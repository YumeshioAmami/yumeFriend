const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yumeFriend", {
  version: "0.1.0",
  openPet: () => ipcRenderer.invoke("pet:open"),
  closePet: () => ipcRenderer.invoke("pet:close"),
  openMain: () => ipcRenderer.invoke("pet:open-main"),
  checkUpdate: (url) => ipcRenderer.invoke("update:check", url),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
});
