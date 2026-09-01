/**
 * Twisted Fate. The whole champion is the *second* key press, so most of this
 * suite is about what a shuffle arms and what it deliberately does not: one
 * press starts the deck cycling and hands the player nothing, the recast locks
 * whatever card is showing at that instant, and exactly one basic attack spends
 * it.
 *
 * Every cast is driven through `pressSpell`, every swing through
 * `api.combat.applyOnHitEffects` — the same two seams the game itself uses, so
 * a payload that only works when its hook is poked by hand fails here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApi, indexObjects, stubGameGlobals } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';

import TwistedFate_Q, {
  TwistedFate_Q_Card,
  CARD_COUNT,
  CARD_DAMAGE,
  FAN_ANGLE_DEG,
  RANGE as Q_RANGE,
  COOLDOWN_MS as Q_COOLDOWN_MS,
  MANA_COST as Q_MANA_COST,
} from '../../spells/TwistedFate_Q';
import TwistedFate_W, {
  TwistedFate_W_Card,
  BLUE_BONUS_DAMAGE,
  BLUE_MANA_RESTORED,
  CARD_ORDER,
  CARD_STACK_ID,
  GOLD_BONUS_DAMAGE,
  GOLD_STUN_MS,
  RED_BONUS_DAMAGE,
  RED_SLOW_MS,
  RED_SLOW_PERCENT,
  RED_SPLASH_RADIUS,
  SHUFFLE_INTERVAL_MS,
  SHUFFLE_TIMEOUT_MS,
  TIMEOUT_COOLDOWN_MS,
  COOLDOWN_MS as W_COOLDOWN_MS,
  MANA_COST as W_MANA_COST,
} from '../../spells/TwistedFate_W';
import TwistedFate_E, {
  TwistedFate_E_Deck,
  ATTACKS_PER_EMPOWER,
  BONUS_ATTACK_SPEED,
  BONUS_DAMAGE as E_BONUS_DAMAGE,
  DECK_STACK_ID,
  HASTE_STACK_ID,
} from '../../spells/TwistedFate_E';
import TwistedFate_R, {
  BLINK_RANGE,
  CHANNEL_MS,
  GATE_WINDOW_MS,
  REVEAL_MS,
  REVEAL_STACK_ID,
  COOLDOWN_MS as R_COOLDOWN_MS,
  MANA_COST as R_MANA_COST,
} from '../../spells/TwistedFate_R';

const api = buildTestApi();
const { Champion } = api.units;
const { Slow, Stun } = api.buffs;

type Unit = ReturnType<typeof createUnit>;
type AnyBuff = InstanceType<typeof api.buffs.Buff>;
type ChampionUnit = InstanceType<typeof api.units.Champion>;

const live = (unit: { buffs: AnyBuff[] }): AnyBuff[] => unit.buffs.filter(buff => !buff.toRemove);

/** One tick, where a test needs a frame rather than a whole duration. */
const FRAME_MS = 100;

/** The real swing pipeline: what `landBasicAttack` calls, with a plain hit. */
const swing = (attacker: Unit, victim: Unit): void => {
  api.combat.applyOnHitEffects({
    attacker,
    victim,
    damage: 12,
    ranged: true,
    crit: false,
    echo: false,
  });
};

let game: TestGame;

beforeEach(() => {
  stubGameGlobals();
  installSpellObjectGlobals();
  installSketchMathGlobals();
  game = createGame();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * A bare unit with a health bar big enough to survive the probes below, and a
 * settled body size — `animatedValues` starts at a placeholder 10 and only
 * converges on the real stat once the unit has ticked, and everything here
 * measures against bodies rather than points.
 */
const unit = (x: number, y: number, teamId: string): Unit => {
  const made = createUnit(game, x, teamId);
  made.position.set(x, y);
  made.stats.maxHealth.baseValue = 400;
  made.stats.health.baseValue = 400;
  made.animatedValues.size = made.stats.size.value;
  made.animatedValues.displaySize = made.stats.size.value;
  return made;
};

const champion = (x: number, y: number, teamId: string): ChampionUnit => {
  const made = new Champion({ game, teamId } as never) as ChampionUnit;
  made.position.set(x, y);
  return made;
};

/** Objects a cast just queued; they sit in `_objectToBeAdd` until a manager tick. */
const queued = <T>(kind: abstract new (...args: never[]) => T): T[] =>
  game.objectManager._objectToBeAdd.filter(object => object instanceof kind) as unknown as T[];

describe('TwistedFate Q — Phi Bài', () => {
  it('throws three separate cards, one down the aim line and one to each side', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const spell = new TwistedFate_Q(twistedFate);

    expect(pressSpell(spell, { at: { x: 600, y: 100 } })).toBe(true);
    expect(spell.coolDown).toBe(Q_COOLDOWN_MS);
    expect(spell.manaCost).toBe(Q_MANA_COST);

    const cards = queued(TwistedFate_Q_Card);
    expect(cards).toHaveLength(CARD_COUNT);

    const angles = cards
      .map(card =>
        Math.round(
          (Math.atan2(
            card.destination.y - twistedFate.position.y,
            card.destination.x - twistedFate.position.x
          ) *
            180) /
            Math.PI
        )
      )
      .sort((first, second) => first - second);
    expect(angles).toEqual([-FAN_ANGLE_DEG, 0, FAN_ANGLE_DEG]);

    for (const card of cards) {
      const reach = Math.hypot(
        card.destination.x - twistedFate.position.x,
        card.destination.y - twistedFate.position.y
      );
      expect(Math.round(reach)).toBe(Q_RANGE);
    }
  });

  it('pierces: one card hits every enemy on its line once, and skips allies', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const near = unit(400, 100, 'red');
    const far = unit(480, 100, 'red');
    const friend = unit(440, 100, 'blue');
    indexObjects(game, [twistedFate, near, far, friend]);

    const spell = new TwistedFate_Q(twistedFate);
    expect(pressSpell(spell, { at: { x: 600, y: 100 } })).toBe(true);

    const hurtNear = vi.spyOn(near, 'takeDamage');
    const hurtFar = vi.spyOn(far, 'takeDamage');
    const hurtFriend = vi.spyOn(friend, 'takeDamage');

    const cards = queued(TwistedFate_Q_Card);
    for (let step = 0; step < 200; step++) {
      for (const card of cards) if (!card.toRemove) card.update();
    }

    expect(hurtNear).toHaveBeenCalledTimes(1);
    expect(hurtFar).toHaveBeenCalledTimes(1);
    expect(hurtFriend).not.toHaveBeenCalled();
    expect(hurtNear.mock.calls[0].slice(0, 2)).toEqual([CARD_DAMAGE, twistedFate]);
  });

  it('lets a target standing in the fan be caught by more than one card', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    // Stood between the middle card's line and the wing's, close enough in that
    // the two bearings have not pulled apart yet: both cards sweep over him.
    const hugger = unit(159, 111, 'red');
    indexObjects(game, [twistedFate, hugger]);

    const spell = new TwistedFate_Q(twistedFate);
    expect(pressSpell(spell, { at: { x: 600, y: 100 } })).toBe(true);

    const hurt = vi.spyOn(hugger, 'takeDamage');
    const cards = queued(TwistedFate_Q_Card);
    for (let step = 0; step < 200; step++) {
      for (const card of cards) if (!card.toRemove) card.update();
    }

    expect(hurt.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const call of hurt.mock.calls) expect(call[0]).toBe(CARD_DAMAGE);
  });
});

describe('TwistedFate W — Chọn Bài', () => {
  /** Presses W, runs the shuffle for `ms`, then presses again to lock. */
  const lockAfter = (spell: TwistedFate_W, ms: number): TwistedFate_W_Card => {
    expect(pressSpell(spell, {})).toBe(true);
    if (ms > 0) {
      vi.stubGlobal('deltaTime', ms);
      spell.update();
    }
    expect(pressSpell(spell, {})).toBe(true);
    const armed = live(spell.owner).find(
      (buff): buff is TwistedFate_W_Card => buff instanceof TwistedFate_W_Card
    );
    expect(armed).toBeTruthy();
    return armed!;
  };

  it('one press starts the shuffle and arms nothing at all', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const spell = new TwistedFate_W(twistedFate);

    expect(spell.coolDown).toBe(W_COOLDOWN_MS);
    expect(spell.manaCost).toBe(W_MANA_COST);
    expect(pressSpell(spell, {})).toBe(true);

    expect(spell.state).toBe('ACTIVE');
    expect(spell.showingCard).toBe(CARD_ORDER[0]);
    expect(live(twistedFate).some(buff => buff instanceof TwistedFate_W_Card)).toBe(false);
  });

  it('cycles a card per interval and the recast locks the one showing', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);

    for (let index = 0; index < CARD_ORDER.length; index++) {
      const spell = new TwistedFate_W(twistedFate);
      const armed = lockAfter(spell, index * SHUFFLE_INTERVAL_MS);
      expect(armed.card).toBe(CARD_ORDER[index]);
      expect(armed.stackId).toBe(CARD_STACK_ID);
      armed.deactivateBuff();
    }
  });

  it('locking a card puts W on its full cooldown', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const spell = new TwistedFate_W(twistedFate);

    lockAfter(spell, 0);
    expect(spell.currentCooldown).toBe(W_COOLDOWN_MS);
  });

  it('blue: bonus magic damage on the next attack and mana back for Twisted Fate', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const victim = unit(160, 100, 'red');
    indexObjects(game, [twistedFate, victim]);

    const spell = new TwistedFate_W(twistedFate);
    const armed = lockAfter(spell, 0);
    expect(armed.card).toBe('XANH');

    const hurt = vi.spyOn(victim, 'takeDamage');
    const refill = vi.spyOn(twistedFate, 'restoreMana');
    swing(twistedFate, victim);

    expect(hurt.mock.calls[0].slice(0, 2)).toEqual([BLUE_BONUS_DAMAGE, twistedFate]);
    expect(refill).toHaveBeenCalledWith(BLUE_MANA_RESTORED);
  });

  it('red: splashes every enemy beside the target and slows them, sparing allies', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const victim = unit(400, 100, 'red');
    const beside = unit(400 + RED_SPLASH_RADIUS - 20, 100, 'red');
    const away = unit(400 + RED_SPLASH_RADIUS + 120, 100, 'red');
    const friend = unit(420, 100, 'blue');
    indexObjects(game, [twistedFate, victim, beside, away, friend]);

    const spell = new TwistedFate_W(twistedFate);
    const armed = lockAfter(spell, SHUFFLE_INTERVAL_MS);
    expect(armed.card).toBe('DO');

    const hurtVictim = vi.spyOn(victim, 'takeDamage');
    const hurtBeside = vi.spyOn(beside, 'takeDamage');
    const hurtAway = vi.spyOn(away, 'takeDamage');
    const hurtFriend = vi.spyOn(friend, 'takeDamage');
    swing(twistedFate, victim);

    expect(hurtVictim.mock.calls[0].slice(0, 2)).toEqual([RED_BONUS_DAMAGE, twistedFate]);
    expect(hurtBeside.mock.calls[0].slice(0, 2)).toEqual([RED_BONUS_DAMAGE, twistedFate]);
    expect(hurtAway).not.toHaveBeenCalled();
    expect(hurtFriend).not.toHaveBeenCalled();

    for (const slowed of [victim, beside]) {
      const slow = live(slowed).find((buff): buff is InstanceType<typeof Slow> =>
        buff instanceof Slow
      );
      expect(slow).toBeTruthy();
      expect(slow!.percent).toBe(RED_SLOW_PERCENT);
      expect(slow!.duration).toBe(RED_SLOW_MS);
    }
  });

  it('gold: less damage, but the target is stunned', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const victim = unit(160, 100, 'red');
    indexObjects(game, [twistedFate, victim]);

    const spell = new TwistedFate_W(twistedFate);
    const armed = lockAfter(spell, 2 * SHUFFLE_INTERVAL_MS);
    expect(armed.card).toBe('VANG');

    const hurt = vi.spyOn(victim, 'takeDamage');
    swing(twistedFate, victim);

    expect(hurt.mock.calls[0].slice(0, 2)).toEqual([GOLD_BONUS_DAMAGE, twistedFate]);
    const stun = live(victim).find((buff): buff is InstanceType<typeof Stun> => buff instanceof Stun);
    expect(stun).toBeTruthy();
    expect(stun!.duration).toBe(GOLD_STUN_MS);
    expect(GOLD_BONUS_DAMAGE).toBeLessThan(BLUE_BONUS_DAMAGE);
  });

  it('one attack spends the card and the next attack is ordinary again', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const victim = unit(160, 100, 'red');
    indexObjects(game, [twistedFate, victim]);

    const spell = new TwistedFate_W(twistedFate);
    lockAfter(spell, 0);

    const hurt = vi.spyOn(victim, 'takeDamage');
    swing(twistedFate, victim);
    expect(hurt).toHaveBeenCalledTimes(1);

    swing(twistedFate, victim);
    expect(hurt).toHaveBeenCalledTimes(1);
    expect(live(twistedFate).some(buff => buff instanceof TwistedFate_W_Card)).toBe(false);
  });

  it('a shuffle nobody locks times out for a short cooldown and no card', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const spell = new TwistedFate_W(twistedFate);

    expect(pressSpell(spell, {})).toBe(true);
    vi.stubGlobal('deltaTime', SHUFFLE_TIMEOUT_MS);
    spell.update();

    expect(spell.state).toBe('COOLDOWN');
    expect(spell.currentCooldown).toBe(TIMEOUT_COOLDOWN_MS);
    expect(TIMEOUT_COOLDOWN_MS).toBeLessThan(W_COOLDOWN_MS);
    expect(live(twistedFate).some(buff => buff instanceof TwistedFate_W_Card)).toBe(false);
  });

  it('a shuffle broken by a stun is also a shuffle that bought nothing', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const enemy = unit(300, 100, 'red');
    const spell = new TwistedFate_W(twistedFate);

    expect(pressSpell(spell, {})).toBe(true);
    twistedFate.addBuff(new Stun(1_000, enemy, twistedFate));
    vi.stubGlobal('deltaTime', FRAME_MS);
    // One unit tick, so the stun reaches `actionState` the way it does in play.
    twistedFate.update();
    spell.update();

    expect(spell.state).not.toBe('ACTIVE');
    // The interrupt is watched before the frame's cooldown tick, so the short
    // cooldown is already one frame down by the time it can be read.
    expect(spell.currentCooldown).toBe(TIMEOUT_COOLDOWN_MS - FRAME_MS);
    expect(live(twistedFate).some(buff => buff instanceof TwistedFate_W_Card)).toBe(false);
  });
});

describe('TwistedFate E — Tráo Bài', () => {
  it('arms a counting deck the HUD can read and a silent attack-speed bonus', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    // Stacked Deck is a *share* of his own rate now, so the probe needs a rate
    // to be a share of — the fixture leaves champions at 0.
    twistedFate.stats.attackSpeed.baseValue = 1.1;
    const before = twistedFate.stats.attackSpeed.value;

    const spell = new TwistedFate_E(twistedFate);
    expect(spell.coolDown).toBe(0);
    expect(spell.manaCost).toBe(0);
    expect(pressSpell(spell, {})).toBe(true);

    const deck = live(twistedFate).find(
      (buff): buff is TwistedFate_E_Deck => buff instanceof TwistedFate_E_Deck
    );
    expect(deck).toBeTruthy();
    expect(deck!.stackId).toBe(DECK_STACK_ID);
    expect(deck!.duration).toBe(0);
    expect(deck!.hudVisible).toBe(true);
    expect(deck!.maxStacks).toBe(ATTACKS_PER_EMPOWER);

    const haste = live(twistedFate).find(buff => buff.stackId === HASTE_STACK_ID);
    expect(haste).toBeTruthy();
    expect(haste!.hudVisible).toBe(false);
    expect(haste!.duration).toBe(0);
    expect(twistedFate.stats.attackSpeed.value - before).toBeCloseTo(1.1 * BONUS_ATTACK_SPEED, 5);
  });

  it('every fourth basic attack carries the bonus, and the count resets', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const victim = unit(160, 100, 'red');
    const spell = new TwistedFate_E(twistedFate);
    expect(pressSpell(spell, {})).toBe(true);

    const deck = live(twistedFate).find(
      (buff): buff is TwistedFate_E_Deck => buff instanceof TwistedFate_E_Deck
    )!;
    const hurt = vi.spyOn(victim, 'takeDamage');

    for (let hit = 1; hit < ATTACKS_PER_EMPOWER; hit++) {
      swing(twistedFate, victim);
      expect(hurt).not.toHaveBeenCalled();
      expect(deck.stacks).toBe(hit);
    }

    swing(twistedFate, victim);
    expect(hurt).toHaveBeenCalledTimes(1);
    expect(hurt.mock.calls[0].slice(0, 2)).toEqual([E_BONUS_DAMAGE, twistedFate]);
    expect(deck.stacks).toBe(0);

    for (let hit = 1; hit < ATTACKS_PER_EMPOWER; hit++) swing(twistedFate, victim);
    expect(hurt).toHaveBeenCalledTimes(1);
    swing(twistedFate, victim);
    expect(hurt).toHaveBeenCalledTimes(2);
  });

  it('the bonus lands on whoever was hit, not on Twisted Fate himself', () => {
    const twistedFate = unit(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const victim = unit(160, 100, 'red');
    const spell = new TwistedFate_E(twistedFate);
    expect(pressSpell(spell, {})).toBe(true);

    const selfHarm = vi.spyOn(twistedFate, 'takeDamage');
    for (let hit = 0; hit < ATTACKS_PER_EMPOWER; hit++) swing(twistedFate, victim);
    expect(selfHarm).not.toHaveBeenCalled();
  });
});

describe('TwistedFate R — Định Mệnh', () => {
  /** Presses R and runs the channel to completion. */
  const channel = (spell: TwistedFate_R): void => {
    expect(pressSpell(spell, { at: { x: 500, y: 300 } })).toBe(true);
    vi.stubGlobal('deltaTime', CHANNEL_MS);
    spell.update();
  };

  it('reveals every living enemy champion on the map, and nobody else', () => {
    const twistedFate = champion(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const near = champion(300, 120, 'red');
    const acrossTheMap = champion(880, 900, 'red');
    const corpse = champion(500, 500, 'red');
    corpse.takeDamage(9_999, twistedFate, 'TRUE', 'thiết lập');
    expect(corpse.isDead).toBe(true);
    const friend = champion(200, 200, 'blue');
    const minion = unit(340, 140, 'red');
    indexObjects(game, [twistedFate, near, acrossTheMap, corpse, friend, minion]);

    const spell = new TwistedFate_R(twistedFate);
    expect(spell.coolDown).toBe(R_COOLDOWN_MS);
    expect(spell.manaCost).toBe(R_MANA_COST);

    expect(pressSpell(spell, { at: { x: 500, y: 300 } })).toBe(true);
    // Mid-channel: nothing is revealed yet. The channel is the price.
    expect(near.buffs.some(buff => buff.stackId === REVEAL_STACK_ID)).toBe(false);

    vi.stubGlobal('deltaTime', CHANNEL_MS);
    spell.update();

    // The ultimate's cooldown runs from the moment the channel ends.
    expect(spell.currentCooldown).toBe(R_COOLDOWN_MS);

    for (const seen of [near, acrossTheMap]) {
      const reveal = live(seen).find(buff => buff.stackId === REVEAL_STACK_ID);
      expect(reveal).toBeTruthy();
      expect(reveal!.duration).toBe(REVEAL_MS);
    }
    for (const unseen of [corpse, friend, twistedFate]) {
      expect(live(unseen).some(buff => buff.stackId === REVEAL_STACK_ID)).toBe(false);
    }
    expect(live(minion).some(buff => buff.stackId === REVEAL_STACK_ID)).toBe(false);
  });

  it('a channel broken by crowd control reveals nobody and opens no gate', () => {
    const twistedFate = champion(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const enemy = champion(300, 120, 'red');
    indexObjects(game, [twistedFate, enemy]);

    const spell = new TwistedFate_R(twistedFate);
    expect(pressSpell(spell, { at: { x: 500, y: 300 } })).toBe(true);
    expect(spell.state).toBe('CHANNELING');

    twistedFate.addBuff(new Stun(1_000, enemy, twistedFate));
    vi.stubGlobal('deltaTime', FRAME_MS);
    // One unit tick, so the stun reaches `actionState` the way it does in play.
    twistedFate.update();
    spell.update();

    expect(spell.state).not.toBe('CHANNELING');
    expect(live(enemy).some(buff => buff.stackId === REVEAL_STACK_ID)).toBe(false);
    expect(spell.gateRemainingMs).toBe(0);
  });

  it('the recast blinks him to the aimed point, clamped to the gate range', () => {
    const twistedFate = champion(100, 100, 'blue');
    game.setPlayer(twistedFate);
    indexObjects(game, [twistedFate]);

    const spell = new TwistedFate_R(twistedFate);
    channel(spell);

    expect(pressSpell(spell, { at: { x: 100 + 300, y: 100 } })).toBe(true);
    expect(Math.round(twistedFate.position.x)).toBe(400);
    expect(Math.round(twistedFate.position.y)).toBe(100);

    // One gate per ultimate: the window shut behind him.
    expect(pressSpell(spell, { at: { x: 700, y: 100 } })).toBe(false);
    expect(Math.round(twistedFate.position.x)).toBe(400);
  });

  it('clamps a gate aimed past the blink range', () => {
    const twistedFate = champion(100, 100, 'blue');
    game.setPlayer(twistedFate);
    indexObjects(game, [twistedFate]);

    const spell = new TwistedFate_R(twistedFate);
    channel(spell);

    expect(pressSpell(spell, { at: { x: 100 + BLINK_RANGE * 3, y: 100 } })).toBe(true);
    expect(Math.round(twistedFate.position.x)).toBe(100 + BLINK_RANGE);
  });

  it('an unused gate closes and the reveal simply stands', () => {
    const twistedFate = champion(100, 100, 'blue');
    game.setPlayer(twistedFate);
    const enemy = champion(300, 120, 'red');
    indexObjects(game, [twistedFate, enemy]);

    const spell = new TwistedFate_R(twistedFate);
    channel(spell);
    expect(live(enemy).some(buff => buff.stackId === REVEAL_STACK_ID)).toBe(true);
    expect(spell.gateRemainingMs).toBe(GATE_WINDOW_MS);

    vi.stubGlobal('deltaTime', GATE_WINDOW_MS);
    spell.update();

    expect(spell.gateRemainingMs).toBe(0);
    expect(pressSpell(spell, { at: { x: 700, y: 100 } })).toBe(false);
    expect(Math.round(twistedFate.position.x)).toBe(100);
    // The cooldown has been running the whole time the gate stood open.
    expect(spell.currentCooldown).toBe(R_COOLDOWN_MS - GATE_WINDOW_MS);
    expect(live(enemy).some(buff => buff.stackId === REVEAL_STACK_ID)).toBe(true);
  });
});
