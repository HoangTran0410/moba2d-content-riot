import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApi } from '@moba2d/core/testing';
import type { CastContext } from '@moba2d/core/content/types';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import { ABLAZE_STACK_ID, DAMAGE as Q_DAMAGE, STUN_DURATION_MS, isAblaze } from '../../spells/Brand_Q';
import Brand_Q, { Brand_Q_Missile, applyAblaze } from '../../spells/Brand_Q';
import { ABLAZE_DAMAGE_BONUS, DAMAGE as W_DAMAGE, ERUPT_DELAY_MS } from '../../spells/Brand_W';
import Brand_W, { Brand_W_Object } from '../../spells/Brand_W';
import { ABLAZE_SPREAD_RADIUS, DAMAGE as E_DAMAGE, SPREAD_RADIUS } from '../../spells/Brand_E';
import Brand_E from '../../spells/Brand_E';
import { BOUNCE_COUNT, DAMAGE_PER_BOUNCE } from '../../spells/Brand_R';
import Brand_R, { Brand_R_Fireball } from '../../spells/Brand_R';
const __api = buildTestApi();
const { AttackableUnit } = __api.units;
const { Slow, Stun } = __api.buffs;
type AttackableUnit = InstanceType<typeof __api.units.AttackableUnit>;

function unit(game: TestGame, x: number, teamId: string): AttackableUnit {
  const result = createUnit(game, x, teamId);
  result.collisionRadius = 5;
  result.stats.mana.baseValue = 300;
  result.stats.health.baseValue = 200;
  result.stats.maxHealth.baseValue = 200;
  result.animatedValues.displaySize = 55;
  return result;
}

const castContext = (
  owner: AttackableUnit,
  cursorWorld: { x: number; y: number },
  target?: unknown
): CastContext =>
  Object.freeze({
    spellId: 'brand',
    activationId: 'activation',
    startedAtMs: 1,
    caster: owner,
    origin: Object.freeze({ x: owner.position.x, y: owner.position.y }),
    cursorWorld: Object.freeze(cursorWorld),
    direction: Object.freeze({ x: 1, y: 0 }),
    ...(target === undefined ? {} : { target }),
  });

describe('Brand', () => {
  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 250);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('Q ignites a clean target and stuns one that was already burning', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    game.setPlayer(owner);
    const enemy = unit(game, 300, 'red');
    game.objectManager.objects.push(owner, enemy);
    game.objectManager.update();

    const spell = new Brand_Q(owner);
    expect(spell.press(castContext(owner, { x: 300, y: 0 }))).toBe(true);
    spell.update();

    const missile = game.objectManager._objectToBeAdd.find(
      (object): object is Brand_Q_Missile => object instanceof Brand_Q_Missile
    );
    if (!missile) throw new Error('Brand Q must create its missile.');

    missile.onHit(enemy);
    expect(enemy.stats.health.value).toBe(200 - Q_DAMAGE);
    expect(isAblaze(enemy)).toBe(true);
    expect(enemy.buffs.some(buff => buff instanceof Stun)).toBe(false);

    missile.onHit(enemy);
    const stun = enemy.buffs.find(buff => buff instanceof Stun);
    expect(stun?.duration).toBe(STUN_DURATION_MS);
  });

  it('W deals nothing until the pillar erupts, and hits a burning target harder', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    game.setPlayer(owner);
    const clean = unit(game, 300, 'red');
    const burning = unit(game, 320, 'red');
    applyAblaze(owner, burning, null);
    game.objectManager.objects.push(owner, clean, burning);
    game.objectManager.update();

    const spell = new Brand_W(owner);
    expect(spell.press(castContext(owner, { x: 310, y: 0 }))).toBe(true);
    spell.update();

    const pillar = game.objectManager._objectToBeAdd.find(
      (object): object is Brand_W_Object => object instanceof Brand_W_Object
    );
    if (!pillar) throw new Error('Brand W must create its pillar.');

    const cleanDamage = vi.spyOn(clean, 'takeDamage');
    const burningDamage = vi.spyOn(burning, 'takeDamage');

    expect(ERUPT_DELAY_MS).toBeGreaterThan(500);
    pillar.update();
    pillar.update(); // 500ms in, still telegraphing
    expect(cleanDamage).not.toHaveBeenCalled();

    pillar.update(); // 750ms in, past the delay
    expect(pillar.hasErupted).toBe(true);
    expect(cleanDamage).toHaveBeenCalledWith(W_DAMAGE, owner, 'MAGIC', expect.any(String));
    expect(burningDamage).toHaveBeenCalledWith(W_DAMAGE * (1 + ABLAZE_DAMAGE_BONUS), owner, 'MAGIC', expect.any(String));
  });

  it('E only reaches the far bystander once the primary target is already burning', () => {
    const game = createGame();
    const owner = unit(game, -300, 'blue');
    game.setPlayer(owner);
    const primary = unit(game, 0, 'red');
    const bystander = unit(game, SPREAD_RADIUS + 50, 'red');
    expect(SPREAD_RADIUS + 50).toBeLessThan(ABLAZE_SPREAD_RADIUS);
    game.objectManager.objects.push(owner, primary, bystander);
    game.objectManager.update();

    const bystanderDamage = vi.spyOn(bystander, 'takeDamage');

    const first = new Brand_E(owner);
    expect(first.press(castContext(owner, primary.position, primary))).toBe(true);
    first.update();
    expect(primary.stats.health.value).toBe(200 - E_DAMAGE);
    expect(bystanderDamage).not.toHaveBeenCalled();

    // the first cast left the primary Ablaze, so the second spreads twice as far
    expect(isAblaze(primary)).toBe(true);
    const second = new Brand_E(owner);
    expect(second.press(castContext(owner, primary.position, primary))).toBe(true);
    second.update();
    expect(bystanderDamage).toHaveBeenCalledWith(E_DAMAGE, owner, 'MAGIC', expect.any(String));
  });

  it('R hits for every bounce it owes, slowing only once the victim is burning', () => {
    const game = createGame();
    const owner = unit(game, 0, 'blue');
    game.setPlayer(owner);
    const enemy = unit(game, 120, 'red');
    game.objectManager.objects.push(owner, enemy);
    game.objectManager.update();

    const spell = new Brand_R(owner);
    expect(spell.press(castContext(owner, enemy.position, enemy))).toBe(true);
    spell.update();

    const fireball = game.objectManager._objectToBeAdd.find(
      (object): object is Brand_R_Fireball => object instanceof Brand_R_Fireball
    );
    if (!fireball) throw new Error('Brand R must create its fireball.');

    const damage = vi.spyOn(enemy, 'takeDamage');
    for (let i = 0; i < 400 && !fireball.toRemove; i++) {
      fireball.update();
      if (damage.mock.calls.length === 1) {
        // the first bounce is what set them alight, so nothing is slowed yet
        expect(enemy.buffs.some(buff => buff instanceof Slow)).toBe(false);
      }
    }

    expect(fireball.toRemove).toBe(true);
    expect(damage.mock.calls).toHaveLength(BOUNCE_COUNT);
    expect(damage).toHaveBeenCalledWith(DAMAGE_PER_BOUNCE, owner, 'MAGIC', expect.any(String));
    expect(enemy.buffs.some(buff => buff instanceof Slow)).toBe(true);
    expect(enemy.buffs.some(buff => buff.stackId === ABLAZE_STACK_ID)).toBe(true);
  });
});
