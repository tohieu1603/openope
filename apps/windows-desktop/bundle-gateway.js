/**
 * Re-bundle the gateway dist for Electron packaging.
 * tsdown outputs chunks with external npm deps; this script uses esbuild
 * to produce a single self-contained entry.js with all deps inlined.
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

const STUB_PACKAGES = [
  '@node-llama-cpp', 'node-llama-cpp',
  'playwright-core', 'chromium-bidi',
  '@napi-rs', 'sharp', 'better-sqlite3',
  '@lydell/node-pty', 'authenticate-pam',
  '@matrix-org/matrix-sdk-crypto-nodejs',
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
    external: ['node:*'],
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
