import { defineConfig } from "tsup";

/**
 * Dual-format build (ESM + CJS) so the package can be require()'d by the
 * NestJS dev runtime AND import()'d by Vitest / Next bundlers. The previous
 * tsc-only build emitted ESM only, which broke `nest start` with
 * ERR_PACKAGE_PATH_NOT_EXPORTED.
 *
 * Sub-path entries mirror the package.json `exports` map so each one gets
 * its own .js/.cjs/.d.ts triple under dist/.
 */
export default defineConfig({
  entry: ["src/index.ts", "src/common/index.ts", "src/identity/index.ts", "src/errors/index.ts"],
  format: ["esm", "cjs"],
  // Force `.js` for ESM (instead of tsup default `.mjs`) so the package.json
  // `exports` map can point at `.js` for `import` and `.cjs` for `require`.
  // We dropped `"type": "module"` so Node uses extension to decide module kind.
  outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
  dts: {
    resolve: true,
    entry: ["src/index.ts", "src/common/index.ts", "src/identity/index.ts", "src/errors/index.ts"],
  },
  // Dedicated tsconfig that disables `incremental` (root base has it on,
  // which trips tsup's dts emitter with TS5074).
  tsconfig: "./tsconfig.tsup.json",
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "node20",
  outDir: "dist",
});
