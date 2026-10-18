import { createServer as createViteServer } from 'vite';
import { createLocalServer } from '../server/http.js';

const vite = await createViteServer({ server: { middlewareMode: true } });
const server = createLocalServer(vite.middlewares,undefined,process.env.BOTCREPLAY_ROLE_LIBRARY_FILE);
const port = Number(process.env.PORT ?? 5173);
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请关闭占用程序或设置 PORT。` : error.message);
  process.exitCode = 1;
  void vite.close();
});
server.listen(port, '127.0.0.1', () => console.log(`BOTCreplay: http://localhost:${port}`));
for (const name of ['SIGINT', 'SIGTERM'] as const) process.on(name, () => { server.close(); void vite.close(); });
