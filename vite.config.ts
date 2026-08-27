import { defineConfig } from 'vite';
import { resolve } from 'node:path';
// @ts-expect-error — a plain .mjs build helper with no types of its own.
import { webpAssets } from '@moba2d/core/pack-webp';

/**
 * Not `build.lib` — deliberately. Vite's own asset plugin special-cases lib
 * mode unconditionally: `shouldInline()` (vite's build/index chunk) opens
 * with `if (config.build.lib) return true;`, before it ever reads
 * `assetsInlineLimit`. That single line is why an earlier version of this
 * config, with `build.lib` set AND `assetsInlineLimit: 0`, still base64'd
 * every one of the 378 `?url` champion-art imports into `pack.js` — the
 * limit was never consulted. Everything lib mode actually buys here
 * (`fileName`, `formats`) is reproduced by hand below via
 * `rollupOptions.input`/`output`, which does not carry that special case.
 *
 * ES output, code splitting left ON.
 *
 * `generated/spellModules.ts` holds 237 dynamic imports and its own comment
 * says why: "a match loads the kits in play rather than all of them". Rollup
 * turns each into its own chunk, and the browser resolves the emitted
 * relative specifiers against the chunk's own URL — which is the property
 * Task 1's spike proved and the reason this pack is published as a
 * directory rather than one file. `inlineDynamicImports` would collapse all
 * 237 into the entry and cost every player 1.2MB up front.
 *
 * `assetsInlineLimit: 0` is the same guard applied to champion art:
 * `generated/assetManifest.ts` imports every champion portrait as `?url`,
 * and with it every one lands as a real file under `dist/assets/` instead
 * of inflating `pack.js` — the entry chunk, loaded before the menu can
 * draw — with 58 champions' worth of art to play a match that needs four.
 * `write-manifest.mjs`'s `assets: 'assets/'` is the promise this keeps.
 *
 * `preserveEntrySignatures: 'strict'` is what `build.lib` sets internally
 * and non-lib builds do not default to; without it Rollup is free to
 * restructure the entry's exports, and a runtime install reads `data`,
 * `assetManifest` and `default` directly off `pack.js`'s namespace
 * (`@moba2d/core`'s `packSource.ts` — those three and nothing else).
 *
 * Core is `external`: the pack's only crossings into it are `import type`,
 * which the compiler erases, so nothing of core should ever appear in this
 * output. If Rollup ever reports it as bundled, that is a real boundary
 * violation, not a config problem.
 */
export default defineConfig({
  // Raster art is re-encoded to WebP on the way into `dist/`, never in
  // `assets/` — see `scripts/webp-assets.mjs` for why the sources have to stay
  // byte-identical to what the wiki served.
  plugins: [webpAssets()],
  // Relative asset URLs, not root-absolute ones. Vite's default `base: '/'`
  // prepends a literal `/` to every `?url` asset path (`/assets/foo.png`),
  // which resolves against the *host page's* origin — exactly the failure
  // Task 1's spike exists to rule out, just for static assets instead of
  // dynamic imports. `base: ''` makes Vite emit `assets/foo.png` instead,
  // which resolves against wherever `pack.js` itself was fetched from.
  base: '',
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: resolve(__dirname, 'runtime-entry.ts'),
      external: [/^@moba2d\/core($|\/)/],
      preserveEntrySignatures: 'strict',
      output: {
        format: 'es',
        entryFileNames: 'pack.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
