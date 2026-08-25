import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { packRoot } from './support/packRoot';
// Core's asset-manifest generator, shipped for packs as
// `@moba2d/core/pack-assets` and driven by the `moba2d-generate-assets`
// bin that `npm run assets:generate` calls. This pack used to carry its own
// full copy — a survey had measured the walk as having zero core dependency,
// so duplicating it was meant to let the pack stand alone. It cannot: this
// pack's `catalog:generate`, `check-seams` and test setup are all core bins
// and core imports, so the standalone case the copy bought does not exist.
// Plain .mjs, no declaration file of its own and not part of
// any TypeScript program; this is the first program that has ever
// typechecked this test at all (no tsconfig reached
// tests/packs/riot/**/*.ts before content-pack-extraction batch 6 task 6
// moved it inside the pack's own **/*.ts glob). The diagnostic this
// suppresses is reported on the `from '...'` line below, not the `import {`
// line above, because this is a multi-line import clause.
import {
  assetKeyForPath,
  buildManifestEntries,
  generate,
  PACK_ASSET_TREE,
  renderAssetManifestSource,
  renderManifest,
  // @ts-expect-error — see above
} from '@moba2d/core/pack-assets';

// This pack's own root — `packs/riot/` inside this monorepo, this pack's
// own checkout root once separated — not a repo-root constant, and not a
// fixed `__dirname` climb either: this file used to climb three levels and
// walk back down through a hardcoded `packs`/`riot`, which resolved only
// because this file happens to sit exactly that far under the monorepo
// root. `support/packRoot.ts`'s own header has the full account of why
// that broke the moment a drill copied this file somewhere else.
const PACK_ROOT = packRoot(dirname(fileURLToPath(import.meta.url)));

describe("packs/riot's own asset manifest generator", () => {
  it('maps a path the same way core does', () => {
    expect(assetKeyForPath('assets/images/champions/janna.png')).toBe('champ_janna');
    expect(assetKeyForPath('assets/images/spells/janna_q.png')).toBe('spell_janna_q');
  });

  it('rejects duplicate generated keys', () => {
    expect(() =>
      buildManifestEntries(['assets/images/others/menu-bg.png', 'assets/images/others/menu_bg.jpg'])
    ).toThrow(/duplicate asset key "other_menu_bg"/i);
  });

  /**
   * `packs/riot/assets/` is real — batch 4 task 4 moved 377 champion
   * portraits, spell icons and monster art files into it. Generating against
   * this pack's own root (not core's) now produces the real, populated
   * manifest, reading only `packs/riot/assets/` — never core's own `assets/`.
   */
  it('generates the real manifest for this pack, never reading core/assets', async () => {
    const source = await renderAssetManifestSource(PACK_ROOT, { tree: PACK_ASSET_TREE });

    expect(source).toContain('export const assetManifest = {');
    expect(source).toContain('champ_janna');
    expect(source).toContain('spell_janna_q');
    // Core-only art (never moved here) must not leak into the pack's tree.
    expect(source).not.toContain('buff_stun');
    expect(source).not.toContain('spell_basic_attack');
  });

  /**
   * The byte-for-byte proof task 5 pins itself to: regenerating against the
   * real `packs/riot/assets/` must reproduce exactly what is already
   * checked in at `packs/riot/generated/assetManifest.ts`.
   */
  it("leaves the pack's own checked-in manifest byte-identical", async () => {
    const generated = await renderAssetManifestSource(PACK_ROOT, { tree: PACK_ASSET_TREE });
    const committed = await readFile(join(PACK_ROOT, 'generated/assetManifest.ts'), 'utf8');

    expect(generated).toBe(committed);
  });

  it("imports relative to this pack's own root, not a repo-root round-trip", () => {
    const entries = buildManifestEntries(['assets/images/champions/janna.png']);
    const source = renderManifest(entries, { importPrefix: '../' });

    expect(source).toContain("from '../assets/images/champions/janna.png?url'");
  });

  it("names this pack's own regenerate command in the stale-manifest message", async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'lol2d-riot-assets-stale-'));
    try {
      await mkdir(join(tmpRoot, 'assets'), { recursive: true });
      await expect(generate(tmpRoot, true, PACK_ASSET_TREE)).rejects.toThrow(/Run npm run assets:generate\./);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
