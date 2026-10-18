import { cp, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output')) {
  throw new Error('Usage: node scripts/package-local.mjs [--output dist/releases/name]');
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const output = resolve(root, args[1] ?? `dist/releases/BOTCreplay-${process.platform}-${process.arch}-${stamp}`);
const releaseRoot = resolve(root, 'dist/releases');
const within = (base, path) => {
  const part = relative(base, path);
  return !!part && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
};
if (!within(releaseRoot, output) || dirname(output) !== releaseRoot) throw new Error('Release output must be a new directory directly inside dist/releases/.');
await mkdir(releaseRoot, { recursive: true });
const resolvedReleaseRoot = await realpath(releaseRoot);
if (resolvedReleaseRoot !== releaseRoot) throw new Error('The release directory must not be a link to another location.');

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const lockText = await readFile(resolve(root, 'package-lock.json'), 'utf8');
const lock = JSON.parse(lockText);
if (lock.lockfileVersion !== 3 || !lock.packages) throw new Error('A version 3 package-lock.json is required.');
const sourceFiles = ['dist/web/index.html', 'dist/server/server/main.js', 'dist/viewer/viewer.js', 'dist/viewer/viewer.css', 'scripts/start-local.mjs', 'start-botcreplay.cmd'];
for (const path of sourceFiles) {
  if (!(await stat(resolve(root, path))).isFile()) throw new Error(`Build output is missing: ${path}. Run npm run build first.`);
}

// A new directory keeps earlier releases and their local replay data intact.
await mkdir(output);
for (const folder of ['dist/web', 'dist/server', 'dist/viewer']) {
  await cp(resolve(root, folder), resolve(output, folder), { recursive: true, dereference: false, errorOnExist: true, force: false });
}
await mkdir(resolve(output, 'scripts'));
await cp(resolve(root, 'scripts/start-local.mjs'), resolve(output, 'scripts/start-local.mjs'));
await cp(resolve(root, 'start-botcreplay.cmd'), resolve(output, 'start-botcreplay.cmd'));

const dependencies = [];
const omittedOptionalDependencies = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || entry.dev) continue;
  if (!/^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/.test(path) || entry.link) {
    throw new Error(`Unsupported dependency layout: ${path}`);
  }
  const source = resolve(root, path);
  try {
    const info = await stat(source);
    if (!info.isDirectory()) throw new Error(`Dependency is not a directory: ${path}`);
  } catch (error) {
    if (entry.optional && error.code === 'ENOENT') {
      omittedOptionalDependencies.push(path);
      continue;
    }
    throw new Error(`Runtime dependency is missing: ${path}. Run npm ci before packaging.`, { cause: error });
  }
  await mkdir(dirname(resolve(output, path)), { recursive: true });
  await cp(source, resolve(output, path), { recursive: true, dereference: false });
  dependencies.push({ path, version: entry.version });
}

const runtimePackage = {
  name: packageJson.name,
  version: packageJson.version,
  private: true,
  type: 'module',
  engines: packageJson.engines,
  scripts: { start: packageJson.scripts.start, 'start:local': packageJson.scripts['start:local'] },
  dependencies: packageJson.dependencies,
};
await writeFile(resolve(output, 'package.json'), JSON.stringify(runtimePackage, null, 2) + '\n');
await writeFile(resolve(output, 'package-lock.json'), lockText);
const manifest = {
  format: 'botcreplay-local-release-v1',
  createdAt: new Date().toISOString(),
  version: packageJson.version,
  platform: process.platform,
  architecture: process.arch,
  builtWithNode: process.version,
  nodeRuntimeIncluded: false,
  lockSha256: createHash('sha256').update(lockText).digest('hex'),
  dependencies,
  omittedOptionalDependencies,
};
await writeFile(resolve(output, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output, runtimePackages: dependencies.length, platform: process.platform, architecture: process.arch, nodeRuntimeIncluded: false }, null, 2));
