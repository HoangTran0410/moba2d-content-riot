/**
 * Shen — the tank whose whole kit is other people's safety.
 *
 * Four spells, four rules that are invisible from the file being edited: the
 * blade has to come *home* before it empowers anything (and it gets one hit per
 * pass, not one per frame); the refuge has to renew its disarm rather than
 * stack ten of them; the dash has to taunt without rooting; and the rescue has
 * to refuse Shen himself and pay out only when the channel actually finishes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Slow as SlowBuff } from '@moba2d/core/content/types';
import { buildTestApi, indexObjects, stubGameGlobals } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';

import Shen_Q, {
  Shen_Q_Blade,
  Shen_Q_Empower,
  BLADE_REACH,
  BONUS_ATTACK_RANGE,
  COOLDOWN_MS as Q_COOLDOWN_MS,
  MANA_COST as Q_MANA_COST,
  EMPOWERED_ATTACKS,
  EMPOWERED_BONUS,
  EMPOWERED_BONUS_VS_CHAMPION,
  EMPOWER_WINDOW_MS,
  PASS_DAMAGE,
  SLOW_DURATION_MS,
  SLOW_PERCENT,
  SLOW_STACK_ID,
} from '../../spells/Shen_Q';
import Shen_W, {
  Shen_W_Zone,
  COOLDOWN_MS as W_COOLDOWN_MS,
  DISARM_STACK_ID,
  DISARM_TAIL_MS,
  MANA_COST as W_MANA_COST,
  ZONE_DURATION_MS,
  ZONE_RADIUS,
} from '../../spells/Shen_W';
import Shen_E, {
  COOLDOWN_MS as E_COOLDOWN_MS,
  DASH_DAMAGE,
  DASH_DISTANCE,
  MANA_COST as E_MANA_COST,
  TAUNT_DURATION_MS,
} from '../../spells/Shen_E';
import Shen_R, {
  CHANNEL_DURATION_MS,
  COOLDOWN_MS as R_COOLDOWN_MS,
  MANA_COST as R_MANA_COST,
  RESCUE_RANGE,
  SHIELD_ALLY,
  SHIELD_DURATION_MS,
  SHIELD_SELF,
  SHIELD_STACK_ID,
} from '../../spells/Shen_R';

const api = buildTestApi();
const { Champion } = api.units;
const { Dash, Disarm, Shield, Slow, Taunt } = api.buffs;

type AnyBuff = InstanceType<typeof api.buffs.Buff>;
type AnyUnit = InstanceType<typeof api.units.AttackableUnit>;
type AnyChampion = InstanceType<typeof api.units.Champion>;

const live = (unit: { buffs: AnyBuff[] }): AnyBuff[] => unit.buffs.filter(buff => !buff.toRemove);

let game: TestGame;
let playerSet = false;

beforeEach(() => {
  stubGameGlobals();
  // The richer TestVector and the maths helpers real spell code reaches for;
  // both must land after stubGameGlobals to win.
  installSpellObjectGlobals();
  installSketchMathGlobals();
  game = createGame();
  playerSet = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A real champion — Shen's kit tells champions apart from everything else. */
const champion = (teamId: string, x: number, y = 0): AnyChampion => {
  const unit = new Champion({ game, teamId } as never);
  unit.position.set(x, y);
  unit.destination.set(x, y);
  // `isAllied` — which every display box reads — asks the game who the player is.
  if (!playerSet) {
    game.setPlayer(unit);
    playerSet = true;
  }
  return unit;
};

/** Everything in the world plus everything queued to join it this tick. */
const worldObjects = (): unknown[] => [
  ...game.objectManager.objects,
  ...game.objectManager._objectToBeAdd,
];

const bladeInWorld = (): Shen_Q_Blade =>
  worldObjects().find((object): object is Shen_Q_Blade => object instanceof Shen_Q_Blade)!;

const zoneInWorld = (): Shen_W_Zone =>
  worldObjects().find((object): object is Shen_W_Zone => object instanceof Shen_W_Zone)!;

const dashOn = (unit: AnyUnit): InstanceType<typeof Dash> =>
  live(unit).find((buff): buff is InstanceType<typeof Dash> => buff instanceof Dash)!;

/** Runs one object's own clock until it retires, with a hard stop. */
const runToEnd = (object: { update(): void; toRemove: boolean }): void => {
  for (let frame = 0; frame < 600 && !object.toRemove; frame++) object.update();
};

/** Runs the world's clock forward for one object, `deltaTime` at a time. */
const advance = (object: { update(): void }, ms: number): void => {
  for (let elapsed = 0; elapsed < ms; elapsed += 16) object.update();
};

const swing = (attacker: AnyUnit, victim: AnyUnit, echo = false): void =>
  api.combat.applyOnHitEffects({ attacker, victim, damage: 10, ranged: false, crit: false, echo });

describe('Shen — the tuning each spell states once', () => {
  it('bills every spell out of its own exported constants', () => {
    const shen = champion('blue', 200);

    const q = new Shen_Q(shen);
    expect([q.coolDown, q.manaCost, q.range]).toEqual([Q_COOLDOWN_MS, Q_MANA_COST, BLADE_REACH]);

    const w = new Shen_W(shen);
    expect([w.coolDown, w.manaCost, w.range]).toEqual([W_COOLDOWN_MS, W_MANA_COST, ZONE_RADIUS]);

    const e = new Shen_E(shen);
    expect([e.coolDown, e.manaCost, e.range]).toEqual([E_COOLDOWN_MS, E_MANA_COST, DASH_DISTANCE]);

    const r = new Shen_R(shen);
    expect([r.coolDown, r.manaCost, r.range]).toEqual([R_COOLDOWN_MS, R_MANA_COST, RESCUE_RANGE]);
    // A class-field literal over ten seconds is a seam violation; the ultimate
    // sits exactly on the ceiling and must not drift over it.
    expect(r.coolDown).toBeLessThanOrEqual(10_000);
  });
});

describe('Shen Q — Công Kích Hoàng Hôn', () => {
  it('throws the spirit blade the full reach along the aim direction', () => {
    const shen = champion('blue', 200);
    indexObjects(game, [shen]);
    const spell = new Shen_Q(shen);

    expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);

    const blade = bladeInWorld();
    expect(blade).toBeTruthy();
    expect(blade.destination.x - shen.position.x).toBeCloseTo(BLADE_REACH, 3);
  });

  it('cuts an enemy once on the way out and once on the way home', () => {
    const shen = champion('blue', 200);
    const enemy = createUnit(game, 380, 'red');
    indexObjects(game, [shen, enemy]);
    const hurt = vi.spyOn(enemy, 'takeDamage');
    const spell = new Shen_Q(shen);

    expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);
    runToEnd(bladeInWorld());

    expect(hurt).toHaveBeenCalledTimes(2);
    expect(hurt.mock.calls[0].slice(0, 2)).toEqual([PASS_DAMAGE, shen]);
    expect(hurt.mock.calls[1].slice(0, 2)).toEqual([PASS_DAMAGE, shen]);
  });

  it('renews its slow on the second pass instead of stacking a second one', () => {
    const shen = champion('blue', 200);
    const enemy = createUnit(game, 380, 'red');
    indexObjects(game, [shen, enemy]);
    const spell = new Shen_Q(shen);

    expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);
    runToEnd(bladeInWorld());

    expect(live(enemy).filter(buff => buff instanceof Slow)).toHaveLength(1);

    const slow = live(enemy).find((buff): buff is SlowBuff => buff instanceof Slow)!;
    expect(slow.percent).toBe(SLOW_PERCENT);
    expect(slow.duration).toBe(SLOW_DURATION_MS);
    expect(slow.stackId).toBe(SLOW_STACK_ID);
  });

  it('passes straight through the caster and his allies', () => {
    const shen = champion('blue', 200);
    const ally = createUnit(game, 380, 'blue');
    indexObjects(game, [shen, ally]);
    const allyHurt = vi.spyOn(ally, 'takeDamage');
    const shenHurt = vi.spyOn(shen, 'takeDamage');
    const spell = new Shen_Q(shen);

    expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);
    runToEnd(bladeInWorld());

    expect(allyHurt).not.toHaveBeenCalled();
    expect(shenHurt).not.toHaveBeenCalled();
  });

  it('empowers nothing until the blade is actually back home', () => {
    const shen = champion('blue', 200);
    indexObjects(game, [shen]);
    const spell = new Shen_Q(shen);

    expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);
    expect(live(shen).some(buff => buff instanceof Shen_Q_Empower)).toBe(false);

    const blade = bladeInWorld();
    runToEnd(blade);

    const empower = live(shen).find(
      (buff): buff is Shen_Q_Empower => buff instanceof Shen_Q_Empower
    )!;
    expect(empower).toBeTruthy();
    expect(empower.stacks).toBe(EMPOWERED_ATTACKS);
    expect(empower.duration).toBe(EMPOWER_WINDOW_MS);
    // A stack count is exactly the kind of state the player has to glance at.
    expect(empower.hudVisible).toBe(true);
  });

  it('spends one stack per real basic attack, and none on an echoed one', () => {
    const shen = champion('blue', 200);
    const victim = createUnit(game, 260, 'red');
    indexObjects(game, [shen, victim]);
    const empower = new Shen_Q_Empower(EMPOWER_WINDOW_MS, shen, shen);
    shen.addBuff(empower);
    const hurt = vi.spyOn(victim, 'takeDamage');

    // A propagated phantom hit is not the attack the empowerment is for.
    swing(shen, victim, true);
    expect(hurt).not.toHaveBeenCalled();
    expect(empower.stacks).toBe(EMPOWERED_ATTACKS);

    for (let i = 0; i < EMPOWERED_ATTACKS; i++) swing(shen, victim);
    expect(hurt).toHaveBeenCalledTimes(EMPOWERED_ATTACKS);
    expect(hurt.mock.calls[0].slice(0, 2)).toEqual([EMPOWERED_BONUS, shen]);
    expect(empower.toRemove).toBe(true);

    // Spent is spent: the fourth swing is an ordinary one.
    swing(shen, victim);
    expect(hurt).toHaveBeenCalledTimes(EMPOWERED_ATTACKS);
  });

  it('hits harder when the blade clipped an enemy champion on the way', () => {
    const shen = champion('blue', 200);
    const victim = createUnit(game, 260, 'red');
    indexObjects(game, [shen, victim]);
    const empower = new Shen_Q_Empower(EMPOWER_WINDOW_MS, shen, shen);
    empower.championHit = true;
    shen.addBuff(empower);
    const hurt = vi.spyOn(victim, 'takeDamage');

    swing(shen, victim);

    expect(hurt.mock.calls[0].slice(0, 2)).toEqual([EMPOWERED_BONUS_VS_CHAMPION, shen]);
  });

  it('records whether the blade clipped a champion at all', () => {
    const shen = champion('blue', 200);
    const enemyChampion = champion('red', 380);
    indexObjects(game, [shen, enemyChampion]);
    const spell = new Shen_Q(shen);

    expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);
    runToEnd(bladeInWorld());

    const empower = live(shen).find(
      (buff): buff is Shen_Q_Empower => buff instanceof Shen_Q_Empower
    )!;
    expect(empower.championHit).toBe(true);
  });

  it('leaves the empowerment at its lower number when only minions were clipped', () => {
    const shen = champion('blue', 200);
    const minion = createUnit(game, 380, 'red');
    indexObjects(game, [shen, minion]);
    const spell = new Shen_Q(shen);

    expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);
    runToEnd(bladeInWorld());

    const empower = live(shen).find(
      (buff): buff is Shen_Q_Empower => buff instanceof Shen_Q_Empower
    )!;
    expect(empower.championHit).toBe(false);
  });

  it('lengthens Shen’s reach while the empowerment is up, and gives it back after', () => {
    const shen = champion('blue', 200);
    indexObjects(game, [shen]);
    const before = shen.stats.attackRange.value;

    const empower = new Shen_Q_Empower(EMPOWER_WINDOW_MS, shen, shen);
    shen.addBuff(empower);
    expect(shen.stats.attackRange.value - before).toBe(BONUS_ATTACK_RANGE);

    empower.deactivateBuff();
    expect(shen.stats.attackRange.value).toBe(before);
  });
});

describe('Shen W — Bảo Hộ Linh Hồn', () => {
  const openRefuge = (shen: AnyChampion): Shen_W_Zone => {
    const spell = new Shen_W(shen);
    expect(pressSpell(spell, { at: shen.position })).toBe(true);
    return zoneInWorld();
  };

  it('disarms every enemy inside it and nobody else', () => {
    const shen = champion('blue', 300);
    const enemy = createUnit(game, 380, 'red');
    const ally = createUnit(game, 360, 'blue');
    const outside = createUnit(game, 300 + ZONE_RADIUS + 160, 'red');
    indexObjects(game, [shen, enemy, ally, outside]);

    const zone = openRefuge(shen);
    zone.update(100);

    expect(live(enemy).some(buff => buff instanceof Disarm)).toBe(true);
    expect(live(ally).some(buff => buff instanceof Disarm)).toBe(false);
    expect(live(outside).some(buff => buff instanceof Disarm)).toBe(false);
  });

  it('actually stops the enemy attacking — that is the whole ability', () => {
    const shen = champion('blue', 300);
    const enemy = createUnit(game, 380, 'red');
    indexObjects(game, [shen, enemy]);

    const zone = openRefuge(shen);
    zone.update(100);
    enemy.updateBuffs();

    expect(enemy.canAttack).toBe(false);
    // A refuge is not a stun: he can still walk out of it, and still cast.
    expect(enemy.canMove).toBe(true);
    expect(enemy.canCast).toBe(true);
  });

  it('renews the disarm every tick instead of stacking one per tick', () => {
    const shen = champion('blue', 300);
    const enemy = createUnit(game, 380, 'red');
    indexObjects(game, [shen, enemy]);

    const zone = openRefuge(shen);
    for (let elapsed = 0; elapsed < 1_000; elapsed += 100) zone.update(100);

    const disarms = live(enemy).filter(buff => buff instanceof Disarm);
    expect(disarms).toHaveLength(1);
    expect(disarms[0].stackId).toBe(DISARM_STACK_ID);
  });

  it('lets go a short tail after the enemy walks out', () => {
    const shen = champion('blue', 300);
    const enemy = createUnit(game, 380, 'red');
    indexObjects(game, [shen, enemy]);

    const zone = openRefuge(shen);
    zone.update(100);
    const disarm = live(enemy).find(buff => buff instanceof Disarm)!;
    expect(disarm.duration).toBe(DISARM_TAIL_MS);

    enemy.position.set(300 + ZONE_RADIUS + 400, 0);
    zone.update(100);
    expect(zone.members.has(enemy)).toBe(false);

    // Nothing re-applies it now, so the tail simply runs out.
    for (let elapsed = 0; elapsed <= DISARM_TAIL_MS + 32; elapsed += 16) enemy.updateBuffs();
    expect(disarm.toRemove).toBe(true);
    expect(enemy.canAttack).toBe(true);
  });

  it('draws as ground art at exactly the radius the disarm uses', () => {
    const shen = champion('blue', 300);
    indexObjects(game, [shen]);

    const zone = openRefuge(shen);

    expect(zone.radius).toBe(ZONE_RADIUS);
    expect(zone.zIndex).toBe(api.layers.GROUND_Z_INDEX);
  });

  it('closes on its own after its stated duration', () => {
    const shen = champion('blue', 300);
    indexObjects(game, [shen]);

    const zone = openRefuge(shen);
    for (let elapsed = 0; elapsed < ZONE_DURATION_MS + 200; elapsed += 100) zone.update(100);

    expect(zone.toRemove).toBe(true);
  });
});

describe('Shen E — Vô Ảnh Bộ', () => {
  it('dashes a fixed distance toward the aim point', () => {
    const shen = champion('blue', 200);
    indexObjects(game, [shen]);
    const spell = new Shen_E(shen);

    expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);

    const dash = dashOn(shen);
    expect(dash).toBeTruthy();
    expect(dash.dashDestination!.x - 200).toBeCloseTo(DASH_DISTANCE, 3);
  });

  it('damages and taunts every enemy champion it passes, once each', () => {
    const shen = champion('blue', 200);
    const victim = champion('red', 320);
    const minion = createUnit(game, 380, 'red');
    const friend = champion('blue', 440);
    indexObjects(game, [shen, victim, minion, friend]);
    const hurt = vi.spyOn(victim, 'takeDamage');
    const minionHurt = vi.spyOn(minion, 'takeDamage');
    const friendHurt = vi.spyOn(friend, 'takeDamage');
    const spell = new Shen_E(shen);

    expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);
    runToEnd(dashOn(shen));

    expect(hurt).toHaveBeenCalledTimes(1);
    expect(hurt.mock.calls[0].slice(0, 2)).toEqual([DASH_DAMAGE, shen]);
    // Minions are not what a taunt is for, and allies never are.
    expect(minionHurt).not.toHaveBeenCalled();
    expect(friendHurt).not.toHaveBeenCalled();

    const taunt = live(victim).find(buff => buff instanceof Taunt)!;
    expect(taunt).toBeTruthy();
    expect(taunt.duration).toBe(TAUNT_DURATION_MS);
    expect(live(friend).some(buff => buff instanceof Taunt)).toBe(false);
  });

  it('leaves its victim able to walk and swing — the one control effect that does', () => {
    const shen = champion('blue', 200);
    const victim = champion('red', 320);
    indexObjects(game, [shen, victim]);
    const spell = new Shen_E(shen);

    expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);
    runToEnd(dashOn(shen));
    victim.updateBuffs();

    expect(victim.canMove).toBe(true);
    expect(victim.canAttack).toBe(true);
    // Taken away, so the taunted enemy cannot answer with an ability.
    expect(victim.canCast).toBe(false);
  });

  it('carries Shen the whole way, rather than playing the dash standing still', () => {
    const shen = champion('blue', 200);
    indexObjects(game, [shen]);
    const spell = new Shen_E(shen);

    expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);
    runToEnd(dashOn(shen));

    expect(shen.position.x - 200).toBeGreaterThan(DASH_DISTANCE - 20);
  });
});

describe('Shen R — Nhất Thống', () => {
  it('reaches an ally anywhere on the map', () => {
    const shen = champion('blue', 100);
    const ally = champion('blue', 900, 700);
    indexObjects(game, [shen, ally]);
    const spell = new Shen_R(shen);

    expect(RESCUE_RANGE).toBeGreaterThan(2_000);
    expect(pressSpell(spell, { target: ally })).toBe(true);
  });

  it('refuses Shen himself — it is a rescue, not a self-shield', () => {
    const shen = champion('blue', 100);
    indexObjects(game, [shen]);
    const spell = new Shen_R(shen);

    expect(pressSpell(spell, { target: shen })).toBe(false);
    expect(live(shen).some(buff => buff instanceof Shield)).toBe(false);
  });

  it('refuses an enemy champion', () => {
    const shen = champion('blue', 100);
    const enemy = champion('red', 400);
    indexObjects(game, [shen, enemy]);
    const spell = new Shen_R(shen);

    expect(pressSpell(spell, { target: enemy })).toBe(false);
  });

  it('pays out only when the channel finishes: shields both and blinks to the ally', () => {
    const shen = champion('blue', 100);
    const ally = champion('blue', 700, 400);
    indexObjects(game, [shen, ally]);
    const spell = new Shen_R(shen);

    expect(pressSpell(spell, { target: ally })).toBe(true);
    expect(spell.state).toBe('CHANNELING');
    expect(live(ally).some(buff => buff instanceof Shield)).toBe(false);

    advance(spell, CHANNEL_DURATION_MS + 64);

    const allyShield = live(ally).find(
      (buff): buff is InstanceType<typeof Shield> => buff instanceof Shield
    )!;
    const shenShield = live(shen).find(
      (buff): buff is InstanceType<typeof Shield> => buff instanceof Shield
    )!;
    expect(allyShield.amount).toBe(SHIELD_ALLY);
    expect(shenShield.amount).toBe(SHIELD_SELF);
    expect(allyShield.duration).toBe(SHIELD_DURATION_MS);
    expect(allyShield.stackId).toBe(SHIELD_STACK_ID);
    expect(shenShield.stackId).toBe(SHIELD_STACK_ID);

    // He arrived: from 670 units away to standing beside her.
    expect(shen.position.dist(ally.position)).toBeLessThan(120);
  });

  it('cancels — and shields nobody — when the ally dies mid-channel', () => {
    const shen = champion('blue', 100);
    const ally = champion('blue', 700, 400);
    indexObjects(game, [shen, ally]);
    const spell = new Shen_R(shen);

    expect(pressSpell(spell, { target: ally })).toBe(true);
    (ally as unknown as { deathData: unknown }).deathData = { at: 0 };
    spell.update();

    expect(spell.state).not.toBe('CHANNELING');

    advance(spell, CHANNEL_DURATION_MS + 64);
    expect(live(ally).some(buff => buff instanceof Shield)).toBe(false);
    expect(live(shen).some(buff => buff instanceof Shield)).toBe(false);
    expect(shen.position.x).toBe(100);
  });
});
