import type { MapDefinition } from '@moba2d/core/content/ContentPack';
import { mapMeta } from '../generated/maps/mapMeta';

/**
 * Summoner's Rift's cheap half — enough for a picker to list, name and
 * describe it. Everything a match actually plays on — 329 wall polygons, 40
 * bush, 26 water, both turret rows, the fountains, the jungle camps, the
 * lanes — lives behind `geometry`'s dynamic import (`./summonersRiftGeometry.ts`)
 * and is fetched only once a match is starting, never when the menu paints.
 *
 * **`id` is the only thing written here, and that is the rule.** Everything
 * else comes from `maps/summonersRift_map.json` by way of the generated meta,
 * because a hand-kept copy of a fact the map file already states will drift
 * from it: Twisted Treeline's did, `size: 6300` against the export's 6400,
 * with terrain reaching x=6385. The id is exempt because it is the one field
 * that is *not* the map's to state — it is this pack's name for it, and a
 * re-export from the editor must never be able to change what a saved loadout
 * or a LAN hello refers to. That is precisely how `map-nhap-vao`, the name
 * this map's neighbour was drawn under, once reached `Game.activeMapId`.
 *
 * `import type` for `MapDefinition`, matching the pack boundary every file
 * under this repository holds to (the `pack-core-boundary` seam); the meta is
 * generated data, not core, and costs a few hundred bytes.
 *
 * `tests/content/contentApiChunk.test.ts` in core walks `catalog.ts`'s static
 * closure and fails if it ever statically reaches `summonersRiftGeometry.ts`,
 * and `scripts/check-chunks.mjs` fails the build if the `pregame` chunk grows
 * back to where it sat before this split (231,072 bytes, almost all of it the
 * raw JSON).
 */
export const summonersRift: MapDefinition = {
  id: 'summoners-rift',
  ...mapMeta.summonersRift,
  geometry: () => import('./summonersRiftGeometry').then(module => module.summonersRiftGeometry),
};
