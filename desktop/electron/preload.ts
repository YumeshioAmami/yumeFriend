import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("yumeFriend", {
  version: "0.1.0",
  openPet: () => ipcRenderer.invoke("pet:open"),
  closePet: () => ipcRenderer.invoke("pet:close"),
});
