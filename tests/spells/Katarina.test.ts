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
import { KATARINA_DAGGER_E_REFUND_MS, KATARINA_DAGGER_SLASH_DAMAGE, KATARINA_MAX_DAGGERS, KATARINA_Q_BOUNCE_DAMAGE, KATARINA_Q_FIRST_DAMAGE, KATARINA_Q_MAX_TARGETS, KATARINA_Q_WINDUP_MS } from '../../spells/Katarina_Q';
import Katarina_Q, { Katarina_Dagger, Katarina_Q_Object } from '../../spells/Katarina_Q';
import { KATARINA_W_DROP_DELAY_MS, KATARINA_W_SPEEDUP_MS } from '../../spells/Katarina_W';
import Katarina_W from '../../spells/Katarina_W';
import { KATARINA_E_STRIKE_DAMAGE } from '../../spells/Katarina_E';
import Katarina_E from '../../spells/Katarina_E';
import { KATARINA_R_DURATION_MS, KATARINA_R_TICK_DAMAGE, KATARINA_R_TICK_MS } from '../../spells/Katarina_R';
import Katarina_R, { Katarina_R_Lotus } from '../../spells/Katarina_R';
const __api = buildTestApi();
const { AttackableUnit } = __api.units;
const { Speedup } = __api.buffs;
type Speedup = InstanceType<typeof __api.buffs.Speedup>;
type AttackableUnit = InstanceType<typeof __api.units.AttackableUnit>;

const EXPECTED_R_TICKS = Math.floor(KATARINA_R_DURATION_MS / KATARINA_R_TICK_MS);

function unit(game: TestGame, x: number, teamId: string, y = 0): AttackableUnit {
  const result = createUnit(game, x, teamId);
  result.position.y = y;
  result.destination.y = y;
  result.collisionRadius = 1;
  result.stats.speed.baseValue = 10;
  result.stats.mana.baseValue = 100;
  result.stats.health.baseValue = 100;
  result.stats.maxHealth.baseValue = 100;
  result.stats.healthRegen.baseValue = 0;
  result.stats.manaRegen.baseValue = 0;
  result.animatedValues.displaySize = 20;
  return result;
}

describe('Katarina — Reworked Dagger Mechanics', () => {
  let game: TestGame;
  let owner: AttackableUnit;

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 250);
    vi.stubGlobal('createVector', (x = 0, y = 0) => new (p5 as any).Vector(x, y));
    game = createGame();
    owner = unit(game, 0, 'blue');
    game.setPlayer(owner);
    game.objectManager.addObject(owner);
    spawned.length = 0;
    spawned.push(owner);
    (game as any).worldMouse = createVector(300, 0);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  /** A cursor `dx`/`dy` away from Katarina, in world coordinates. */
  function at(dx: number, dy: number) {
    return { x: owner.position.x + dx, y: owner.position.y + dy };
  }

  /**
   * Indexed, not merely added — and indexed *cumulatively*.
   *
   * `addObject` parks a unit in `_objectToBeAdd` until the next
   * `objectManager.update()`, so it is invisible to `queryObjects` until then.
   * That did not matter while Q threw at a *point*: the blade flew down the aim
   * line and found these by collision on the way. It matters now that Q refuses
   * to cast without a target in range, which is a quadtree question asked at
   * press time.
   *
   * `indexObjects` *replaces* the world rather than adding to it, so calling it
   * once per spawn leaves only the last one findable — which reads as "the
   * spell refuses to cast" and is a fixture bug wearing a product bug's
   * clothes. Hence the running list.
   */
  const spawned: AttackableUnit[] = [];

  function enemy(x: number, y = 0): AttackableUnit {
    const victim = unit(game, x, 'red', y);
    game.objectManager.addObject(victim);
    spawned.push(victim);
    indexObjects(game, [...spawned]);
    return victim;
  }

  /**
   * Q has a `castTimeMs` windup before the blade leaves her hand, which the old
   * `onSpellCast()` version of this helper skipped over entirely — it could not
   * have noticed the windup disappearing.
   */
  function flyQ(): Katarina_Q_Object {
    const q = new Katarina_Q(owner);
    expect(pressSpell(q, { at: at(300, 0) })).toBe(true);
    expect(q.state).toBe('CASTING');

    vi.stubGlobal('deltaTime', KATARINA_Q_WINDUP_MS);
    q.update();
    vi.stubGlobal('deltaTime', 250);

    const missile = game.objectManager._objectToBeAdd.find(
      object => object instanceof Object && 'struck' in (object as any)
    ) as Katarina_Q_Object;
    for (let frame = 0; frame < 600 && !missile.toRemove; frame++) game.objectManager.update();
    return missile;
  }

  /**
   * Q and E both used to fire into open ground.
   *
   * Q travels to a *target* and bounces between more of them — it is not a
   * skillshot and there is no line to miss along — so a cursor that landed in
   * a gap between bodies spent the cooldown, the wind-up and the mana on
   * nothing at all, and planted no dagger. E was worse: with no unit and no
   * dagger under the cursor it blinked to bare ground, which is a 420px free
   * teleport on a 10s cooldown and a materially stronger ability than the one
   * its own tooltip describes.
   */
  describe('neither Q nor E fires at empty ground', () => {
    it('refuses Q with nothing in range', () => {
      expect(pressSpell(new Katarina_Q(owner), { at: at(300, 0) })).toBe(false);
    });

    it('allows Q once something is in range, wherever the cursor is', () => {
      enemy(300);
      // Aimed at open ground well away from the only body: the old code needed
      // the cursor within 160px of a target, so this cast threw at nothing.
      expect(pressSpell(new Katarina_Q(owner), { at: at(80, 380) })).toBe(true);
    });

    it('sends the blade to the body nearest the cursor, not the one nearest her', () => {
      const near = enemy(120);
      const far = enemy(400);

      const q = new Katarina_Q(owner);
      expect(pressSpell(q, { at: at(420, 0) })).toBe(true);
      vi.stubGlobal('deltaTime', KATARINA_Q_WINDUP_MS);
      q.update();
      vi.stubGlobal('deltaTime', 250);

      const missile = game.objectManager._objectToBeAdd.find(
        object => object instanceof Object && 'struck' in (object as any)
      ) as Katarina_Q_Object;
      expect(missile.chasing).toBe(far);
      expect(missile.chasing).not.toBe(near);
    });

    it('refuses E with no unit and no dagger in range', () => {
      expect(pressSpell(new Katarina_E(owner), { at: at(300, 0) })).toBe(false);
    });

    it('allows E to a friendly body, not only to an enemy', () => {
      const ally = unit(game, 200, 'blue');
      game.objectManager.addObject(ally);
      spawned.push(ally);
      indexObjects(game, [...spawned]);

      // Shunpo is a reposition first and a gap-closer second: stepping to a
      // friendly minion to escape is as much the ability as stepping to a
      // champion to kill one.
      expect(pressSpell(new Katarina_E(owner), { at: at(210, 0) })).toBe(true);
    });

    it('allows E to one of her own daggers with nobody else around', () => {
      Katarina_Dagger.plant(owner, 200, 0, 0);
      expect(pressSpell(new Katarina_E(owner), { at: at(200, 0) })).toBe(true);
    });

    it('never leaves her standing where the cursor was rather than on a body', () => {
      const target = enemy(300);
      const e = new Katarina_E(owner);
      // Cursor 200px past the only body — the old code blinked to the cursor.
      expect(pressSpell(e, { at: at(400, 300) })).toBe(true);
      expect(owner.position.x).toBeCloseTo(target.position.x, 0);
      expect(owner.position.y).toBeCloseTo(target.position.y, 0);
    });
  });

  it('Q chains at most MAX_TARGETS units and never bills one twice', () => {
    const first = enemy(300);
    const second = enemy(450);
    const third = enemy(600);
    const fourth = enemy(750);

    const missile = flyQ();

    expect(missile.struck.length).toBe(KATARINA_Q_MAX_TARGETS);
    expect(new Set(missile.struck).size).toBe(KATARINA_Q_MAX_TARGETS);
    expect(first.stats.health.value).toBe(100 - KATARINA_Q_FIRST_DAMAGE);
    expect(second.stats.health.value).toBe(100 - KATARINA_Q_BOUNCE_DAMAGE);
    expect(third.stats.health.value).toBe(100 - KATARINA_Q_BOUNCE_DAMAGE);
    expect(fourth.stats.health.value).toBe(100);
  });

  it('Q leaves a dagger on ground, and a fourth dagger evicts the oldest', () => {
    enemy(300);
    flyQ();
    expect(Katarina_Dagger.aliveFor(owner).length).toBe(1);

    const oldest = Katarina_Dagger.aliveFor(owner)[0];
    for (let i = 1; i <= KATARINA_MAX_DAGGERS; i++) Katarina_Dagger.plant(owner, i * 40, 400);

    expect(Katarina_Dagger.aliveFor(owner).length).toBe(KATARINA_MAX_DAGGERS);
    expect(oldest.toRemove).toBe(true);
  });

  it('Walking onto a landed dagger triggers Dagger Slash AoE and refunds E cooldown', () => {
    const e = new Katarina_E(owner);
    (owner as any).spells = [new Katarina_Q(owner), new Katarina_W(owner), e, new Katarina_R(owner)];
    e.currentCooldown = 10_000;

    // Plant a landed dagger nearby
    const dagger = Katarina_Dagger.plant(owner, 50, 0, 0);
    expect(dagger.landed).toBe(true);

    const nearbyEnemy = enemy(100, 0);
    game.objectManager.update();

    // Owner moves within pickup radius of dagger
    owner.position.x = 40;
    game.objectManager.update();

    // Dagger should be consumed and slash dealt damage
    expect(dagger.toRemove).toBe(true);
    expect(nearbyEnemy.stats.health.value).toBe(100 - KATARINA_DAGGER_SLASH_DAMAGE);
    expect(e.currentCooldown).toBe(10_000 - KATARINA_DAGGER_E_REFUND_MS);
  });

  it('W grants Speedup buff and drops a dagger at current position', () => {
    expect(pressSpell(new Katarina_W(owner), { at: at(0, 0) })).toBe(true);

    // Has Speedup buff
    const speedBuff = owner.buffs.find(b => b instanceof Speedup) as Speedup | undefined;
    expect(speedBuff).toBeDefined();
    expect(speedBuff?.duration).toBe(KATARINA_W_SPEEDUP_MS);

    // Has planted dagger at position 0, 0
    const daggers = Katarina_Dagger.aliveFor(owner);
    expect(daggers.length).toBe(1);
    expect(daggers[0].position.x).toBe(0);
    expect(daggers[0].position.y).toBe(0);
    expect(daggers[0].dropDelayMs).toBe(KATARINA_W_DROP_DELAY_MS);
  });

  it('E blinks to target point or dagger and triggers strike on enemy', () => {
    const target = enemy(300, 0);
    game.objectManager.update();

    const e = new Katarina_E(owner);
    expect(pressSpell(e, { at: at(300, 0) })).toBe(true);

    expect(owner.position.x).toBe(300);
    expect(target.stats.health.value).toBe(100 - KATARINA_E_STRIKE_DAMAGE);
  });

  it('E onto a dagger triggers Dagger Slash and refunds E cooldown', () => {
    const e = new Katarina_E(owner);
    (owner as any).spells = [new Katarina_Q(owner), new Katarina_W(owner), e, new Katarina_R(owner)];

    const dagger = Katarina_Dagger.plant(owner, 200, 0, 0);
    const bystander = enemy(250, 0);
    game.objectManager.update();

    expect(pressSpell(e, { at: at(200, 0) })).toBe(true);

    expect(owner.position.x).toBe(200);
    expect(dagger.toRemove).toBe(true);
    // Hit by dagger slash
    expect(bystander.stats.health.value).toBeLessThanOrEqual(100 - KATARINA_DAGGER_SLASH_DAMAGE);
    // ...and the refund this test is named for, which it never used to assert:
    // the press starts E's own cooldown, and landing on a dagger pays part back.
    expect(e.currentCooldown).toBe(e.coolDown - KATARINA_DAGGER_E_REFUND_MS);
  });

  /** The lotus the channel puts in the world, whichever queue it is sitting in. */
  function lotusInPlay(): Katarina_R_Lotus {
    const found = [
      ...game.objectManager._objectToBeAdd,
      ...game.objectManager.objects,
    ].find(object => 'ticksDone' in (object as any)) as Katarina_R_Lotus;
    expect(found).toBeDefined();
    return found;
  }

  it('R channels and ticks multiple times dealing AoE damage', () => {
    const victim = enemy(200);
    victim.stats.health.baseValue = 500;
    victim.stats.maxHealth.baseValue = 500;

    const r = new Katarina_R(owner);
    expect(pressSpell(r, { at: at(0, 0) })).toBe(true);
    // Pressing it is what opens the channel — the old test called `onCastStart`
    // by hand and so never established that R is a channel at all.
    expect(r.state).toBe('CHANNELING');

    const lotus = lotusInPlay();
    for (let frame = 0; frame < 200 && !lotus.toRemove; frame++) game.objectManager.update();

    expect(lotus.ticksDone).toBe(EXPECTED_R_TICKS);
    expect(victim.stats.health.value).toBe(500 - EXPECTED_R_TICKS * KATARINA_R_TICK_DAMAGE);
    expect(lotus.toRemove).toBe(true);
  });

  it('R stops dead when the channel is interrupted', () => {
    const victim = enemy(200);
    victim.stats.health.baseValue = 500;
    victim.stats.maxHealth.baseValue = 500;

    const r = new Katarina_R(owner);
    expect(pressSpell(r, { at: at(0, 0) })).toBe(true);
    const lotus = lotusInPlay();

    // Two ticks in, then a stun. Cancelling mid-channel is the case that
    // matters, and the old test could only cancel one that had already ended.
    vi.stubGlobal('deltaTime', KATARINA_R_TICK_MS);
    for (let frame = 0; frame < 40 && lotus.ticksDone < 2; frame++) game.objectManager.update();
    const struckSoFar = lotus.ticksDone;
    expect(struckSoFar).toBe(2);
    expect(struckSoFar).toBeLessThan(EXPECTED_R_TICKS);

    expect(r.cancel('STUN')).toBe(true);
    expect(lotus.toRemove).toBe(true);

    const healthAtCancel = victim.stats.health.value;
    for (let frame = 0; frame < 60; frame++) game.objectManager.update();
    expect(lotus.ticksDone).toBe(struckSoFar);
    expect(victim.stats.health.value).toBe(healthAtCancel);
  });
});
