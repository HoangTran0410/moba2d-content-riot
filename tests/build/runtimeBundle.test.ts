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
    expect(manifest.id).toBe('riot');
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
