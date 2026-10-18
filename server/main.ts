import { createLocalServer } from './http.js';

const server = createLocalServer(undefined,undefined,process.env.BOTCREPLAY_ROLE_LIBRARY_FILE);
const port = Number(process.env.PORT ?? 5173);
server.on('error', (error: NodeJS.ErrnoException) => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请设置其他 PORT。` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`BOTCreplay: http://localhost:${port}`));
for (const name of ['SIGINT', 'SIGTERM'] as const) process.on(name, () => server.close());
