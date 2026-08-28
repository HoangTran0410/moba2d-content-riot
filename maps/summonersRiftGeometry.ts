import type { MapGeometry } from '@moba2d/core/content/ContentPack';
import geometryRaw from '../generated/maps/summonersRift.geometry.json?raw';

/**
 * Summoner's Rift's heavy half — walls, bushes, water, every slot and all
 * three lanes.
 *
 * **This used to be 350 lines of mapping**: a `summoner_map.json` holding only
 * `wall`/`bush`/`water`, and hand-written tables beside it for the turret
 * rows, the muster points, the neutral camps and the lane waypoints, folded
 * together at module load. The map was therefore half data and half code, and
 * the only way to see what it actually was, was to run it.
 *
 * It is data now. `maps/summonersRift_map.json` holds the whole map in the
 * editor's own format — the same format Twisted Treeline is drawn in — so the
 * map can be opened, retuned and re-exported instead of edited as a program.
 * The conversion was checked rather than trusted: the geometry this file
 * returns was compared field for field against what the old mapping produced,
 * and `tests/maps/summonersRiftGeometry.test.ts` keeps that comparison.
 *
 * `?raw` rather than a plain JSON import, and that is not stylistic:
 * `vite.config.ts` sets `assetsInclude: ['**\/*.json']` so `AssetManager` can
 * hand out JSON files as fetchable URLs at runtime, which claims the extension
 * ahead of Vite's own JSON-module plugin in a production build. A plain import
 * builds fine under Vitest and then fails `vite build` outright with
 * `[plugin vite:json] … Failed to parse JSON file`.
 *
 * The file it reads is **generated** (`scripts/generate-maps.mjs`): the source
 * under `maps/` keeps everything an editor needs, and this copy carries only
 * the three fields `MapGeometry` declares, minified. 120.8KB of editable
 * source becomes 38.2KB on the wire.
 */
export const summonersRiftGeometry: MapGeometry = JSON.parse(geometryRaw) as MapGeometry;
