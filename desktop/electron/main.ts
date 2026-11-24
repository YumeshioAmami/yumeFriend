import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import updater from "electron-updater";
import { fileURLToPath } from "node:url";

const { autoUpdater } = updater;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(currentDir, "..");
const repoRoot = path.resolve(appRoot, "..");
const corePort = Number(process.env.YUMECORE_PORT ?? "47895");
const apiPort = Number(process.env.YUMEFRIEND_PORT ?? "47891");
const children: ChildProcess[] = [];
let mainWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
let petFriendId = "";
let zoomFactor = 1;
let petScale = 1;
let petDrag: {
  cursorX: number;
  cursorY: number;
  windowX: number;
  windowY: number;
} | null = null;
let petSaveTimer: NodeJS.Timeout | null = null;

const userDataDir = path.join(repoRoot, "user_data");
const petStateFile = path.join(userDataDir, "pet_window.json");
const PET_BASE_WIDTH = 320;
const PET_BASE_HEIGHT = 660;
const PET_PREVIOUS_BASE_HEIGHT = 520;
const PET_LAYOUT_VERSION = 2;
const PET_MIN_SCALE = 0.6;
const PET_MAX_SCALE = 1.8;

function clampPetScale(value: number): number {
  return Math.min(PET_MAX_SCALE, Math.max(PET_MIN_SCALE, value));
}

function petSize(): { width: number; height: number } {
  return {
    width: Math.round(PET_BASE_WIDTH * petScale),
    height: Math.round(PET_BASE_HEIGHT * petScale),
  };
}

function readPetState(): { x?: number; y?: number; scale?: number; version?: number } {
  try {
    return JSON.parse(fs.readFileSync(petStateFile, "utf8"));
  } catch {
    return {};
  }
}

function savePetState(): void {
  if (!petWindow) return;
  const bounds = petWindow.getBounds();
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    petStateFile,
    JSON.stringify({
      x: bounds.x,
      y: bounds.y,
      scale: petScale,
      version: PET_LAYOUT_VERSION,
    }),
  );
}

function schedulePetStateSave(): void {
  if (petSaveTimer) clearTimeout(petSaveTimer);
  petSaveTimer = setTimeout(savePetState, 300);
}

function startServices(): void {
  const userData = userDataDir;
  fs.mkdirSync(userData, { recursive: true });

  const deviceFile = path.join(userData, "device_id");
  const deviceId = fs.existsSync(deviceFile)
    ? fs.readFileSync(deviceFile, "utf8").trim()
    : randomUUID();
  fs.writeFileSync(deviceFile, deviceId);

  const coreJar =
    process.env.YUMECORE_JAR ??
    path.join(appRoot, "resources", "yumeCoreHost.jar");
  const core = spawn(
    "java",
    [
      "-jar",
      coreJar,
      "--db",
      path.join(userData, "yumefriend.db"),
      "--modules",
      path.join(appRoot, "modules"),
      "--port",
      String(corePort),
      "--device-id",
      deviceId,
      "--product-id",
      "yumeFriend",
    ],
    { stdio: "inherit" },
  );
  children.push(core);

  const venvPython = path.join(
    appRoot,
    "backend",
    ".venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python",
  );
  const python = spawn(
    fs.existsSync(venvPython) ? venvPython : "python",
    ["-m", "yumefriend.main"],
    {
      cwd: path.join(appRoot, "backend"),
      stdio: "inherit",
      env: {
        ...process.env,
        YUMECORE_URL: `http://127.0.0.1:${corePort}/core/v1`,
        YUMEFRIEND_PORT: String(apiPort),
      },
    },
  );
  children.push(python);
}

async function waitFor(url: string, seconds = 20): Promise<void> {
  const deadline = Date.now() + seconds * 1_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // service is still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`服务未就绪：${url}`);
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(currentDir, "preload.cjs"),
    },
  });
  mainWindow = window;
  window.webContents.setZoomFactor(zoomFactor);
  window.setMenuBarVisibility(false);
  window.on("closed", () => {
    mainWindow = null;
    petWindow?.close();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(path.join(currentDir, "../dist/index.html"));
  }
}

function createPetWindow(friendId?: string): void {
  if (petWindow) {
    petWindow.focus();
    if (friendId && friendId !== petFriendId) {
      petFriendId = friendId;
      const devUrl = process.env.VITE_DEV_SERVER_URL;
      if (devUrl) {
        void petWindow.loadURL(
          `${devUrl}?pet=1&friend=${encodeURIComponent(friendId)}`,
        );
      } else {
        void petWindow.loadFile(path.join(currentDir, "../dist/index.html"), {
          query: { pet: "1", friend: friendId },
        });
      }
    }
    return;
  }
  petFriendId = friendId ?? "";
  const state = readPetState();
  petScale = clampPetScale(Number(state.scale) || 1);
  if ((state.version ?? 1) < PET_LAYOUT_VERSION && typeof state.y === "number") {
    state.y -= Math.round((PET_BASE_HEIGHT - PET_PREVIOUS_BASE_HEIGHT) * petScale);
  }
  const size = petSize();
  petWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: typeof state.x === "number" ? state.x : undefined,
    y: typeof state.y === "number" ? state.y : undefined,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(currentDir, "preload.cjs"),
    },
  });
  petWindow.webContents.setZoomFactor(zoomFactor);
  petWindow.on("moved", schedulePetStateSave);
  petWindow.on("resized", schedulePetStateSave);
  schedulePetStateSave();
  petWindow.on("closed", () => {
    petWindow = null;
    petFriendId = "";
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const query = petFriendId ? `&friend=${encodeURIComponent(petFriendId)}` : "";
    void petWindow.loadURL(`${devUrl}?pet=1${query}`);
  } else {
    void petWindow.loadFile(path.join(currentDir, "../dist/index.html"), {
      query: petFriendId ? { pet: "1", friend: petFriendId } : { pet: "1" },
    });
  }
}

ipcMain.handle("pet:open", (_event, friendId?: string) => createPetWindow(friendId));
ipcMain.handle("pet:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});
ipcMain.handle("pet:open-main", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});
ipcMain.handle("pet:get-scale", () => petScale);
ipcMain.handle("pet:set-scale", (_event, value: number) => {
  petScale = clampPetScale(value);
  if (petWindow) {
    const size = petSize();
    petWindow.setSize(size.width, size.height);
    schedulePetStateSave();
  }
  return petScale;
});
ipcMain.handle("pet:drag-start", () => {
  if (!petWindow) return false;
  const cursor = screen.getCursorScreenPoint();
  const bounds = petWindow.getBounds();
  petDrag = {
    cursorX: cursor.x,
    cursorY: cursor.y,
    windowX: bounds.x,
    windowY: bounds.y,
  };
  return true;
});
ipcMain.handle("pet:drag-move", () => {
  if (!petWindow || !petDrag) return;
  const cursor = screen.getCursorScreenPoint();
  petWindow.setPosition(
    petDrag.windowX + cursor.x - petDrag.cursorX,
    petDrag.windowY + cursor.y - petDrag.cursorY,
  );
});
ipcMain.handle("pet:drag-end", () => {
  petDrag = null;
  schedulePetStateSave();
});
ipcMain.handle("pet:is-open", () => Boolean(petWindow));
ipcMain.handle("pet:main-focused", () => mainWindow?.isFocused() ?? false);
ipcMain.handle("window:set-zoom", (_event, scale: number) => {
  zoomFactor = scale;
  mainWindow?.webContents.setZoomFactor(scale);
  petWindow?.webContents.setZoomFactor(scale);
});
ipcMain.handle("update:check", async (_event, url: string) => {
  if (!url) throw new Error("未配置更新地址");
  autoUpdater.autoDownload = false;
  autoUpdater.setFeedURL({ provider: "generic", url });
  const result = await autoUpdater.checkForUpdates();
  return { version: result?.updateInfo.version ?? null };
});
ipcMain.handle("update:download", async () => {
  await autoUpdater.downloadUpdate();
});
ipcMain.handle("update:install", () => {
  autoUpdater.quitAndInstall();
});

autoUpdater.on("download-progress", (progress) => {
  mainWindow?.webContents.send("update:status", {
    state: "downloading",
    percent: progress.percent,
  });
});
autoUpdater.on("update-downloaded", (info) => {
  mainWindow?.webContents.send("update:status", {
    state: "downloaded",
    version: info.version,
  });
});
autoUpdater.on("error", (error) => {
  mainWindow?.webContents.send("update:status", {
    state: "error",
    message: String(error),
  });
});

void app.whenReady().then(async () => {
  try {
    startServices();
    await waitFor(`http://127.0.0.1:${corePort}/core/v1/modules`);
    await waitFor(`http://127.0.0.1:${apiPort}/api/v1/health`);
    createWindow();
  } catch (error) {
    dialog.showErrorBox("yumeFriend 启动失败", String(error));
    app.quit();
  }
});

app.on("before-quit", () => {
  for (const child of children) {
    child.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
