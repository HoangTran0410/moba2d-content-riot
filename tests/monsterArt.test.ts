import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assetManifest } from '../generated/assetManifest';

/**
 * Where the drake art came from, re-hashed offline.
 *
 * The pack makes a provenance claim in its own README — that every imported
 * image records the URL it came from and a SHA-256 of the bytes, and that a
 * check re-hashes them — and it had two ledgers to back it, neither of which
 * these files can live in. `assets/source-manifest.json` is the *wiki
 * importer's*, and `scripts/wiki/check-abilities.mjs` requires every key in it
 * to be referenced by a record under `docs/abilities/`; a drake is not an
 * ability and has no such record. `docs/items-source-manifest.json` is the
 * shop's. So the seven drake portraits get a third ledger of the same shape,
 * and this is its checker.
 *
 * **A test rather than a fourth `scripts/*.mjs` bin.** The two existing
 * ledgers each have an importer that also fetches, and re-hashing is the only
 * half `verify` runs — which a Vitest case does for free, in the run that is
 * already happening, with no npm script and no network.
 *
 * **The ten older monster icons are deliberately not in it.** They arrived
 * with the pack's own extraction from core and nobody recorded where they came
 * from at the time; inventing rows for them now would be writing provenance
 * rather than recording it. `covers what it claims to cover` below states that
 * gap out loud instead of letting the ledger look complete.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(root, 'docs/monsters-source-manifest.json');

interface Row {
  contentHash: string;
  fetchedAt: string;
  localAssetKey: string;
  localPath: string;
  sourceUrl: string;
}

const ledger = (): Row[] => {
  const parsed = JSON.parse(readFileSync(LEDGER, 'utf8')) as {
    schemaVersion: number;
    sources: Row[];
  };
  expect(parsed.schemaVersion).toBe(1);
  return parsed.sources;
};

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('the drake art ledger', () => {
  it('names files this pack actually ships', () => {
    for (const row of ledger()) {
      expect(existsSync(join(root, row.localPath)), row.localPath).toBe(true);
      expect(Object.keys(assetManifest), row.localAssetKey).toContain(row.localAssetKey);
    }
  });

  it('still hashes to what was recorded', () => {
    const drifted = ledger()
      .filter(row => sha256(readFileSync(join(root, row.localPath))) !== row.contentHash)
      .map(row => row.localPath);

    expect(drifted).toEqual([]);
  });

  it('agrees with the asset key the generator would mint', () => {
    // The ledger records the key so a reader can go from a row to the game
    // without guessing, and a row whose key is wrong is a row pointing at
    // nothing. `assets/images/monsters/Ocean_Drake.webp` mints
    // `monster_Ocean_Drake` — the generator's own rule, not a convention.
    for (const row of ledger()) {
      const expected = `monster_${row.localPath.split('/').pop()!.replace(/\.[^.]+$/, '')}`;
      expect(row.localAssetKey).toBe(expected);
    }
  });

  it('keeps the extension honest about what the bytes are', () => {
    // The reason these files are `.webp` and not `.png`. The wiki CDN serves
    // them from `…DrakeSquare.png` URLs and the bytes are WebP — the pack's
    // README claims the extension agrees with what the source served, and
    // saving them under the URL's own name would have made that claim false.
    // `RIFF` then `WEBP` at byte 8 is the container's magic.
    for (const row of ledger()) {
      const bytes = readFileSync(join(root, row.localPath));
      expect(row.localPath.endsWith('.webp'), row.localPath).toBe(true);
      expect(bytes.subarray(0, 4).toString('ascii'), row.localPath).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii'), row.localPath).toBe('WEBP');
    }
  });

  it('covers what it claims to cover, and no more', () => {
    // Seven drakes. The other monster icons under the same directory predate
    // this ledger and are knowingly outside it — see the file header.
    const rows = ledger();
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map(row => row.localAssetKey)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row.sourceUrl.startsWith('https://'), row.sourceUrl).toBe(true);
    }
  });
});
