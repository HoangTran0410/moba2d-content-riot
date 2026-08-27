import { describe, expect, it } from 'vitest';
import { twistedTreeline } from '../../maps/twistedTreeline';
import { validatePack, PackRegistry } from '@moba2d/core/testing';
import { data as riotData } from '../../pack';

/**
 * Twisted Treeline is drawn by hand in the map editor, so this file checks
 * the wiring only — that the map is a cheap summary with its polygons behind
 * a dynamic import, and that it survives install. The shape itself is the
 * editor's business; geometry assertions here would just re-encode whatever
 * the last edit happened to be.
 */
describe('the Twisted Treeline map definition', () => {
  it('is a summary only — no terrain or slots on the object itself', () => {
    expect(twistedTreeline).not.toHaveProperty('terrain');
    expect(twistedTreeline).not.toHaveProperty('slots');
    expect(twistedTreeline).not.toHaveProperty('lanes');
    expect(typeof twistedTreeline.geometry).toBe('function');
  });

  it('is carried in the pack data and survives install, geometry included', async () => {
    expect(riotData.maps).toContain(twistedTreeline);
    const result = validatePack({
      manifest: { id: 'p', version: '1.0.0', coreRange: '^1' },
      maps: [twistedTreeline],
    });
    expect(result.ok).toBe(true);

    const registry = new PackRegistry();
    registry.installData({
      manifest: { id: 'p', version: '1.0.0', coreRange: '^1' },
      maps: [twistedTreeline],
    });
    await expect(registry.loadMapGeometry('p:twisted-treeline')).resolves.toBeTruthy();
  });
});
