import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

await build();
await build({
  configFile: false,
  plugins: [vue()],
  // Vite library mode preserves process.env by default; the file:// viewer has no Node globals.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist/viewer',
    emptyOutDir: true,
    target: 'es2022',
    lib: { entry: resolve('viewer/main.ts'), name: 'BOTCreplayViewer', formats: ['iife'], fileName: () => 'viewer.js', cssFileName: 'viewer' },
    cssCodeSplit: false,
  },
});
