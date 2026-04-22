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
    files: ["apps/api/**/*.spec.ts", "apps/api/**/*.e2e-spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },
  {
    ignores: [
      "**/.prisma/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/coverage/**",
    ],
  },
];
