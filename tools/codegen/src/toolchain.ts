import { spawnSync } from "node:child_process";
import { platform, arch } from "node:os";

const version = (command: string, args: string[]): string => {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) return "unavailable";
  return `${result.stdout}${result.stderr}`.trim().split("\n").slice(0, 3).join(" ");
};
// Use at task launch (CI and locally) so caches cannot cross toolchain versions.
export function fingerprint(): string {
  return JSON.stringify({
    os: platform(),
    arch: arch(),
    node: process.version,
    python: version("uv", [
      "run",
      "--package",
      "ateve",
      "--frozen",
      "--no-sync",
      "python",
      "--version",
    ]),
    uv: version("uv", ["--version"]),
    java: version("java", ["-version"]),
    maven: version("mvn", ["--version"]),
  });
}
