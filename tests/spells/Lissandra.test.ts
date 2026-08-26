/**
 * Lissandra — the ice mage whose two interesting halves are a projectile she
 * can teleport onto and an ultimate she casts on herself.
 *
 * Every cast goes through `pressSpell`, never a lifecycle hook: the
 * `spell-runtime-drive` seam bans the second, and a hook called by hand runs
 * that hook alone — no activation pattern, no resource commit, no cooldown, no
 * refusal. E's whole mechanic *is* the refusal window, so a suite that called
 * `onSpellCast` twice in a row would prove nothing about it.
 *
 * Tuning arrives as imported constants. The numbers written out longhand are
 * the probe values only — a hit of 8 healing 20 up to 44 — because a probe that
 * recomputes the rule it is checking agrees with that rule however wrong the
 * rule is.
 */
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

import Lissandra_Q, {
  Lissandra_Q_Shard,
  Lissandra_Q_Shatter,
  Q_DAMAGE,
  Q_RANGE,
  Q_SHATTER_RANGE,
  Q_SLOW_DURATION_MS,
  Q_SLOW_PERCENT,
  Q_SLOW_STACK_ID,
} from '../../spells/Lissandra_Q';
import Lissandra_W, {
  Lissandra_W_Ring,
  W_DAMAGE,
  W_RADIUS,
  W_ROOT_DURATION_MS,
} from '../../spells/Lissandra_W';
import Lissandra_E, {
  E_CLAW_LINGER_MS,
  E_CLAW_SPEED_END,
  E_CLAW_SPEED_START,
  E_DAMAGE,
  E_FLIGHT_MS,
  E_MANA_COST,
  E_RANGE,
  E_RECAST_DELAY_MS,
  Lissandra_E_Blink,
  Lissandra_E_Claw,
} from '../../spells/Lissandra_E';
import Lissandra_R, {
  Lissandra_R_Field,
  Lissandra_R_Tomb,
  R_FIELD_DAMAGE,
  R_FIELD_SLOW_PERCENT,
  R_FIELD_SLOW_STACK_ID,
  R_HEAL_PER_TICK_MIN,
  R_HEAL_TICKS,
  R_HEAL_TICK_MS,
  R_STASIS_MS,
} from '../../spells/Lissandra_R';

const api = buildTestApi();
const { BuffAddType } = api.enums;
const { Root, Slow, Stasis } = api.buffs;

type AnyBuff = InstanceType<typeof api.buffs.Buff>;
type Unit = InstanceType<typeof api.units.AttackableUnit>;

/** The buffs actually still on a unit — `deactivateBuff` marks, it does not splice. */
const live = (unit: { buffs: AnyBuff[] }): AnyBuff[] => unit.buffs.filter(b => !b.toRemove);

/**
 * A plain loop rather than `filter`, because `Array.prototype.filter` is
 * polyfilled here and its merged declaration puts the non-predicate overload
 * first — a type guard passed to it still comes back wide.
 */
const buffsOfKind = <T extends AnyBuff>(
  unit: { buffs: AnyBuff[] },
  kind: abstract new (...args: never[]) => T
): T[] => {
  const found: T[] = [];
  for (const buff of live(unit)) {
    if (buff instanceof kind) found.push(buff);
  }
  return found;
};

let game: TestGame;

/** Whatever the cast just put into the world — objects land here until a manager tick. */
const spawned = <T>(kind: abstract new (...args: never[]) => T): T =>
  game.objectManager._objectToBeAdd.find((o: unknown) => o instanceof kind) as T;

const spawnedAll = <T>(kind: abstract new (...args: never[]) => T): T[] =>
  game.objectManager._objectToBeAdd.filter((o: unknown) => o instanceof kind) as T[];

const fly = (missile: { toRemove: boolean; update(): void }, maxFrames = 400): void => {
  for (let frame = 0; frame < maxFrames && !missile.toRemove; frame++) missile.update();
};

describe('Lissandra', () => {
  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    game = createGame();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Q — Mảnh Băng', () => {
    it('launches a narrow shard exactly its own reach along the aim', () => {
      const caster = createUnit(game, 0, 'blue');
      game.setPlayer(caster);
      indexObjects(game, [caster]);

      expect(pressSpell(new Lissandra_Q(caster), { at: { x: 900, y: 0 } })).toBe(true);

      const shard = spawned(Lissandra_Q_Shard);
      expect(shard).toBeTruthy();
      expect(shard.destination.x).toBeCloseTo(Q_RANGE);
      expect(shard.destination.y).toBeCloseTo(0);
    });

    it('damages and slows what it hits, for the tuned amount and duration', () => {
      const caster = createUnit(game, 0, 'blue');
      const victim = createUnit(game, 150, 'red');
      game.setPlayer(caster);
      indexObjects(game, [caster, victim]);
      const hurt = vi.spyOn(victim, 'takeDamage');

      pressSpell(new Lissandra_Q(caster), { at: { x: 900, y: 0 } });
      fly(spawned(Lissandra_Q_Shard));

      expect(hurt).toHaveBeenCalledTimes(1);
      expect(hurt.mock.calls[0].slice(0, 2)).toEqual([Q_DAMAGE, caster]);
      expect(hurt.mock.calls[0][2]).toBe('MAGIC');
      expect(hurt.mock.calls[0][3]).toEqual(expect.any(String));

      const slows = buffsOfKind(victim, Slow);
      expect(slows).toHaveLength(1);
      expect(slows[0].percent).toBe(Q_SLOW_PERCENT);
      expect(slows[0].duration).toBe(Q_SLOW_DURATION_MS);
      expect(slows[0].stackId).toBe(Q_SLOW_STACK_ID);
      expect(slows[0].buffAddType).toBe(BuffAddType.RENEW_EXISTING);
    });

    it('shatters on the first body into a wider, faster missile carrying further along the same line', () => {
      const caster = createUnit(game, 0, 'blue');
      const victim = createUnit(game, 150, 'red');
      game.setPlayer(caster);
      indexObjects(game, [caster, victim]);

      pressSpell(new Lissandra_Q(caster), { at: { x: 900, y: 0 } });
      const shard = spawned(Lissandra_Q_Shard);
      fly(shard);

      const shatter = spawned(Lissandra_Q_Shatter);
      expect(shatter, 'the shard never shattered').toBeTruthy();
      // visibly a different object: broader and quicker, per the VFX standard's
      // "every zone that behaves differently looks different"
      expect(shatter.size).toBeGreaterThan(shard.size);
      expect(shatter.speed).toBeGreaterThan(shard.speed);
      // and it starts where the shard died, carrying the extra reach onward
      expect(shatter.position.x).toBeCloseTo(shard.position.x);
      expect(shatter.destination.x - shatter.position.x).toBeCloseTo(Q_SHATTER_RANGE);
      expect(shatter.destination.y).toBeCloseTo(0);
    });

    it('never lets the shattered pass hit the body it shattered on again', () => {
      const caster = createUnit(game, 0, 'blue');
      const first = createUnit(game, 150, 'red');
      const second = createUnit(game, 250, 'red');
      game.setPlayer(caster);
      indexObjects(game, [caster, first, second]);
      const hurtFirst = vi.spyOn(first, 'takeDamage');
      const hurtSecond = vi.spyOn(second, 'takeDamage');

      pressSpell(new Lissandra_Q(caster), { at: { x: 900, y: 0 } });
      fly(spawned(Lissandra_Q_Shard));

      const shatter = spawned(Lissandra_Q_Shatter);
      expect(shatter.hitTargets).toContain(first);
      fly(shatter);

      expect(hurtFirst, 'the shattered pass re-hit the body it shattered on').toHaveBeenCalledTimes(
        1
      );
      expect(hurtSecond, 'the shattered pass reached nobody fresh').toHaveBeenCalledTimes(1);
    });

    it('touches neither an ally standing in the line nor the caster', () => {
      const caster = createUnit(game, 0, 'blue');
      const ally = createUnit(game, 150, 'blue');
      game.setPlayer(caster);
      indexObjects(game, [caster, ally]);
      const hurtAlly = vi.spyOn(ally, 'takeDamage');
      const hurtCaster = vi.spyOn(caster, 'takeDamage');

      pressSpell(new Lissandra_Q(caster), { at: { x: 900, y: 0 } });
      fly(spawned(Lissandra_Q_Shard));

      expect(hurtAlly).not.toHaveBeenCalled();
      expect(hurtCaster).not.toHaveBeenCalled();
      expect(live(ally)).toHaveLength(0);
      // nothing was hit, so nothing shattered
      expect(spawnedAll(Lissandra_Q_Shatter)).toHaveLength(0);
    });
  });

  describe('W — Vòng Tròn Lạnh Giá', () => {
    it('damages and roots everyone inside the ring for the tuned duration', () => {
      const caster = createUnit(game, 0, 'blue');
      const inside = createUnit(game, W_RADIUS - 40, 'red');
      game.setPlayer(caster);
      indexObjects(game, [caster, inside]);
      const hurt = vi.spyOn(inside, 'takeDamage');

      expect(pressSpell(new Lissandra_W(caster))).toBe(true);

      expect(hurt).toHaveBeenCalledTimes(1);
      expect(hurt.mock.calls[0].slice(0, 2)).toEqual([W_DAMAGE, caster]);
      expect(hurt.mock.calls[0][2]).toBe('MAGIC');

      const roots = buffsOfKind(inside, Root);
      expect(roots).toHaveLength(1);
      expect(roots[0].duration).toBe(W_ROOT_DURATION_MS);
    });

    it('reaches nobody past its radius, and never an ally or the caster', () => {
      const caster = createUnit(game, 0, 'blue');
      const outside = createUnit(game, W_RADIUS + 120, 'red');
      const ally = createUnit(game, 60, 'blue');
      game.setPlayer(caster);
      indexObjects(game, [caster, outside, ally]);
      const hurtOutside = vi.spyOn(outside, 'takeDamage');
      const hurtAlly = vi.spyOn(ally, 'takeDamage');
      const hurtCaster = vi.spyOn(caster, 'takeDamage');

      pressSpell(new Lissandra_W(caster));

      expect(hurtOutside).not.toHaveBeenCalled();
      expect(hurtAlly).not.toHaveBeenCalled();
      expect(hurtCaster).not.toHaveBeenCalled();
      expect(buffsOfKind(outside, Root)).toHaveLength(0);
      expect(live(ally)).toHaveLength(0);
      expect(live(caster)).toHaveLength(0);
    });

    it('draws its ring at exactly the radius the root really uses', () => {
      const caster = createUnit(game, 0, 'blue');
      game.setPlayer(caster);
      indexObjects(game, [caster]);

      pressSpell(new Lissandra_W(caster));

      const ring = spawned(Lissandra_W_Ring);
      expect(ring, 'the panic button drew nothing').toBeTruthy();
      expect(ring.radius).toBe(W_RADIUS);
    });
  });

  describe('E — Con Đường Băng Giá', () => {
    const castE = (caster: Unit): Lissandra_E => {
      const spell = new Lissandra_E(caster);
      expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);
      return spell;
    };

    it('sends a claw exactly its own reach, damaging what it passes through', () => {
      const caster = createUnit(game, 0, 'blue');
      const victim = createUnit(game, 200, 'red');
      game.setPlayer(caster);
      indexObjects(game, [caster, victim]);
      const hurt = vi.spyOn(victim, 'takeDamage');

      castE(caster);
      const claw = spawned(Lissandra_E_Claw);
      expect(claw.destination.x).toBeCloseTo(E_RANGE);

      vi.stubGlobal('deltaTime', 16);
      fly(claw);

      expect(hurt).toHaveBeenCalledTimes(1);
      expect(hurt.mock.calls[0].slice(0, 2)).toEqual([E_DAMAGE, caster]);
      expect(hurt.mock.calls[0][2]).toBe('MAGIC');
    });

    it('decelerates across its flight instead of holding one speed', () => {
      const caster = createUnit(game, 0, 'blue');
      game.setPlayer(caster);
      indexObjects(game, [caster]);

      castE(caster);
      const claw = spawned(Lissandra_E_Claw);
      expect(claw.speed).toBe(E_CLAW_SPEED_START);

      vi.stubGlobal('deltaTime', E_FLIGHT_MS);
      claw.update();

      expect(claw.speed).toBe(E_CLAW_SPEED_END);
    });

    it('bills its mana once, at the throw — the recast is the same ability', () => {
      const caster = createUnit(game, 0, 'blue');
      game.setPlayer(caster);
      indexObjects(game, [caster]);

      const spell = new Lissandra_E(caster);
      // `changeResource` is the runtime's actual billing path (`Spell`'s own
      // `commitResource` calls it once for mana and once for health), so this
      // watches what was charged rather than what the spell says it charges.
      const drained = vi.spyOn(
        spell as unknown as { changeResource(resource: unknown, amount: number): void },
        'changeResource'
      );

      expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);
      const claw = spawned(Lissandra_E_Claw);
      vi.stubGlobal('deltaTime', E_RECAST_DELAY_MS);
      spell.update();
      claw.position.set(260, 0);
      expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);

      // Every deduction either press made, zero-cost ones dropped. The blink is
      // the second half of one ability, not a second cast: before this was
      // fixed the runtime billed the class field on both presses and Con Đường
      // Băng Giá quietly cost double what its own tooltip says.
      const spent = drained.mock.calls.map(call => call[1]).filter(amount => amount !== 0);
      expect(spent).toEqual([-E_MANA_COST]);
    });

    it('refuses the recast until the window opens', () => {
      const caster = createUnit(game, 0, 'blue');
      game.setPlayer(caster);
      indexObjects(game, [caster]);

      const spell = castE(caster);
      expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(false);
      expect(caster.position.x).toBe(0);
    });

    it('blinks her onto the claw on the recast, and spends the claw doing it', () => {
      const caster = createUnit(game, 0, 'blue');
      game.setPlayer(caster);
      indexObjects(game, [caster]);

      const spell = castE(caster);
      const claw = spawned(Lissandra_E_Claw);

      vi.stubGlobal('deltaTime', E_RECAST_DELAY_MS);
      spell.update();
      claw.position.set(260, 0);

      expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(true);

      expect(caster.position.x).toBe(260);
      expect(caster.position.y).toBe(0);
      expect(claw.toRemove).toBe(true);
      expect(spell.claw).toBeNull();
      // a blink, not a slide: she has to be seen to go and to come back
      expect(spawned(Lissandra_E_Blink)).toBeTruthy();
      // and it is a position write plus a displacement, never a Dash
      expect(buffsOfKind(caster, api.buffs.Dash)).toHaveLength(0);
    });

    it('closes the window and starts the real cooldown when the claw dies on its own', () => {
      const caster = createUnit(game, 0, 'blue');
      game.setPlayer(caster);
      indexObjects(game, [caster]);

      const spell = castE(caster);
      const claw = spawned(Lissandra_E_Claw);

      vi.stubGlobal('deltaTime', E_FLIGHT_MS + E_CLAW_LINGER_MS);
      claw.update();
      expect(claw.toRemove).toBe(true);

      vi.stubGlobal('deltaTime', 16);
      spell.update();

      expect(spell.claw).toBeNull();
      expect(pressSpell(spell, { at: { x: 900, y: 0 } })).toBe(false);
      expect(caster.position.x).toBe(0);
    });

    it('does not damage an ally standing in the claw’s path', () => {
      const caster = createUnit(game, 0, 'blue');
      const ally = createUnit(game, 200, 'blue');
      game.setPlayer(caster);
      indexObjects(game, [caster, ally]);
      const hurtAlly = vi.spyOn(ally, 'takeDamage');
      const hurtCaster = vi.spyOn(caster, 'takeDamage');

      castE(caster);
      vi.stubGlobal('deltaTime', 16);
      fly(spawned(Lissandra_E_Claw));

      expect(hurtAlly).not.toHaveBeenCalled();
      expect(hurtCaster).not.toHaveBeenCalled();
    });
  });

  describe('R — Hầm Mộ Hàn Băng', () => {
    it('entombs the caster in stasis for the tuned duration and nobody else', () => {
      const caster = createUnit(game, 0, 'blue');
      const enemy = createUnit(game, 120, 'red');
      game.setPlayer(caster);
      indexObjects(game, [caster, enemy]);

      expect(pressSpell(new Lissandra_R(caster), { at: { x: 900, y: 0 } })).toBe(true);

      const stasis = buffsOfKind(caster, Stasis);
      expect(stasis).toHaveLength(1);
      expect(stasis[0].duration).toBe(R_STASIS_MS);
      // self-cast only: the aim point is 900 units away and it still lands on her
      expect(buffsOfKind(enemy, Stasis)).toHaveLength(0);
    });

    it('scales the heal by how much health she was missing when she cast it', () => {
      const full = createUnit(game, 0, 'blue');
      game.setPlayer(full);
      indexObjects(game, [full]);
      pressSpell(new Lissandra_R(full));
      expect(spawned(Lissandra_R_Tomb).healPerTick).toBe(R_HEAL_PER_TICK_MIN);

      game = createGame();
      const hurt = createUnit(game, 0, 'blue');
      hurt.stats.maxHealth.baseValue = 100;
      hurt.stats.health.baseValue = 20;
      game.setPlayer(hurt);
      indexObjects(game, [hurt]);
      pressSpell(new Lissandra_R(hurt));
      // 80 of 100 missing, so four fifths of the way from the floor to the
      // ceiling. Written out rather than derived, so the probe cannot agree
      // with a wrong formula.
      expect(spawned(Lissandra_R_Tomb).healPerTick).toBe(8);
    });

    it('heals every tick across the stasis, and exactly that many times', () => {
      const caster = createUnit(game, 0, 'blue');
      caster.stats.maxHealth.baseValue = 100;
      caster.stats.health.baseValue = 20;
      game.setPlayer(caster);
      indexObjects(game, [caster]);

      pressSpell(new Lissandra_R(caster));
      const tomb = spawned(Lissandra_R_Tomb);

      vi.stubGlobal('deltaTime', R_HEAL_TICK_MS);
      for (let tick = 0; tick < 3; tick++) tomb.update();
      // three ticks of 8 onto 20
      expect(caster.stats.health.value).toBe(44);
      expect(tomb.healTicksDone).toBe(3);

      for (let tick = 0; tick < 40; tick++) tomb.update();
      expect(tomb.healTicksDone).toBe(R_HEAL_TICKS);
      expect(tomb.toRemove).toBe(true);
    });

    it('spreads a field that damages each enemy exactly once and slows them while they stand in it', () => {
      const caster = createUnit(game, 0, 'blue');
      const enemy = createUnit(game, 120, 'red');
      game.setPlayer(caster);
      indexObjects(game, [caster, enemy]);
      const hurt = vi.spyOn(enemy, 'takeDamage');

      pressSpell(new Lissandra_R(caster));
      const field = spawned(Lissandra_R_Field);
      expect(field).toBeTruthy();

      vi.stubGlobal('deltaTime', 250);
      for (let tick = 0; tick < 10; tick++) field.update();

      expect(hurt).toHaveBeenCalledTimes(1);
      expect(hurt.mock.calls[0].slice(0, 2)).toEqual([R_FIELD_DAMAGE, caster]);
      expect(hurt.mock.calls[0][2]).toBe('MAGIC');
    });

    it('renews one slow instead of stacking a fresh one every tick', () => {
      const caster = createUnit(game, 0, 'blue');
      const enemy = createUnit(game, 120, 'red');
      game.setPlayer(caster);
      indexObjects(game, [caster, enemy]);

      pressSpell(new Lissandra_R(caster));
      const field = spawned(Lissandra_R_Field);

      vi.stubGlobal('deltaTime', 250);
      for (let tick = 0; tick < 10; tick++) field.update();

      const slows = buffsOfKind(enemy, Slow);
      expect(slows, 'the field piled slows on top of each other').toHaveLength(1);
      expect(slows[0].percent).toBe(R_FIELD_SLOW_PERCENT);
      expect(slows[0].buffAddType).toBe(BuffAddType.RENEW_EXISTING);
      expect(slows[0].stackId).toBe(R_FIELD_SLOW_STACK_ID);
    });

    it('never bites the caster or her allies', () => {
      const caster = createUnit(game, 0, 'blue');
      const ally = createUnit(game, 100, 'blue');
      game.setPlayer(caster);
      indexObjects(game, [caster, ally]);
      const hurtAlly = vi.spyOn(ally, 'takeDamage');
      const hurtCaster = vi.spyOn(caster, 'takeDamage');

      pressSpell(new Lissandra_R(caster));
      const field = spawned(Lissandra_R_Field);

      vi.stubGlobal('deltaTime', 250);
      for (let tick = 0; tick < 10; tick++) field.update();

      expect(hurtAlly).not.toHaveBeenCalled();
      expect(hurtCaster).not.toHaveBeenCalled();
      expect(buffsOfKind(ally, Slow)).toHaveLength(0);
      expect(buffsOfKind(caster, Slow)).toHaveLength(0);
    });
  });
});
