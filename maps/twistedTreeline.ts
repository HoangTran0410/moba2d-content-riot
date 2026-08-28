import type { MapDefinition, MapGeometry } from '@moba2d/core/content/ContentPack';
import { mapMeta } from '../generated/maps/mapMeta';

/**
 * Twisted Treeline. Drawn by hand in the map editor and exported to
 * `maps/twistedTreeline_map.json`, so a retune is a re-export rather than an
 * edit here.
 *
 * **`id` is written here and nothing else is.** This file used to carry
 * `name`, `size` and `factions` by hand too, and the copy had already gone
 * wrong: `size: 6300` against the export's 6400, on a map whose terrain
 * reaches x=6385. Nobody saw it because core resolved the disagreement by
 * accident — an active map was built as `{ ...summary, ...geometry }`, so the
 * export's own keys won and the match ran at 6400 while every picker said
 * 6300. Core takes only `terrain`, `slots` and `lanes` from geometry now,
 * which makes the summary the number that ships, which makes a stale copy a
 * shrinking map rather than a harmless duplicate.
 *
 * The id stays by hand for the opposite reason: it is the one field the export
 * must not be able to change. This map's export calls itself `map-nhap-vao` —
 * the name it was drawn under — and that string reaching `Game.activeMapId` is
 * what made a host on this map unjoinable.
 *
 * The geometry is a dynamic import of the generated JSON rather than of a
 * module that parses it: the chunk split is Rollup's and `import()` is all it
 * needs — see `summonersRift.ts` for the whole reasoning, and for why `?raw`
 * is load-bearing.
 */
/**
 * Parsed once, however often it is asked for.
 *
 * `MapGeometryLoader` is documented as "resolved at most once" and
 * `PackRegistry.loadMapGeometry` does cache it — but a loader that re-parses
 * on every call is still wrong, and the wrongness is not only the wasted work:
 * it hands out a *different object* each time, so the lane arrays a map
 * declares stop being the ones `setActiveLanes` installed. Two tests caught
 * exactly that, asserting that red's path is blue's array reversed rather than
 * a copy of it — an identity that quietly became false when this stopped being
 * a module-level constant and became a callback.
 *
 * The module cache used to do this for free, when the parse lived at the top
 * of a `twistedTreelineGeometry.ts`. Folding that module away is what made it something
 * this file has to say out loud.
 */
let loaded: Promise<MapGeometry> | null = null;
const load = (): Promise<MapGeometry> =>
  import('../generated/maps/twistedTreeline.geometry.json?raw').then(
    module => JSON.parse(module.default) as MapGeometry
  );

export const twistedTreeline: MapDefinition = {
  id: 'twisted-treeline',
  ...mapMeta.twistedTreeline,
  geometry: () => (loaded ??= load()),
};
