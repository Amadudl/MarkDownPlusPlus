import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const external = ['electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig({
  resolve: { alias: { '@shared': resolve(import.meta.dirname, 'src/shared') } },
  // Bundle every npm dependency (e.g. zod) into the main bundle: the packaged app ships
  // only out/** and package.json, without node_modules (see electron-builder.yml).
  ssr: { noExternal: true },
  build: {
    outDir: 'out/main',
    emptyOutDir: true,
    target: 'node22',
    ssr: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'src/main/index.ts'),
      external,
      output: { format: 'cjs', entryFileNames: 'index.cjs' },
    },
  },
});
