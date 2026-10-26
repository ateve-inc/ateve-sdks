import type { UserConfig } from "tsdown";

const config: UserConfig = {
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: false,
  clean: true,
  target: "es2022",
  platform: "neutral",
  // Bundle the ESM-only transport so both entry points stay self-contained.
  deps: { alwaysBundle: ["ofetch"], onlyBundle: ["ofetch"] },
  cjsDefault: false,
  outExtensions: ({ format }) => ({
    js: format === "es" ? ".mjs" : ".js",
    dts: format === "es" ? ".d.mts" : ".d.ts",
  }),
};

export default config;
