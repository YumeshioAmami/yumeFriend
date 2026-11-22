import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("yumeFriend", {
  version: "0.1.0",
});
