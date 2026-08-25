import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const dist = join(root, 'dist');

/**
 * These assert on the *built* directory, so they need one to exist. The
 * build is not run from here — a test that builds is a test that takes a
 * minute and hides which half broke. `npm run build` first; `verify` runs
 * it before the suite.
 */
describe("the pack's runtime bundle", () => {
  beforeAll(() => {
    if (!existsSync(join(dist, 'pack.js'))) {
      throw new Error('dist/pack.js is missing — run `npm run build` first');
    }
  });

  it('emits an entry plus per-spell chunks, not one flat bundle', () => {
    const chunks = readdirSync(join(dist, 'chunks')).filter(f => f.endsWith('.js'));
    // 237 dynamic imports; Rollup merges some that share every dependency,
    // so this is a floor rather than an equality. One flat bundle is what
    // it is really guarding against.
    expect(chunks.length).toBeGreaterThan(50);
  });

  it('keeps the dynamic imports relative, so they resolve against the pack URL', () => {
    // Read the entry *and what it pulls in*, not `pack.js` alone. Once the
    // spells became module-scope classes the entry stopped carrying the 238
    // `import()` calls itself: Rollup emits a small facade at `pack.js` and
    // puts the body in a chunk beside it. Nothing about the guarantee changed —
    // a browser resolves an emitted specifier against the importing chunk's own
    // URL either way — but an assertion pinned to one filename was reading a
    // 134-byte re-export and calling the build broken.
    const emitted = [
      readFileSync(join(dist, 'pack.js'), 'utf8'),
      ...readdirSync(join(dist, 'chunks'))
        .filter(name => name.endsWith('.js'))
        .map(name => readFileSync(join(dist, 'chunks', name), 'utf8')),
    ].join('\n');

    const dynamic = emitted.match(/import\(\s*["'][^"']+["']\)/g) ?? [];
    expect(dynamic.length, 'a pack that loads no kit lazily is the whole cost this avoids')
      .toBeGreaterThan(200);
    expect(
      dynamic.filter(call => !/import\(\s*["']\.\//.test(call)),
      'an absolute specifier resolves against the *host page*, not the pack'
    ).toEqual([]);
  });

  it('bundles no part of core', () => {
    const entry = readFileSync(join(dist, 'pack.js'), 'utf8');
    // Core is `external`, so its specifier may appear as an import; what may
    // never appear is core's own source. `buildContentApi` is a value only
    // core defines.
    expect(entry).not.toMatch(/buildContentApi/);
  });

  it('emits champion art as files rather than inlining it into the entry', () => {
    const entry = readFileSync(join(dist, 'pack.js'), 'utf8');
    // A base64 image in the entry means every player downloads all 58
    // champions' art before the menu can draw. Core sets assetsInlineLimit: 0
    // for the same reason (its own vite.config.ts).
    expect(entry).not.toMatch(/data:image\//);
  });

  it('serves that art from the directory the manifest points at', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
    const assetDir = join(dist, manifest.assets);
    expect(existsSync(assetDir)).toBe(true);
    expect(readdirSync(assetDir).length).toBeGreaterThan(300);
  });

  it('writes a manifest core can read before running anything', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
    expect(manifest.id).toBe('lol');
    expect(manifest.entry).toBe('pack.js');
    expect(manifest.assets).toBe('assets/');
    expect(manifest.coreRange).toMatch(/^>=\d+\.\d+\.\d+$/);
    expect(manifest.champions).toBeGreaterThan(50);
  });
});

describe('the manifest lists what the build emitted', () => {
  /** Every file under `dist/`, relative and POSIX-separated. */
  const walk = (dir: string, prefix = ''): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), rel));
      else out.push(rel);
    }
    return out;
  };

  it('names every emitted file except the manifest itself', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
    const onDisk = walk(dist).filter(name => name !== 'manifest.json').sort();

    expect(Array.isArray(manifest.files)).toBe(true);
    // Set equality both ways, not a length check: a `files` that lists 590
    // paths of which one is wrong has the right length and caches a 404.
    expect([...manifest.files].sort()).toEqual(onDisk);
  });

  it('lists the entry and at least one chunk and one asset', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
    expect(manifest.files).toContain(manifest.entry);
    expect(manifest.files.some((f: string) => f.startsWith('chunks/'))).toBe(true);
    expect(manifest.files.some((f: string) => f.startsWith('assets/'))).toBe(true);
  });

  it('uses forward slashes, so a Windows build does not emit unfetchable paths', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
    expect(manifest.files.some((f: string) => f.includes('\\'))).toBe(false);
  });
});

/**
 * Art ships re-encoded, and the sources it came from do not.
 *
 * `assets/` was 2188 KB of a 3407 KB build — 64% of everything a player
 * downloads — and the 52 champion portraits in it are 128x128 8-bit RGB with
 * no alpha channel: photographic crops of splash art, stored losslessly. WebP
 * at quality 80 takes the whole tree to 674 KB.
 *
 * The conversion happens in `scripts/webp-assets.mjs`, during the build, and
 * that placement is the point rather than a convenience.
 * `assets/source-manifest.json` records a SHA-256 of every image imported from
 * the wiki and `ability:check` re-hashes each file on disk against it, so the
 * repository's standing claim is that those are exactly the bytes the wiki
 * served. Re-encoding them in place would make that claim false and break the
 * gate that states it.
 */
describe('the art the build ships', () => {
  beforeAll(() => {
    if (!existsSync(join(dist, 'assets'))) {
      throw new Error('dist/assets is missing — run `npm run build` first');
    }
  });

  const emitted = () => readdirSync(join(dist, 'assets'));

  it('carries no PNG or JPEG at all', () => {
    const raster = emitted().filter(name => /\.(png|jpe?g)$/i.test(name));
    expect(raster).toEqual([]);
  });

  it('carries the WebP the re-encode produced', () => {
    expect(emitted().filter(name => name.endsWith('.webp')).length).toBeGreaterThan(300);
  });

  /**
   * `sharp`'s WebP encoder takes the first frame of an animated GIF and
   * silently drops the rest, which turns a spell's animation into a still with
   * nothing to say it happened. GIFs are excluded from the conversion, so they
   * have to still be here.
   */
  it('leaves GIFs alone, because the encoder would flatten them', () => {
    expect(emitted().some(name => name.endsWith('.gif'))).toBe(true);
  });

  /** The whole reason for the change: it has to actually be smaller. */
  it('keeps the art under a third of what the sources weigh', () => {
    const bytesIn = (dir: string): number => {
      let total = 0;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        total += entry.isDirectory() ? bytesIn(path) : statSync(path).size;
      }
      return total;
    };
    const sources = bytesIn(join(root, 'assets'));
    const shipped = bytesIn(join(dist, 'assets'));
    expect(shipped).toBeLessThan(sources / 3);
  });

  /**
   * And the sources are untouched — the property `ability:check` depends on.
   * Asserted here too because that gate reads `source-manifest.json`, so it
   * only covers imported art; this covers the tree.
   */
  it('leaves the source tree as PNG', () => {
    const sourcePngs = readdirSync(join(root, 'assets/images/champions')).filter(name =>
      name.endsWith('.png')
    );
    expect(sourcePngs.length).toBeGreaterThan(40);
  });
});
