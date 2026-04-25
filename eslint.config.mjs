// Root flat ESLint config for the Event Fleet monorepo.
// Apps inherit from this; ts-only files get strict TS rules; tests relax `any`.

import base from "@event-fleet/config-eslint";

export default [
  ...base,
  {
    files: ["apps/api/**/*.ts"],
    rules: {
      // NestJS pattern: empty modules with only decorators are common and
      // expected (e.g. PrismaModule). Allow them.
      "@typescript-eslint/no-extraneous-class": [
        "error",
        { allowWithDecorator: true, allowEmpty: true },
      ],
      // Decorator metadata reflection produces unsafe member accesses.
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
  {
    files: [
      "apps/api/**/*.spec.ts",
      "apps/api/**/*.e2e-spec.ts",
      "apps/api/**/*.integration-spec.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      // Test mocks frequently use these patterns:
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // ─── Per-layer dependency rules (ADR 0005) ──────────────────────────────
  // domain/ depends on nothing else in its own module; cross-layer imports forbidden.
  {
    files: ["apps/api/src/modules/*/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/application/**", "**/infrastructure/**", "**/interface/**"],
              message:
                "Domain layer cannot import from application/infrastructure/interface (ADR 0005).",
            },
            {
              group: ["**/modules/!(*)/*", "**/modules/*/!(domain)/**"],
              message:
                "Domain layer cannot reach into other modules. Communicate via events or public application services.",
            },
          ],
        },
      ],
    },
  },
  // application/ depends on domain only; infrastructure access via ports.
  {
    files: ["apps/api/src/modules/*/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/infrastructure/**", "**/interface/**"],
              message:
                "Application layer cannot import infrastructure or interface implementations directly. Use ports (ADR 0005).",
            },
          ],
        },
      ],
    },
  },
  // infrastructure/ implements application ports; cannot import interface/.
  {
    files: ["apps/api/src/modules/*/infrastructure/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/interface/**"],
              message: "Infrastructure layer cannot import interface (HTTP) layer (ADR 0005).",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "**/.prisma/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/coverage/**",
      // Seed runs via tsx with its own loader; not part of any tsconfig
      // include so projectService can't resolve it. Lint-staged would
      // otherwise crash on commits that touch this file.
      "prisma/**",
      // Admin / ops CLI scripts run via tsx outside of any tsconfig include
      // — same projectService friction as seed.
      "apps/api/scripts/**",
      // apps/admin runs its own next/core-web-vitals lint pipeline via
      // `next lint`. Excluding here keeps the strict TS rules from
      // double-flagging Next-generated files (next-env.d.ts triple-slash,
      // tailwind.config.ts outside projectService include).
      "apps/admin/**",
    ],
  },
];
