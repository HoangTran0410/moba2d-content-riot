/**
 * Re-encodes the pack's raster art to WebP **during the build**, leaving the
 * files in `assets/` untouched.
 *
 * That last part is the whole design. `assets/source-manifest.json` records,
 * for every image imported from the wiki, the URL it came from, the revision
 * it was, and a SHA-256 of the bytes — and `scripts/wiki/check-abilities.mjs`
 * (the `ability:check` gate) re-hashes each file on disk and refuses a
 * mismatch, and separately refuses a path whose extension disagrees with the
 * MIME type the wiki served. The repository's claim is that these are exactly
 * the bytes the wiki gave us. Re-encoding them in place would be false, twice
 * over, and would break the gate that says so.
 *
 * So the conversion belongs where the output is made, not where the sources
 * are kept. Re-running the wiki import cannot fight it, and the sources stay
 * the originals they claim to be.
 *
 * ## Why it is worth doing at all
 *
 * Measured on this pack: `assets/` was 2188 KB of a 3407 KB build — 64% of
 * everything a player downloads. The 52 champion portraits are 128x128 8-bit
 * **RGB with no alpha channel** — photographic crops of splash art, stored
 * losslessly. That is paying lossless prices for lossy content, and it is
 * three quarters of their bytes: 779 KB to 188 KB at quality 80.
 *
 * Quality 80, not 90, and not AVIF. At 2x zoom the three are indistinguishable
 * on this art, and portraits are drawn at 80px (the HUD), 52px and 35px, so
 * the 128px source is already a retina multiple rather than detail anyone
 * sees. AVIF was measured at 5 percentage points better than WebP on a
 * 30-file sample, which does not pay for a slower decode on a cheap phone
 * across 350 small images.
 *
 * ## Why a `load` hook
 *
 * `generated/assetManifest.ts` imports every asset as `?url`. Hooking `load`
 * with `enforce: 'pre'` gets in ahead of Vite's own asset plugin, so the file
 * Rollup emits — and therefore the name it hashes and the URL it hands back —
 * is the WebP. Rewriting `dist/` afterwards would mean rewriting hashed
 * filenames inside the emitted chunks, which is the fragile version of this.
 */
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';

/** Only formats where a lossy re-encode is the right trade. */
const CONVERTIBLE = new Set(['.png', '.jpg', '.jpeg']);

/**
 * GIFs are excluded by not being in the set above: `sharp`'s WebP encoder
 * takes the first frame of an animated GIF and silently drops the rest, which
 * turns a spell's animation into a still with nothing to say it happened.
 * Five files, and `gif2webp` is a different tool.
 */
export function webpAssets({ quality = 80 } = {}) {
  let enabled = false;
  let sharp = null;
  const saved = { files: 0, before: 0, after: 0 };

  return {
    name: 'moba2d:webp-assets',
    enforce: 'pre',
    apply: 'build',

    async buildStart() {
      try {
        ({ default: sharp } = await import('sharp'));
        enabled = true;
      } catch {
        // A build without `sharp` still produces a correct pack, just a
        // heavier one. Warned rather than thrown: a contributor who cloned
        // the pack to change one number should not meet a native-module
        // install failure as a wall.
        this.warn(
          'sharp is not installed, so images ship as-is — run `npm install` to halve the pack'
        );
      }
    },

    async load(id) {
      if (!enabled || !id.endsWith('?url')) return null;
      const file = id.slice(0, -'?url'.length);
      const extension = extname(file).toLowerCase();
      if (!CONVERTIBLE.has(extension)) return null;

      let encoded;
      try {
        encoded = await sharp(file).webp({ quality }).toBuffer();
      } catch (cause) {
        // One unreadable image must not fail a 592-file build. Falling
        // through to `null` hands the file back to Vite's own asset plugin,
        // which ships the original.
        this.warn(`could not re-encode ${basename(file)}, shipping it as-is: ${cause.message}`);
        return null;
      }

      // A re-encode that came out *bigger* is not an optimisation. Rare, but
      // real for art that is already tiny or already palette-compressed, and
      // shipping it would make the case for this plugin false on those files.
      //
      // `stat`, not `sharp().metadata().size`: that field is `undefined` for
      // a PNG, so the first version of this guard compared against `Infinity`
      // and could never fire — it reported "100% smaller" on a build that had
      // in fact shrunk by 69%, which is how it was caught.
      const { size: original } = await stat(file);
      if (encoded.byteLength >= original) return null;

      saved.files++;
      saved.before += original;
      saved.after += encoded.byteLength;

      const reference = this.emitFile({
        type: 'asset',
        name: `${basename(file, extname(file))}.webp`,
        source: encoded,
      });
      return `export default import.meta.ROLLUP_FILE_URL_${reference}`;
    },

    closeBundle() {
      if (!enabled || saved.files === 0) return;
      const kb = n => Math.round(n / 1024);
      // eslint-disable-next-line no-console
      console.log(
        `webp: ${saved.files} image(s), ${kb(saved.before)} KB -> ${kb(saved.after)} KB ` +
          `(${Math.round(100 - (100 * saved.after) / saved.before)}% smaller)`
      );
    },
  };
}
