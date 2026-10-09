import { readFileSync } from "node:fs";
import path from "node:path";

export type Phase = "alpha" | "beta" | "rc";
type Bump = "patch" | "minor" | "major";
interface Version {
  numbers: [number, number, number];
  phase?: Phase;
  sequence?: number;
}

export function parseVersion(value: string): Version {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(value);
  if (!match) throw new Error(`Invalid version ${value}; use x.y.z or x.y.z-alpha|beta|rc.N.`);
  const numbers = match.slice(1, 4).map(Number) as Version["numbers"];
  const sequence = match[5] === undefined ? undefined : Number(match[5]);
  if (![...numbers, ...(sequence === undefined ? [] : [sequence])].every(Number.isSafeInteger))
    throw new Error(`Version component exceeds the safe integer range: ${value}`);
  return { numbers, phase: match[4] as Phase | undefined, sequence };
}

export function pythonVersion(value: string): string {
  const { numbers, phase, sequence } = parseVersion(value);
  const suffix = phase ? `${{ alpha: "a", beta: "b", rc: "rc" }[phase]}${sequence}` : "";
  return `${numbers.join(".")}${suffix}`;
}

export function distTag(value: string): string {
  return parseVersion(value).phase ?? "latest";
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left),
    b = parseVersion(right);
  const ranks = { alpha: 0, beta: 1, rc: 2, stable: 3 };
  const parts = (v: Version) => [...v.numbers, ranks[v.phase ?? "stable"], v.sequence ?? 0];
  const aa = parts(a),
    bb = parts(b);
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) return aa[i] > bb[i] ? 1 : -1;
  }
  return 0;
}

export function nextVersion(current: string, args: string[]): string {
  const previous = parseVersion(current);
  let bump: Bump | undefined;
  let explicit: string | undefined;
  let phase: Phase | undefined;
  const arguments_ = args[0] === "--" ? args.slice(1) : args;
  for (let i = 0; i < arguments_.length; i++) {
    const arg = arguments_[i];
    if (["--patch", "--minor", "--major"].includes(arg)) {
      if (bump || explicit) throw new Error("Choose exactly one bump level or explicit version.");
      bump = arg.slice(2) as Bump;
    } else if (/^--\d/.test(arg)) {
      if (bump || explicit) throw new Error("Choose exactly one bump level or explicit version.");
      explicit = arg.slice(2);
      parseVersion(explicit);
    } else {
      const candidate =
        arg === "--tag" ? arguments_[++i] : arg.startsWith("--tag=") ? arg.slice(6) : arg.slice(2);
      if (!arg.startsWith("--") || !["alpha", "beta", "rc"].includes(candidate))
        throw new Error(
          `Unknown argument ${arg}; use --minor, --major, --x.y.z or --tag alpha|beta|rc.`,
        );
      if (phase) throw new Error("Choose exactly one prerelease tag.");
      phase = candidate as Phase;
    }
  }
  let numbers: Version["numbers"] = [...previous.numbers];
  if (explicit) {
    if (phase && parseVersion(explicit).phase)
      throw new Error("An explicit prerelease version cannot also take a prerelease tag.");
    numbers = parseVersion(explicit).numbers;
  } else if (bump || !previous.phase) {
    const index = { major: 0, minor: 1, patch: 2 }[bump ?? "patch"];
    numbers[index]++;
    for (let i = index + 1; i < numbers.length; i++) numbers[i] = 0;
  }
  const base = numbers.join(".");
  const sequence =
    previous.phase === phase && previous.numbers.join(".") === base
      ? (previous.sequence ?? 0) + 1
      : 1;
  const target = phase ? `${base}-${phase}.${sequence}` : (explicit ?? base);
  if (compareVersions(target, current) <= 0)
    throw new Error(`New version ${target} must be greater than current version ${current}.`);
  return target;
}

interface VersionTarget {
  file: string;
  pattern: RegExp;
  python?: boolean;
}

const jsonVersion = /(^\s*"version":\s*")([^"]+)(")/m;
export const versionTargets: VersionTarget[] = [
  ...["packages/js", "packages/contract", "packages/java", "tools/codegen"].map((directory) => ({
    file: `${directory}/package.json`,
    pattern: jsonVersion,
  })),
  { file: "packages/python/pyproject.toml", pattern: /(^version = ")([^"]+)(")/m, python: true },
  {
    file: "uv.lock",
    pattern: /(\[\[package\]\]\r?\nname = "ateve"\r?\nversion = ")([^"]+)(")/,
    python: true,
  },
  {
    file: "packages/java/pom.xml",
    pattern: /(<artifactId>ateve-java<\/artifactId>\s*<version>)([^<]+)(<\/version>)/,
  },
  { file: "packages/js/src/client.ts", pattern: /(\bexport const VERSION = ")([^"]+)(")/ },
  {
    file: "packages/python/src/ateve/_version.py",
    pattern: /(^__version__ = ")([^"]+)(")/m,
    python: true,
  },
  {
    file: "packages/java/src/main/java/ai/ateve/AteveClient.java",
    pattern: /(\bstatic final String VERSION = ")([^"]+)(")/,
  },
  {
    file: "packages/contract/openapi.json",
    pattern: /("info":\s*\{[\s\S]*?"version":\s*")([^"]+)(")/,
  },
  {
    file: "packages/java/README.md",
    pattern: /(<artifactId>ateve-java<\/artifactId>\s*<version>)([^<]+)(<\/version>)/,
  },
];

export function checkVersions(base: string, releaseTag?: string): string {
  const version = JSON.parse(readFileSync(path.join(base, "packages/js/package.json"), "utf8"))
    .version as string;
  parseVersion(version);
  for (const target of versionTargets) {
    const content = readFileSync(path.join(base, target.file), "utf8");
    const matches = [
      ...content.matchAll(new RegExp(target.pattern.source, `${target.pattern.flags}g`)),
    ];
    if (matches.length !== 1) throw new Error(`Expected one version field in ${target.file}.`);
    const expected = target.python ? pythonVersion(version) : version;
    if (matches[0][2] !== expected)
      throw new Error(
        `${target.file} version ${matches[0][2]} differs from SDK version ${expected}`,
      );
  }
  if (releaseTag !== undefined && releaseTag.replace(/^v/, "") !== version)
    throw new Error(
      `Release tag version ${releaseTag.replace(/^v/, "")} differs from SDK version ${version}`,
    );
  return version;
}
