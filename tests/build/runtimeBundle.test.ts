import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
    const entry = readFileSync(join(dist, 'pack.js'), 'utf8');
    expect(entry).toMatch(/import\(\s*["']\.\//);
  });

  it('bundles no part of core', () => {
    const entry = readFileSync(join(dist, 'pack.js'), 'utf8');
    // Core is `external`, so its specifier may appear as an import; what may
    // never appear is core's own source. `buildContentApi` is a value only
    // core defines.
    expect(entry).not.toMatch(/buildContentApi/);
  });

  it('writes a manifest core can read before running anything', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
    expect(manifest.id).toBe('riot');
    expect(manifest.entry).toBe('pack.js');
    expect(manifest.assets).toBe('assets/');
    expect(manifest.coreRange).toMatch(/^>=\d+\.\d+\.\d+$/);
    expect(manifest.champions).toBeGreaterThan(50);
  });
});
