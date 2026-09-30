import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const external = ['electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

// Preload runs in a sandboxed renderer: it must be a single CommonJS file with no
// runtime imports other than `electron`.
export default defineConfig({
  resolve: { alias: { '@shared': resolve(import.meta.dirname, 'src/shared') } },
  build: {
    outDir: 'out/preload',
    emptyOutDir: true,
    target: 'node22',
    ssr: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'src/preload/index.ts'),
      external,
      output: { format: 'cjs', entryFileNames: 'index.cjs' },
    },
  },
});
