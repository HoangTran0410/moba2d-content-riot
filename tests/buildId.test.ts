/**
 * `buildId` — the field that makes "your installed pack is out of date"
 * answerable at all.
 *
 * A player installed this pack, it was republished under new content hashes,
 * and their browser asked for a chunk the previous build named and this one
 * does not. 404, and the champion's ability silently became a basic attack.
 * Core now hangs this value off the entry URL so that two builds are two URLs
 * and no cache can serve one build's entry against another's manifest — but
 * only if the value actually moves when the build does.
 *
 * `version` was the obvious candidate and could not do it: it is a number a
 * human has to remember to bump, and this pack's has been `1.0.0` for every
 * publish so far.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The writer's derivation, restated so this file's oracle is its own.
 *
 * Deliberately **does not sort**: the writer hands `createHash` an
 * already-sorted list, and an oracle that sorted for it would agree with a
 * writer that had stopped sorting. The ordering guarantee is asserted on the
 * emitted manifest instead, below.
 */
const derive = (files: string[]): string =>
  createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);

/**
 * The writer itself is core's — `moba2d-write-manifest`, and core's
 * `tests/scripts/writeManifest.bin.test.ts` owns its behaviour. Three
 * assertions here used to *grep this pack's copy* of that script for
 * `buildId,`, for the `createHash` call and for a `.sort()` ahead of it. A
 * copy is what they could check and a copy is what they got: the same file
 * existed in two packs and in the scaffold, and greping one said nothing
 * about the other two. What is left below is this pack's own stake — the
 * artefact its build actually emitted, against an oracle written here.
 */
describe('the derivation', () => {
  it('is stable for the same build', () => {
    expect(derive(['a-1.js', 'b-2.js'])).toBe(derive(['a-1.js', 'b-2.js']));
  });

  /** One chunk rehashing is the whole event this has to notice. */
  it('moves when a single content hash moves', () => {
    expect(derive(['a-1.js', 'b-2.js'])).not.toBe(derive(['a-1.js', 'b-3.js']));
  });

  it('moves when a file is added or removed', () => {
    expect(derive(['a-1.js'])).not.toBe(derive(['a-1.js', 'b-2.js']));
  });

  it('is a short hex string, not a path or a date', () => {
    expect(derive(['a-1.js'])).toMatch(/^[0-9a-f]{12}$/);
  });

});

/**
 * The real artefact, against an oracle written here. Skipped when `dist/` has
 * not been built — this suite runs before `vite build` in some orders — rather
 * than asserting on a file that is not there.
 */
describe('the emitted manifest', () => {
  const manifestPath = join(__dirname, '../dist/manifest.json');
  const built = existsSync(manifestPath);

  it.runIf(built)('carries a buildId derived from its own files array', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.buildId).toMatch(/^[0-9a-f]{12}$/);
    expect(manifest.buildId).toBe(derive(manifest.files));
  });

  /**
   * The entry stays a plain relative path. Core is what hangs the build id off
   * it (`packSource.ts`'s `pinEntryToBuild`), so that every pack gets the
   * pinning whether or not its author thought of it — and a pack that wrote
   * its own query would end up with two.
   */
  /**
   * Order is load-bearing and the hash does not supply it: the writer walks
   * the directory, and a filesystem may hand back a different order on another
   * machine. An unsorted list would give the same build a different id per
   * machine and announce an update on every CI run.
   *
   * Asserted on what shipped rather than on the writer's source — the source
   * is core's now, and a sorted `files` array is the only form of this claim
   * that survives being read from a published manifest.
   */
  it.runIf(built)('lists its files in the order the id was hashed over', () => {
    const { files } = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect([...files].sort()).toEqual(files);
  });

  it.runIf(built)('leaves the entry unqueried', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.entry).toBe('pack.js');
  });
});
