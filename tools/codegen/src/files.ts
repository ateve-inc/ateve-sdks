import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { banner, readJson } from "./generator.ts";
import type { ModelFiles } from "./types.ts";

const manifest = ".generated-models.json";
function safe(base: string, file: string): string {
  if (!file.startsWith("src/") || file.includes("..") || path.isAbsolute(file))
    throw new Error(`Unsafe generated path: ${file}`);
  return path.join(base, file);
}
function previousFiles(base: string): Set<string> {
  const entries = new Set(
    existsSync(path.join(base, manifest)) ? readJson<string[]>(path.join(base, manifest)) : [],
  );
  const visit = (directory: string): void => {
    if (!existsSync(directory)) return;
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) visit(absolute);
      else if (/\.(ts|py|java)$/.test(item.name) && readFileSync(absolute, "utf8").includes(banner))
        entries.add(path.relative(base, absolute).split(path.sep).join("/"));
    }
  };
  visit(path.join(base, "src"));
  return entries;
}

export function synchronize(base: string, files: ModelFiles, check = false): string[] {
  const expected = Object.keys(files).sort();
  for (const file of expected) safe(base, file);
  const changes: string[] = [];
  const obsolete = [...previousFiles(base)].filter((file) => !expected.includes(file));
  for (const file of obsolete) {
    const absolute = safe(base, file);
    if (existsSync(absolute) && !readFileSync(absolute, "utf8").includes(banner))
      throw new Error(`Refusing to remove hand-written file ${absolute}`);
    changes.push(`obsolete: ${file}`);
    if (!check) rmSync(absolute, { force: true });
  }
  for (const [file, content] of Object.entries(files)) {
    const absolute = safe(base, file);
    if (!existsSync(absolute) || readFileSync(absolute, "utf8") !== content) {
      changes.push(`changed or missing: ${file}`);
      if (!check) {
        mkdirSync(path.dirname(absolute), { recursive: true });
        writeFileSync(absolute, content);
      }
    }
  }
  const manifestContent = JSON.stringify(expected, null, 2) + "\n";
  if (
    !existsSync(path.join(base, manifest)) ||
    readFileSync(path.join(base, manifest), "utf8") !== manifestContent
  ) {
    changes.push(`changed or missing: ${manifest}`);
    if (!check) writeFileSync(path.join(base, manifest), manifestContent);
  }
  if (check && changes.length)
    throw new Error(`Generated models drifted in ${base}:\n${changes.join("\n")}`);
  return changes;
}
