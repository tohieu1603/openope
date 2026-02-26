/**
 * Copy zalozcajs plugin dependencies to dist-extensions/zalozcajs/node_modules/
 * Recursively resolves ALL transitive production dependencies from pnpm store.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const PLUGIN_DIR = path.join(__dirname, 'dist-extensions', 'zalozcajs');
const PLUGIN_NM = path.join(PLUGIN_DIR, 'node_modules');
const PNPM_DIR = path.join(ROOT, 'node_modules', '.pnpm');

// Skip these packages (workspace/dev only, handled by jiti alias)
const SKIP_PACKAGES = new Set(['openclaw']);

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    const realPath = fs.realpathSync(srcPath);
    const stat = fs.statSync(realPath);
    if (stat.isDirectory()) {
      copyDirSync(realPath, destPath);
    } else {
      fs.copyFileSync(realPath, destPath);
    }
  }
  return true;
}

function findPackageInPnpm(pkgName) {
  // First check root node_modules (some are hoisted)
  const rootNm = path.join(ROOT, 'node_modules', pkgName);
  if (fs.existsSync(rootNm)) {
    return fs.realpathSync(rootNm);
  }
  // Search pnpm virtual store
  const pnpmName = pkgName.replace('/', '+');
  try {
    const dirs = fs.readdirSync(PNPM_DIR).filter(d => d.startsWith(pnpmName + '@'));
    if (dirs.length > 0) {
      const candidate = path.join(PNPM_DIR, dirs[0], 'node_modules', ...pkgName.split('/'));
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/** Read production dependencies from a package.json */
function readProductionDeps(pkgDir) {
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    return Object.keys(pkg.dependencies || {});
  } catch {
    return [];
  }
}

/** Recursively collect all production dependencies */
function collectAllDeps(seedDeps) {
  const visited = new Set();
  const queue = [...seedDeps];

  while (queue.length > 0) {
    const pkgName = queue.shift();
    if (visited.has(pkgName) || SKIP_PACKAGES.has(pkgName)) continue;
    visited.add(pkgName);

    const pkgDir = findPackageInPnpm(pkgName);
    if (!pkgDir) continue;

    const transitiveDeps = readProductionDeps(pkgDir);
    for (const dep of transitiveDeps) {
      if (!visited.has(dep)) {
        queue.push(dep);
      }
    }
  }

  return visited;
}

// --- Main ---

// Read the plugin's own production deps as seeds
const pluginDeps = readProductionDeps(PLUGIN_DIR);
console.log(`Seed deps from plugin package.json: ${pluginDeps.join(', ')}`);

// Recursively resolve all transitive deps
const allDeps = collectAllDeps(pluginDeps);
console.log(`Total dependencies to install: ${allDeps.size}`);

// Clean existing node_modules to start fresh
if (fs.existsSync(PLUGIN_NM)) {
  fs.rmSync(PLUGIN_NM, { recursive: true });
}
fs.mkdirSync(PLUGIN_NM, { recursive: true });

let ok = 0, missing = 0;
for (const pkg of [...allDeps].sort()) {
  const destDir = path.join(PLUGIN_NM, ...pkg.split('/'));
  const srcDir = findPackageInPnpm(pkg);
  if (srcDir && copyDirSync(srcDir, destDir)) {
    console.log(`  ✓ ${pkg}`);
    ok++;
  } else {
    console.warn(`  ✗ ${pkg} (not found)`);
    missing++;
  }
}

console.log(`\nDone: ${ok} copied, ${missing} missing.`);
if (missing > 0) {
  console.warn('Warning: missing packages may cause runtime errors.');
}
