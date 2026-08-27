import type { MapDefinition } from '@moba2d/core/content/ContentPack';

/**
 * Twisted Treeline's cheap half — enough for the picker to list it. The
 * traced walls, slots and both lanes live behind `geometry`'s dynamic
 * import, the same split `summonersRift.ts` documents: the menu's chunk
 * pays for a name and a size, never for polygons.
 *
 * The map itself is the classic two-lane 3v3 ground, rebuilt from a
 * top-down render through core's `tools/map-tracer` — see the geometry
 * module's own header for what was traced and what was hand-finished.
 */
export const twistedTreeline: MapDefinition = {
  id: 'twisted-treeline',
  name: 'Twisted Treeline',
  // 8400 — regenerated from the trace at crop-to-fit scale after the first
  // 4200 cut played cramped and the uniform scale left the playfield a third
  // of the square world; the geometry module's own header carries the whole
  // story.
  size: 8400,
  factions: [{ id: 'blue' }, { id: 'red' }],
  geometry: () => import('./twistedTreelineGeometry').then(module => module.twistedTreelineGeometry),
};
