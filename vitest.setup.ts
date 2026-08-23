import { installEngineGlobalsForTests, installPackForTests } from '@moba2d/core/testing/setup';
import { setActiveLanes } from '@moba2d/core/testing';
import { data, BUNDLED_PACK_ID } from './pack';
import { assetManifest } from './generated/assetManifest';

/**
 * This pack's own test environment — every test file's setup, run once per
 * file the same way core's own `tests/setup.ts` is. Imported from
 * `@moba2d/core/testing/setup`, **not** from `@moba2d/core/testing` (the
 * barrel that also re-exports `installEngineGlobalsForTests` and
 * `installPackForTests`): the barrel's `export *` eagerly loads
 * `ContentApi` and everything under it before any test file's own
 * `vi.mock(...)` calls register — see that module's own doc comment, and
 * core's `tests/setup.ts`, which carries the same rule for the same
 * measured reason.
 *
 * `BUNDLED_PACK_ID` rather than the literal `'riot'`: this pack states its
 * own id once, in its own data, and its test setup reads it from there.
 */
installEngineGlobalsForTests();
await installPackForTests({ id: BUNDLED_PACK_ID, assetManifest, data });

/**
 * Installing this pack's own map as the active match's lane set.
 *
 * Core's own `tests/setup.ts` does this through an extra layer —
 * `installPackForTests` above only *caches* the resolved geometry
 * (`src/testing/lanes.ts`), and a second, checkout-only file
 * (`tests/game/lanesFixture.ts`) reads that cache and calls
 * `setActiveLanes`. That indirection exists because a checkout can have
 * more than one map-bearing pack installed and "the first one wins" has to
 * be decided somewhere outside any one pack's own knowledge — and
 * `tests/game/lanesFixture.ts` lives in `tests/`, this checkout's own tree,
 * not something a separated pack can import.
 *
 * This pack has no such ambiguity: it knows its own map is the only one it
 * ships, so it resolves that map's geometry directly (`installPackForTests`
 * already reads the same value internally, `data.maps?.[0].geometry` — see
 * that function's own doc comment for the sync-or-lazy shape) and installs
 * its lanes as the active set itself, without the cache indirection. Two of
 * this pack's own tests read `LANES`/`getLaneWaypoints` off the ambient
 * default without ever constructing a `Game`
 * (`tests/maps/Lanes.test.ts`, `tests/spells/Darius.test.ts`), the same
 * reason core's own setup installs a default for its whole suite.
 */
const map = data.maps?.[0];
if (map) {
  const geometry = typeof map.geometry === 'function' ? await map.geometry() : map.geometry;
  setActiveLanes(geometry.lanes ?? []);
}
