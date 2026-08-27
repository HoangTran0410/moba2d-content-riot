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
  size: 4200,
  factions: [{ id: 'blue' }, { id: 'red' }],
  geometry: () => import('./twistedTreelineGeometry').then(module => module.twistedTreelineGeometry),
};
