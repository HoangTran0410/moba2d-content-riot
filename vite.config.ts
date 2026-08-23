import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Library mode, ES output, code splitting left ON.
 *
 * `generated/spellModules.ts` holds 237 dynamic imports and its own comment
 * says why: "a match loads the kits in play rather than all of them". Rollup
 * turns each into its own chunk, and the browser resolves the emitted
 * relative specifiers against the chunk's own URL — which is the property
 * Task 1's spike proved and the reason this pack is published as a
 * directory rather than one file. `inlineDynamicImports` would collapse all
 * 237 into the entry and cost every player 1.2MB up front.
 *
 * Core is `external`: the pack's only crossings into it are `import type`,
 * which the compiler erases, so nothing of core should ever appear in this
 * output. If Rollup ever reports it as bundled, that is a real boundary
 * violation, not a config problem.
 */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'runtime-entry.ts'),
      formats: ['es'],
      fileName: () => 'pack.js',
    },
    rollupOptions: {
      external: [/^@moba2d\/core($|\/)/],
      output: {
        entryFileNames: 'pack.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
