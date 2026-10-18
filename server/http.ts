import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRoleLibraryApi } from './role-library.js';

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
export function createLocalServer(middleware?: Middleware, webRoot = resolve('dist/web'), roleLibraryFile?: string) {
  const roleLibraryApi=createRoleLibraryApi(roleLibraryFile);
  return createServer((request, response) => {
    const origin = request.headers.origin;
    const host = request.headers.host ?? '';
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || (origin && origin !== `http://${host}`)) {
      response.writeHead(403).end('只接受本地同源访问');
      return;
    }
    if (request.url === '/api/health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify({ service: 'BOTCreplay', milestone: 'M1-role-workbench', schemaVersion: '0.2.0', roleLibraryVersion:'role-library-v1' }));
      return;
    }
    void (async () => {
      try {
        if(await roleLibraryApi(request,response))return;
        if (middleware) { middleware(request, response, () => response.writeHead(404).end('页面不存在')); return; }
        if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return; }
        const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
        const file = resolve(webRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(webRoot + sep)) { response.writeHead(403).end(); return; }
        const info = await stat(file);
        if (!info.isFile()) { response.writeHead(404).end(); return; }
        const data = await readFile(file);
        response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
        response.end(request.method === 'HEAD' ? undefined : data);
      } catch { response.writeHead(404).end('页面不存在'); }
    })();
  });
}
