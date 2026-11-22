import { expect, test } from "vitest";
import { APP_VERSION } from "./version";

test("app version", () => {
  expect(APP_VERSION).toBe("0.1.0");
});
