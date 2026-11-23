import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
fs.copyFileSync(
  path.join(root, "electron", "preload.cjs"),
  path.join(root, "dist-electron", "preload.cjs"),
);
