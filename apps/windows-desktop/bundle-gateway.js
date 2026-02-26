/**
 * Re-bundle the gateway dist for Electron packaging.
 * tsdown outputs chunks with external npm deps; this script uses esbuild
 * to produce a single self-contained entry.js with all deps inlined.
 *
 * Native modules (sharp, @lydell/node-pty) are marked as external and
 * copied to dist-gateway/node_modules/ for runtime resolution.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(__dirname, 'dist-gateway');

const pnpmDir = path.join(ROOT, 'node_modules', '.pnpm');
const esbuildDirs = fs.readdirSync(pnpmDir).filter(d => d.startsWith('esbuild@'));
if (!esbuildDirs.length) {
  console.error('esbuild not found in pnpm store');
  process.exit(1);
}
const esbuildPkg = path.join(pnpmDir, esbuildDirs[0], 'node_modules', 'esbuild');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// Packages replaced with empty stub (truly optional or unused on Windows)
const STUB_PACKAGES = [
  '@node-llama-cpp', 'node-llama-cpp',
  'chromium-bidi',                          // BiDi protocol — not needed for CDP connections
  '@napi-rs', 'better-sqlite3',
  'authenticate-pam',
  '@matrix-org/matrix-sdk-crypto-nodejs',
];

// Native modules: marked external in esbuild, copied to dist-gateway/node_modules/
const NATIVE_EXTERNAL_PACKAGES = [
  'sharp',
  '@lydell/node-pty',
];

// Pure-JS modules that must be external because esbuild bundling breaks their
// complex CJS↔ESM wrapper / lazy-init patterns at runtime.
// Copied to dist-gateway/node_modules/ for resolution via NODE_PATH.
const EXTERNAL_JS_PACKAGES = [
  'playwright-core',    // Browser CDP connections — pure JS, ~6 MB, no native binaries
];

const stubRegexSrc = '^(' + STUB_PACKAGES.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(\/|$)';

const STUB_FILE = path.join(__dirname, '_stub.cjs');
fs.writeFileSync(STUB_FILE, 'module.exports = {};');

const script = `
const esbuild = require(${JSON.stringify(esbuildPkg)});

const stubPlugin = {
  name: 'stub-optional-packages',
  setup(build) {
    const re = new RegExp(${JSON.stringify(stubRegexSrc)});
    build.onResolve({ filter: /.*/ }, (args) => {
      if (re.test(args.path)) {
        return { path: ${JSON.stringify(STUB_FILE)} };
      }
    });
  },
};

async function main() {
  const result = await esbuild.build({
    entryPoints: [${JSON.stringify(path.join(DIST, 'entry.js'))}],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile: ${JSON.stringify(path.join(OUT, 'entry.js'))},
    external: ['node:*', ${[...NATIVE_EXTERNAL_PACKAGES, ...EXTERNAL_JS_PACKAGES].map(p => JSON.stringify(p)).join(', ')}],
    plugins: [stubPlugin],
    resolveExtensions: ['.js', '.mjs', '.cjs', '.json'],
    nodePaths: [${JSON.stringify(path.join(ROOT, 'node_modules'))}],
    loader: { '.node': 'file' },
    packages: 'bundle',
    logLevel: 'warning',
    banner: {
      js: 'import{createRequire as __esbuild_cr}from"node:module";var require=__esbuild_cr(import.meta.url);',
    },
  });

  if (result.errors.length) {
    console.error('Build errors:', result.errors);
    process.exit(1);
  }

  const stat = require('fs').statSync(${JSON.stringify(path.join(OUT, 'entry.js'))});
  console.log('Gateway bundled: dist-gateway/entry.js (' + (stat.size / 1024 / 1024).toFixed(1) + ' MB)');
}

main().catch(e => { console.error(e); process.exit(1); });
`;

const tmpScript = path.join(__dirname, '_bundle-tmp.cjs');
fs.writeFileSync(tmpScript, script);
try {
  execSync(`node "${tmpScript}"`, { stdio: 'inherit', cwd: ROOT });
} finally {
  fs.unlinkSync(tmpScript);
  if (fs.existsSync(STUB_FILE)) fs.unlinkSync(STUB_FILE);
}

// --- Bundle plugin-sdk for runtime plugin loading ---
// The jiti loader resolves openclaw/plugin-sdk via an alias that walks up from
// entry.js looking for dist/plugin-sdk/index.js. We bundle it standalone so
// plugins in dist-extensions/ can import from it at runtime.
const PLUGIN_SDK_ENTRY = path.join(DIST, 'plugin-sdk', 'index.js');
const PLUGIN_SDK_OUT = path.join(OUT, 'dist', 'plugin-sdk');

if (fs.existsSync(PLUGIN_SDK_ENTRY)) {
  fs.mkdirSync(PLUGIN_SDK_OUT, { recursive: true });
  const sdkScript = `
const esbuild = require(${JSON.stringify(esbuildPkg)});

const stubPlugin = {
  name: 'stub-optional-packages',
  setup(build) {
    const re = new RegExp(${JSON.stringify(stubRegexSrc)});
    build.onResolve({ filter: /.*/ }, (args) => {
      if (re.test(args.path)) {
        return { path: ${JSON.stringify(STUB_FILE)} };
      }
    });
  },
};

async function main() {
  const result = await esbuild.build({
    entryPoints: [${JSON.stringify(PLUGIN_SDK_ENTRY)}],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile: ${JSON.stringify(path.join(PLUGIN_SDK_OUT, 'index.js'))},
    external: ['node:*', ${[...NATIVE_EXTERNAL_PACKAGES, ...EXTERNAL_JS_PACKAGES].map(p => JSON.stringify(p)).join(', ')}],
    plugins: [stubPlugin],
    resolveExtensions: ['.js', '.mjs', '.cjs', '.json'],
    nodePaths: [${JSON.stringify(path.join(ROOT, 'node_modules'))}],
    packages: 'bundle',
    logLevel: 'warning',
    banner: {
      js: 'import{createRequire as __esbuild_cr}from"node:module";var require=__esbuild_cr(import.meta.url);',
    },
  });
  if (result.errors.length) {
    console.error('plugin-sdk build errors:', result.errors);
    process.exit(1);
  }
  const stat = require('fs').statSync(${JSON.stringify(path.join(PLUGIN_SDK_OUT, 'index.js'))});
  console.log('Plugin SDK bundled: dist-gateway/dist/plugin-sdk/index.js (' + (stat.size / 1024 / 1024).toFixed(1) + ' MB)');
}

main().catch(e => { console.error(e); process.exit(1); });
`;
  const sdkTmpScript = path.join(__dirname, '_bundle-sdk-tmp.cjs');
  // Re-create stub file if cleaned up
  if (!fs.existsSync(STUB_FILE)) fs.writeFileSync(STUB_FILE, 'module.exports = {};');
  fs.writeFileSync(sdkTmpScript, sdkScript);
  try {
    execSync(`node "${sdkTmpScript}"`, { stdio: 'inherit', cwd: ROOT });
  } finally {
    fs.unlinkSync(sdkTmpScript);
    if (fs.existsSync(STUB_FILE)) fs.unlinkSync(STUB_FILE);
  }
} else {
  console.warn('Plugin SDK entry not found, skipping plugin-sdk bundle');
}

// --- Copy native modules to dist-gateway/node_modules/ ---

/**
 * Recursively copy directory, dereferencing symlinks (pnpm uses symlinks).
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    // Resolve symlinks (pnpm node_modules are symlinked)
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

const nmRoot = path.join(ROOT, 'node_modules');
const nmOut = path.join(OUT, 'node_modules');

console.log('Copying native modules to dist-gateway/node_modules/...');

for (const pkg of NATIVE_EXTERNAL_PACKAGES) {
  const srcDir = path.join(nmRoot, pkg);
  const destDir = path.join(nmOut, pkg);
  // Clean previous copy
  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true });
  if (copyDirSync(srcDir, destDir)) {
    console.log(`  ✓ ${pkg}`);
  } else {
    console.warn(`  ✗ ${pkg} (not found — will fail gracefully at runtime)`);
  }
}

// Copy pure-JS external packages
console.log('Copying external JS packages to dist-gateway/node_modules/...');
for (const pkg of EXTERNAL_JS_PACKAGES) {
  const srcDir = path.join(nmRoot, pkg);
  const destDir = path.join(nmOut, pkg);
  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true });
  if (copyDirSync(srcDir, destDir)) {
    console.log(`  ✓ ${pkg}`);
  } else {
    console.warn(`  ✗ ${pkg} (not found — features depending on it will be unavailable)`);
  }
}

// sharp runtime dependencies (required for initialization, not bundled by esbuild)
// pnpm doesn't hoist these — resolve from pnpm store if not in root node_modules
const SHARP_DEPENDENCIES = ['detect-libc', '@img/colour'];
console.log('Copying sharp runtime dependencies...');
for (const pkg of SHARP_DEPENDENCIES) {
  let srcDir = path.join(nmRoot, pkg);
  if (!fs.existsSync(srcDir)) {
    // Search pnpm store: .pnpm/<pkg-name-with-+>@*/node_modules/<pkg>
    const pnpmName = pkg.replace('/', '+');
    const pnpmMatches = fs.readdirSync(pnpmDir).filter(d => d.startsWith(pnpmName + '@'));
    if (pnpmMatches.length) {
      srcDir = path.join(pnpmDir, pnpmMatches[0], 'node_modules', ...pkg.split('/'));
    }
  }
  const destDir = path.join(nmOut, ...pkg.split('/'));
  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true });
  if (copyDirSync(srcDir, destDir)) {
    console.log(`  ✓ ${pkg}`);
  } else {
    console.warn(`  ✗ ${pkg} (not found — sharp may fail at runtime)`);
  }
}

// sharp requires platform-specific @img/sharp-<platform>-<arch> binary
const sharpPlatformPkg = `@img/sharp-${process.platform}-${process.arch}`;
const sharpPlatformSrc = path.join(nmRoot, sharpPlatformPkg);
if (fs.existsSync(sharpPlatformSrc)) {
  const destDir = path.join(nmOut, sharpPlatformPkg);
  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true });
  if (copyDirSync(sharpPlatformSrc, destDir)) {
    console.log(`  ✓ ${sharpPlatformPkg} (platform binary)`);
  }
} else {
  // Try to find it in pnpm store
  const imgDirs = fs.readdirSync(pnpmDir).filter(d => d.startsWith(`@img+sharp-${process.platform}-${process.arch}@`));
  if (imgDirs.length) {
    const imgPkg = path.join(pnpmDir, imgDirs[0], 'node_modules', sharpPlatformPkg);
    const destDir = path.join(nmOut, sharpPlatformPkg);
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true });
    if (copyDirSync(imgPkg, destDir)) {
      console.log(`  ✓ ${sharpPlatformPkg} (platform binary, from pnpm store)`);
    }
  } else {
    console.warn(`  ✗ ${sharpPlatformPkg} (not found — sharp image ops will fail gracefully)`);
  }
}

// @lydell/node-pty may need prebuilt binaries — check for them
const ptyPrebuildDir = path.join(nmOut, '@lydell', 'node-pty', 'prebuilds');
if (fs.existsSync(ptyPrebuildDir)) {
  console.log('  ✓ @lydell/node-pty prebuilds found');
} else {
  // Check build/Release for compiled binary
  const ptyBuildDir = path.join(nmOut, '@lydell', 'node-pty', 'build', 'Release');
  if (fs.existsSync(ptyBuildDir)) {
    console.log('  ✓ @lydell/node-pty build/Release found');
  }
}

console.log('Native modules copied.');
