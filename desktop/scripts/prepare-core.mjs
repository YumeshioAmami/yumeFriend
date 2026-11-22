import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const productRoot = path.resolve(import.meta.dirname, "../..");
const coreRepo = process.env.YUMECORE_REPO ?? path.resolve(productRoot, "../yumeCore");
const gradle = path.join(coreRepo, process.platform === "win32" ? "gradlew.bat" : "gradlew");

const result = spawnSync(`"${gradle}" hostJar --no-daemon`, {
  cwd: coreRepo,
  stdio: "inherit",
  shell: true,
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const resources = path.join(productRoot, "desktop", "resources");
fs.mkdirSync(resources, { recursive: true });
fs.copyFileSync(
  path.join(coreRepo, "build", "libs", "yumeCoreHost.jar"),
  path.join(resources, "yumeCoreHost.jar"),
);
