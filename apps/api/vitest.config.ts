import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * NestJS uses reflect-metadata + experimental decorators for DI.
 * Vitest's default esbuild transformer drops the metadata that
 * `@Injectable()` constructors rely on, so we route TS through SWC
 * with `legacyDecorator + decoratorMetadata` enabled.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        target: "es2022",
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts", "test/**/*.e2e-spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "**/*.spec.ts",
        "**/*.e2e-spec.ts",
        "**/dist/**",
        "**/node_modules/**",
        "src/main.ts",
      ],
    },
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
