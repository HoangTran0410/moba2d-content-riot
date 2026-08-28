import type { MapDefinition, MapGeometry } from '@moba2d/core/content/ContentPack';
import { mapMeta } from '../generated/maps/mapMeta';

/**
 * Summoner's Rift. A name and a size for the picker; the map itself behind a
 * dynamic import.
 *
 * **`id` is the only field written here, and that is the rule.** Everything
 * else comes from `maps/summonersRift_map.json` by way of the generated meta,
 * because a hand-kept copy of a fact the map file already states will drift
 * from it — Twisted Treeline's did, `size: 6300` against its export's 6400, on
 * a map whose terrain reaches x=6385. The id is exempt because it is the one
 * field that is *not* the map's to state: it is this pack's name for it, and a
 * re-export must never be able to change what a saved loadout or a LAN hello
 * refers to. That is exactly how `map-nhap-vao`, the name Twisted Treeline was
 * drawn under, once reached `Game.activeMapId` and made a host unjoinable.
 *
 * ## Why the geometry is a dynamic import of a JSON file, and not a module
 *
 * There used to be a `summonersRiftGeometry.ts` between this file and the
 * data: first 350 lines that *computed* the slots and lanes at load, then —
 * once the map became data — one line that parsed them. A module holding one
 * line earns its place only if something needs it to be a module.
 *
 * Nothing does. The split this file depends on is **Rollup's**, not the file
 * system's: `import()` is what makes the polygons their own chunk, so the menu
 * pays for a name and a size and a match pays for the walls. A dynamic import
 * of the JSON itself splits exactly the same way, and the intermediate module
 * was only ever a place to put the `JSON.parse`.
 *
 * `?raw` rather than a plain JSON import, and that is not stylistic:
 * `vite.config.ts` sets `assetsInclude: ['**\/*.json']` so `AssetManager` can
 * hand out JSON files as fetchable URLs at runtime, which claims the extension
 * ahead of Vite's own JSON-module plugin in a production build. A plain import
 * builds fine under Vitest and then fails `vite build` outright with
 * `[plugin vite:json] … Failed to parse JSON file`.
 *
 * The file it reads is **generated** (`scripts/generate-maps.mjs`): the source
 * under `maps/` keeps everything an editor needs, `authoring` included, and
 * this copy carries only the three fields `MapGeometry` declares, minified.
 *
 * Core's `tests/content/contentApiChunk.test.ts` walks `catalog.ts`'s static
 * closure and fails if the geometry is ever reachable statically, and
 * `scripts/check-chunks.mjs` fails the build if the `pregame` chunk grows back
 * to where it sat before the split.
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
 * of a `summonersRiftGeometry.ts`. Folding that module away is what made it something
 * this file has to say out loud.
 */
let loaded: Promise<MapGeometry> | null = null;
const load = (): Promise<MapGeometry> =>
  import('../generated/maps/summonersRift.geometry.json?raw').then(
    module => JSON.parse(module.default) as MapGeometry
  );

export const summonersRift: MapDefinition = {
  id: 'summoners-rift',
  ...mapMeta.summonersRift,
  geometry: () => (loaded ??= load()),
};
