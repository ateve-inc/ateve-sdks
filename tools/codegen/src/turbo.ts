import { spawnSync } from "node:child_process";
import { fingerprint } from "./toolchain.ts";
const result = spawnSync("turbo", process.argv.slice(2), {
  stdio: "inherit",
  env: { ...process.env, ATEVE_TOOLCHAIN: fingerprint() },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
