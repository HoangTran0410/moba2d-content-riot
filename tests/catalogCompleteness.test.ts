import { describe, expect, it } from 'vitest';
import riotCode, { data } from '../pack';
import { buildTestApi } from '@moba2d/core/testing';
import { spellCatalog as riotSpellCatalog } from '../generated/spellCatalog';

const api = buildTestApi();

/**
 * The catalogue-completeness audit — content-pack-and-repo-split batch 6
 * task 10, fix round 2: moved here from `@moba2d/core`'s own
 * `tests/game/preset.catalog.test.ts`, whose own header explains the split.
 * "Every export in the barrel is reachable and cataloged" is inherently a
 * question about whatever content is installed, and this pack is the
 * content — a one-champion reference pack proves the *mechanism* (which
 * stayed in core), never this pack's own completeness.
 *
 * Reformulated against this pack's own `data.ts`/`code.ts`/`generated/
 * spellCatalog.ts` directly, rather than through core's `listSpellCatalog()`/
 * `spellGroups()` — neither of which core publishes to a pack (they are
 * `src/game/preset.ts`'s own, unexported functions) — but the same
 * underlying claims: nothing this pack exports is silently unreachable from
 * a champion's kit or the summoner shelf, and nothing is silently missing
 * from the generated catalogue the free-form picker reads.
 */
describe('catalogue completeness', () => {
  const code = riotCode(api);
  const codeIds = new Set(Object.keys(code.spells ?? {}));

  it('has spells to check, or this proves nothing', () => {
    expect(codeIds.size).toBeGreaterThan(200);
  });

  it('every spell code.ts exports is referenced by some champion or the summoner shelf in data.ts (nothing silently unreachable)', () => {
    const referenced = new Set<string>();
    for (const champion of data.champions ?? []) {
      for (const id of champion.spells) referenced.add(id);
    }
    const missing = [...codeIds].filter(id => !referenced.has(id));
    expect(missing).toEqual([]);
  });

  it('has exactly one generated catalogue entry per spell code.ts exports (nothing silently missing from the free-form picker)', () => {
    const catalogIds = new Set(Object.keys(riotSpellCatalog));
    expect(catalogIds).toEqual(codeIds);
  });

  it('gives every catalogue entry a real, non-empty name and description', () => {
    // Not `entry.name === '?'` — core's own equivalent check (the
    // `getSpellDisplay` error path) exists because that function constructs
    // a real spell instance at runtime and falls back to `'?'` if the
    // constructor throws. This pack's `generated/spellCatalog.ts` is
    // build-time data, typed as a literal union of the real names the
    // generator actually wrote, so TypeScript already proves `=== '?'` can
    // never be true — the check that matters here is simply "is there
    // something real here at all."
    const broken = Object.entries(riotSpellCatalog).filter(
      ([, entry]) => !entry.name || !entry.description
    );
    expect(broken.map(([id]) => id)).toEqual([]);
  });
});
