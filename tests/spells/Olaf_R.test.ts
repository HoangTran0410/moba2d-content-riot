import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';
import Olaf_R, { BONUS_DAMAGE, DURATION, Olaf_R_Ragnarok, SPEED_PERCENT } from '../../spells/Olaf_R';

const __api = buildTestApi();
const { Stun } = __api.buffs;
type AnyUnit = InstanceType<typeof __api.units.AttackableUnit>;

/**
 * Ragnarok was invisible for its whole duration.
 *
 * A `StatAmp` and a 500ms burst on cast, and then nothing for seven seconds:
 * neither Olaf nor the people fighting him could tell the strongest button he
 * has was up. For an ability whose whole promise is "a stun does not stop this
 * man", that is the worst thing it could be — the enemy's decision to try a
 * stun anyway is only a mistake if they could have known.
 */
describe('Olaf R (Ragnarok)', () => {
  let game: TestGame;
  let olaf: AnyUnit;

  const cast = (): Olaf_R_Ragnarok => {
    expect(pressSpell(new Olaf_R(olaf)), 'the cast was refused').toBe(true);
    const buff = olaf.buffs.find(b => b instanceof Olaf_R_Ragnarok) as Olaf_R_Ragnarok;
    expect(buff, 'the cast left no Ragnarok').toBeDefined();
    return buff;
  };

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 16);
    game = createGame();
    olaf = createUnit(game, 0, 'blue');
    game.setPlayer(olaf);
    indexObjects(game, [olaf]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a buff that stays on him rather than a burst that ends', () => {
    const buff = cast();
    expect(buff.duration).toBe(DURATION);
    expect(olaf.stats.attackDamage.value).toBeGreaterThanOrEqual(BONUS_DAMAGE);
  });

  it('still tears off the crowd control that was already on him', () => {
    const enemy = createUnit(game, 200, 'red');
    const stun = new Stun(3_000, enemy, olaf);
    olaf.addBuff(stun);

    cast();

    // The point of the ultimate is being the one champion a stun does not
    // stop, so it has to *undo* one.
    expect(stun.toRemove).toBe(true);
  });

  it('lays a trail by distance travelled, not by time standing still', () => {
    const buff = cast();

    // Ten ticks of standing still: the trail is the +25% speed made visible,
    // so it must say nothing at all when he is not using it.
    for (let i = 0; i < 10; i++) buff.onUpdate();
    expect(buff.emberCount, 'the trail ran while he stood still').toBe(0);

    for (let i = 0; i < 10; i++) {
      olaf.position.set(olaf.position.x + 40, 0);
      buff.onUpdate();
    }
    expect(buff.emberCount).toBeGreaterThan(0);
  });

  it('lets the trail burn out behind him', () => {
    const buff = cast();
    // One tick to seed where he is standing — the first frame records a
    // position rather than dropping an ember, so the trail never starts with a
    // phantom mark at the origin.
    buff.onUpdate();
    olaf.position.set(400, 0);
    buff.onUpdate();
    expect(buff.emberCount).toBe(1);

    vi.stubGlobal('deltaTime', 2_000);
    buff.onUpdate();

    expect(buff.emberCount, 'embers never went out').toBe(0);
  });

  it('grants the speed the tooltip prints', () => {
    const base = olaf.stats.speed.value;
    cast();
    expect(olaf.stats.speed.value).toBeCloseTo(base * (1 + SPEED_PERCENT), 5);
  });
});
