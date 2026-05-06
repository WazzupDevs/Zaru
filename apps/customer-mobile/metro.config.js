// Metro config — pnpm monorepo aware.
//
// Two non-default things here:
//   1. `watchFolders` — Metro by default only watches the project root.
//      In a monorepo we point it at the workspace root so changes to
//      `packages/shared-types/dist/**` trigger HMR in the mobile app.
//   2. `nodeModulesPaths` — pnpm hoists nothing by default. We tell
//      Metro to look in both the app's local `node_modules` AND the
//      workspace root `node_modules` (where the pnpm store symlinks
//      hoisted shared deps).
//
// `disableHierarchicalLookup` stays default (false) so package siblings
// can still resolve each other via standard Node resolution.

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = withNativeWind(config, { input: "./global.css" });
