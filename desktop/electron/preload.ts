import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("yumeFriend", {
  version: "0.1.0",
  openPet: () => ipcRenderer.invoke("pet:open"),
  closePet: () => ipcRenderer.invoke("pet:close"),
  checkUpdate: (url: string) => ipcRenderer.invoke("update:check", url),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
});
