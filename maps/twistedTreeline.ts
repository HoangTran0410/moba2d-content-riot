import type { MapDefinition } from '@moba2d/core/content/ContentPack';
import { mapMeta } from '../generated/maps/mapMeta';

/**
 * Twisted Treeline's cheap half — enough for the picker to list it. The walls,
 * slots and both lanes live behind `geometry`'s dynamic import, the same split
 * `summonersRift.ts` documents: the menu's chunk pays for a name and a size,
 * never for polygons.
 *
 * **`id` is written here and nothing else is.** This file used to also carry
 * `name`, `size` and `factions` by hand, and the copy had already gone wrong:
 * `size: 6300` against the editor export's 6400, on a map whose terrain
 * reaches x=6385. Nobody saw it because core resolved the disagreement by
 * accident — an active map was built as `{ ...summary, ...geometry }`, so the
 * JSON's own keys won and the match ran at 6400 while every picker said 6300.
 * Core takes only `terrain`, `slots` and `lanes` from geometry now, which
 * makes the summary the number that ships, which makes a hand-kept copy a
 * shrinking map rather than a harmless duplicate.
 *
 * The id stays by hand for the opposite reason: it is the one field the export
 * must not be able to change. This map's export calls itself `map-nhap-vao` —
 * the name it was drawn under — and that string reaching `Game.activeMapId` is
 * what made a host on this map unjoinable.
 */
export const twistedTreeline: MapDefinition = {
  id: 'twisted-treeline',
  ...mapMeta.twistedTreeline,
  geometry: () => import('./twistedTreelineGeometry').then(module => module.twistedTreelineGeometry),
};
