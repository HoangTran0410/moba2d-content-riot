import type { MapGeometry } from '@moba2d/core/content/ContentPack';
import geometryRaw from '../generated/maps/twistedTreeline.geometry.json?raw';

/**
 * Twisted Treeline's heavy half — the walls, bushes, slots and both lanes.
 *
 * Drawn by hand in the map editor and exported to
 * `maps/twistedTreeline_map.json`, so a retune is a re-export rather than an
 * edit here.
 *
 * It reads the **generated** copy, not that export, and the difference is a
 * shipped bug: the export is the editor's whole file, and `JSON.parse` of it
 * used to hand core an object carrying `id: "map-nhap-vao"` — the name the map
 * was drawn under — along with `name`, `size`, `factions` and 9.4KB of
 * `authoring` undo data. Core built its active map by spreading geometry over
 * the summary, so that id won, became `Game.activeMapId`, and travelled in the
 * LAN hello as a map id no client could find. A host on this map could not be
 * joined at all.
 *
 * `scripts/generate-maps.mjs` writes a copy holding exactly `terrain`, `slots`
 * and `lanes`, minified: 71.3KB of editable source, 14.0KB on the wire. The
 * full export stays in the repository, because `authoring` is what lets the
 * editor re-open a shipped map and merge its cut polygons back into the shapes
 * they were drawn as.
 *
 * `?raw` for the reason `summonersRiftGeometry.ts` documents: `assetsInclude`
 * claims `.json` ahead of Vite's JSON plugin, and a plain import passes Vitest
 * and then fails `vite build`.
 */
export const twistedTreelineGeometry: MapGeometry = JSON.parse(geometryRaw) as MapGeometry;
