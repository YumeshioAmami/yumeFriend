import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(currentDir, "..");
const repoRoot = path.resolve(appRoot, "..");
const corePort = Number(process.env.YUMECORE_PORT ?? "47895");
const apiPort = Number(process.env.YUMEFRIEND_PORT ?? "47891");
const children: ChildProcess[] = [];
let petWindow: BrowserWindow | null = null;

function startServices(): void {
  const userData = path.join(repoRoot, "user_data");
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
    webPreferences: {
      preload: path.join(currentDir, "preload.js"),
    },
  });
  window.on("closed", () => {
    petWindow?.close();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void window.loadURL(devUrl);
  } else {
    void window.loadFile(path.join(currentDir, "../dist/index.html"));
  }
}

function createPetWindow(): void {
  if (petWindow) {
    petWindow.focus();
    return;
  }
  petWindow = new BrowserWindow({
    width: 220,
    height: 240,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(currentDir, "preload.js"),
    },
  });
  petWindow.on("closed", () => {
    petWindow = null;
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void petWindow.loadURL(`${devUrl}?pet=1`);
  } else {
    void petWindow.loadFile(path.join(currentDir, "../dist/index.html"), {
      query: { pet: "1" },
    });
  }
}

ipcMain.handle("pet:open", () => createPetWindow());
ipcMain.handle("pet:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
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
