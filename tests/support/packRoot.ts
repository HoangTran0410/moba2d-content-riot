import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Walks up from `fromDir` to the nearest `package.json` that names
 * `@moba2d/core` as a dependency — this pack's own root, derived from
 * wherever a test file happens to sit, rather than climbed to by counting
 * `..` segments and a hardcoded `packs/riot` literal.
 *
 * `ahri-palette.test.ts` and `generate-assets.test.ts` used to climb: a
 * fixed number of `__dirname` levels up, then back down through
 * `packs/riot` again. That round trip only ever resolved inside this
 * monorepo's own layout — a genuinely separated pack repository has no
 * `packs/riot` segment anywhere in its checkout, and neither does this
 * pack's own copy inside a hermetic standalone sandbox
 * (`npm run verify:pack-standalone`), which is exactly what surfaced this:
 * every gate that runs the pack's tests *in place* saw the climb resolve
 * correctly by coincidence of location, and none of them moves the pack
 * anywhere else to check.
 *
 * The fix is to derive the root instead of climbing to it. A `package.json`
 * naming `@moba2d/core` is the same anchor `scripts/lib/packRoot.mjs`'s
 * future `packRootFrom` will use for the scaffold (spec's Task 8) — proximity
 * naturally picks this pack's own manifest before any other, whether it
 * sits at `<monorepo>/packs/riot/`, at the root of its own checkout, or
 * copied into a sandbox with a different name entirely.
 *
 * Throws rather than silently walking to the filesystem root: a test moved
 * somewhere with no such `package.json` above it should fail loudly, not
 * resolve to a directory that happens to have some unrelated manifest in it.
 */
export function packRoot(fromDir: string): string {
  let dir = resolve(fromDir);
  while (true) {
    const manifestPath = join(dir, 'package.json');
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      if (
        '@moba2d/core' in (manifest.dependencies ?? {}) ||
        '@moba2d/core' in (manifest.devDependencies ?? {})
      ) {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`no package.json naming @moba2d/core found walking up from ${fromDir}`);
    }
    dir = parent;
  }
}
