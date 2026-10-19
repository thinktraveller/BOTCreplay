import { readFile, mkdir, writeFile, rename, copyFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createDefaultLibrary } from '../shared/roles/editor-defaults.js';
import { MAX_LIBRARY_BYTES, validateLibrary, type RoleLibrary } from '../shared/roles/editor-model.js';
import { renameCurrentText } from '../shared/roles/names.js';
class StoreError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function createRoleLibraryStore(file = resolve('runtime-data/role-library.json')) {
    let pending: Promise<unknown> = Promise.resolve();
    async function load(): Promise<RoleLibrary> {
        let raw: string;
        try {
            raw = await readFile(file, 'utf8');
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                return createDefaultLibrary();
            throw error;
        }
        let value: unknown;
        try {
            value = JSON.parse(raw);
        }
        catch {
            throw new StoreError(500, '本地角色库无法解析。请保留原文件并从JSON备份恢复。');
        }
        if (validateLibrary(value).length)
            throw new StoreError(500, '本地角色库格式无效，请从有效备份恢复。');
        return renameCurrentText(value as RoleLibrary);
    }
    async function save(value: unknown, expectedRevision: unknown): Promise<RoleLibrary> {
        const run = pending.catch(() => { }).then(async () => {
            const current = await load();
            if (expectedRevision !== current.revision)
                throw new StoreError(409, '角色库已被其他窗口更新。请先导出当前草稿，再重新载入。');
            const errors = validateLibrary(value);
            if (errors.length)
                throw new StoreError(422, errors.slice(0, 10).map(e => e.path + '：' + e.message).join('\n'));
            const library = structuredClone(value) as RoleLibrary;
            library.revision = current.revision + 1;
            library.updatedAt = new Date().toISOString();
            const data = JSON.stringify(library, null, 2) + '\n';
            if (Buffer.byteLength(data) > MAX_LIBRARY_BYTES)
                throw new StoreError(413, '角色库超过16MB，请减少过长内容或历史版本后重试。');
            await mkdir(dirname(file), { recursive: true });
            try {
                await copyFile(file, file + '.bak');
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                    throw error;
            }
            const temp = file + '.' + randomUUID() + '.tmp';
            try {
                await writeFile(temp, data, { encoding: 'utf8', flag: 'wx' });
                await rename(temp, file);
            }
            catch (error) {
                await unlink(temp).catch(() => { });
                throw error;
            }
            return library;
        });
        pending = run;
        return run;
    }
    return { load, save, file };
}
function send(response: ServerResponse, status: number, value: unknown) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(JSON.stringify(value)); }
export function createRoleLibraryApi(file?: string) {
    const store = createRoleLibraryStore(file);
    return async (request: IncomingMessage, response: ServerResponse) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (pathname !== '/api/role-library')
            return false;
        try {
            if (request.method === 'GET') {
                send(response, 200, await store.load());
                return true;
            }
            if (request.method !== 'PUT') {
                response.setHeader('Allow', 'GET, PUT');
                send(response, 405, { error: '此接口支持读取或保存角色库' });
                return true;
            }
            if (!(request.headers['content-type'] ?? '').startsWith('application/json'))
                throw new StoreError(415, '请以JSON格式保存角色库');
            const chunks: Buffer[] = [];
            let bytes = 0;
            for await (const chunk of request) {
                const buffer = Buffer.from(chunk);
                bytes += buffer.length;
                if (bytes > MAX_LIBRARY_BYTES)
                    throw new StoreError(413, '角色库超过16MB');
                chunks.push(buffer);
            }
            let body: {
                library?: unknown;
                expectedRevision?: unknown;
            };
            try {
                body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            }
            catch {
                throw new StoreError(400, 'JSON无法解析，原配置未改变');
            }
            if (!body || typeof body !== 'object')
                throw new StoreError(400, '需要角色库和原版本号');
            send(response, 200, await store.save(body.library, body.expectedRevision));
            return true;
        }
        catch (error) {
            send(response, error instanceof StoreError ? error.status : 500, { error: error instanceof StoreError ? error.message : '本地保存失败，请保留草稿并检查数据目录权限。' });
            return true;
        }
    };
}
