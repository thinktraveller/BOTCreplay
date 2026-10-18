import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, open, access, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 5173);
const url = `http://127.0.0.1:${port}`;
async function healthy() {
  try {
    const response = await fetch(url + '/api/health', { signal: AbortSignal.timeout(1000) });
    if (!response.ok) return false;
    const data = await response.json();
    return data.service === 'BOTCreplay' && data.schemaVersion === '0.2.0';
  } catch { return false; }
}
function portOccupied() {
  return new Promise(done => {
    const connection = createConnection({ host: '127.0.0.1', port });
    const finish = value => { connection.destroy(); done(value); };
    connection.once('connect', () => finish(true));
    connection.once('error', () => finish(false));
    connection.setTimeout(750, () => finish(false));
  });
}
async function main() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  if (await healthy()) { console.log(`BOTCreplay is already running: ${url}`); return; }
  if (await portOccupied()) throw new Error(`Port ${port} is occupied by another service. Set a different PORT.`);
  try { await access(resolve(root, 'dist/server/server/main.js')); }
  catch { throw new Error('Build output is missing. Run npm run build, then npm run start:local.'); }
  const dataRoot = resolve(root, 'runtime-data');
  await mkdir(dataRoot, { recursive: true });
  const outPath = resolve(dataRoot, `server-${port}.stdout.log`);
  const errPath = resolve(dataRoot, `server-${port}.stderr.log`);
  const out = await open(outPath, 'a');
  const err = await open(errPath, 'a');
  let child;
  try {
    child = spawn(process.execPath, ['dist/server/server/main.js'], {
      cwd: root, detached: true, windowsHide: true,
      stdio: ['ignore', out.fd, err.fd], env: { ...process.env, PORT: String(port) },
    });
    await once(child, 'spawn');
    child.unref();
  } finally { await Promise.all([out.close(), err.close()]); }
  for (let attempt = 0; attempt < 30; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`The service exited. See ${errPath}`);
    if (await healthy()) {
      await writeFile(resolve(dataRoot, `server-${port}.process.json`), JSON.stringify({ pid: child.pid, port, url, startedAt: new Date().toISOString() }, null, 2) + '\n');
      console.log(`BOTCreplay is ready: ${url} (PID ${child.pid})`);
      console.log('The service runs in the background. You can close this terminal.');
      return;
    }
    await delay(200);
  }
  throw new Error(`The service did not become ready. See ${errPath} and ${outPath}`);
}
try { await main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
