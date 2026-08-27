import type { MapDefinition } from '@moba2d/core/content/ContentPack';

/**
 * Twisted Treeline's cheap half — enough for the picker to list it. The
 * walls, slots and both lanes live behind `geometry`'s dynamic import, the
 * same split `summonersRift.ts` documents: the menu's chunk pays for a name
 * and a size, never for polygons.
 */
export const twistedTreeline: MapDefinition = {
  id: 'twisted-treeline',
  name: 'Twisted Treeline',
  size: 6300,
  factions: [{ id: 'blue' }, { id: 'red' }],
  geometry: () => import('./twistedTreelineGeometry').then(module => module.twistedTreelineGeometry),
};
