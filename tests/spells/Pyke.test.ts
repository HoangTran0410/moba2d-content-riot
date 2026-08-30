import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApi, indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
  type TestGame,
} from '@moba2d/core/testing/spell';

import Pyke_Q, {
  HARPOON_RANGE,
  PULL_DURATION_MS,
  PULL_FRAMES,
  PULL_STOP_DISTANCE,
  Q_DAMAGE,
  Q_SLOW_MS,
  Q_SLOW_PERCENT,
  Pyke_Q_Harpoon,
} from '../../spells/Pyke_Q';
import Pyke_W, {
  DIVE_MS,
  SPEEDUP_END_PERCENT,
  SPEEDUP_START_PERCENT,
  Pyke_W_Rush,
  Pyke_W_Stealth,
} from '../../spells/Pyke_W';
import Pyke_E, {
  E_DAMAGE,
  E_STUN_MS,
  PHANTOM_DELAY_MS,
  PHANTOM_DASH_DISTANCE,
  PHANTOM_SPEED,
  Pyke_E_Phantom,
} from '../../spells/Pyke_E';
import Pyke_R, {
  EXECUTE_THRESHOLD,
  R_RANGE,
  STRIKE_DAMAGE,
  WINDUP_MS,
  Pyke_R_Mark,
} from '../../spells/Pyke_R';

const api = buildTestApi();
const { Champion, AttackableUnit } = api.units;
const { Dash, Slow, Stun, Invisible, Speedup } = api.buffs;
const { EventType } = api.enums;
const { isLethal, pickExecuteTarget } = api.combat.ExecuteTargeting;

type AnyUnit = InstanceType<typeof AttackableUnit>;
type AnyBuff = InstanceType<typeof api.buffs.Buff>;

const live = (unit: { buffs: AnyBuff[] }): AnyBuff[] => unit.buffs.filter(b => !b.toRemove);

/** A real champion, placed. Bare `AttackableUnit`s cannot carry a kit. */
const champion = (game: TestGame, x: number, y: number, teamId: string): AnyUnit => {
  const unit = new Champion({ game, teamId } as never) as unknown as AnyUnit;
  unit.position.set(x, y);
  unit.destination.set(x, y);
  return unit;
};

/** Everything Pyke drops into the world lands here until a manager tick. */
const pending = <T>(game: TestGame, Kind: abstract new (...args: never[]) => T): T | undefined =>
  game.objectManager._objectToBeAdd.find(o => o instanceof Kind) as T | undefined;

const tick = (thing: { update: () => void }, frames: number): void => {
  for (let i = 0; i < frames; i++) thing.update();
};

beforeEach(() => {
  installSpellObjectGlobals();
  installSketchMathGlobals();
  vi.stubGlobal('deltaTime', 16);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Q is the hook. Everything about it is the pull: the damage is small, the slow
 * is short, and what actually decides a fight is that the victim ends up next
 * to Pyke instead of where they chose to stand.
 */
describe('Pyke Q — Đâm Thấu Xương', () => {
  const throwAt = (aimX: number) => {
    const game = createGame();
    const pyke = champion(game, 0, 0, 'blue');
    game.setPlayer(pyke);
    const spell = new Pyke_Q(pyke);
    const accepted = pressSpell(spell, { at: { x: aimX, y: 0 } });
    return { game, pyke, spell, accepted, harpoon: pending(game, Pyke_Q_Harpoon) };
  };

  it('throws a harpoon exactly its own reach, whatever the cursor says', () => {
    const { accepted, pyke, harpoon } = throwAt(2_000);
    expect(accepted).toBe(true);
    expect(harpoon).toBeTruthy();
    expect(harpoon!.destination.dist(pyke.position)).toBeCloseTo(HARPOON_RANGE, 5);
  });

  it('stops on the first body it touches and never a second', () => {
    const { harpoon } = throwAt(HARPOON_RANGE);
    expect(harpoon!.maxHitCount).toBe(1);
  });

  it('damages, slows and hauls in the one it skewers', () => {
    const { game, pyke, harpoon } = throwAt(HARPOON_RANGE);
    const victim = champion(game, 300, 0, 'red');
    indexObjects(game, [pyke, victim, harpoon!] as never);

    const hurt = vi.spyOn(victim, 'takeDamage');
    tick(harpoon!, 60);

    expect(hurt.mock.calls[0].slice(0, 3)).toEqual([Q_DAMAGE, pyke, 'PHYSICAL']);

    const slow = live(victim).find(b => b instanceof Slow) as InstanceType<typeof Slow>;
    expect(slow?.percent).toBe(Q_SLOW_PERCENT);
    expect(slow?.duration).toBe(Q_SLOW_MS);

    const drag = live(victim).find(b => b instanceof Dash) as InstanceType<typeof Dash>;
    expect(drag).toBeTruthy();
    expect(drag.dashDestination!.dist(pyke.position)).toBeCloseTo(PULL_STOP_DISTANCE, 5);
  });

  it('pulls over a few hundred milliseconds rather than teleporting the body', () => {
    const { game, pyke, harpoon } = throwAt(HARPOON_RANGE);
    const victim = champion(game, 300, 0, 'red');
    indexObjects(game, [pyke, victim, harpoon!] as never);
    tick(harpoon!, 60);

    const drag = live(victim).find(b => b instanceof Dash) as InstanceType<typeof Dash>;
    // 300 out, resting at 70: 230px of travel, spread over the pull's frames.
    expect(drag.dashSpeed * PULL_FRAMES).toBeCloseTo(300 - PULL_STOP_DISTANCE, 5);
    expect(PULL_DURATION_MS).toBeGreaterThan(100);
  });

  it('turns the harpoon around so the art travels inward with the body', () => {
    const { game, pyke, harpoon } = throwAt(HARPOON_RANGE);
    const victim = champion(game, 300, 0, 'red');
    indexObjects(game, [pyke, victim, harpoon!] as never);
    tick(harpoon!, 60);

    expect(harpoon!.destination.dist(pyke.position)).toBeCloseTo(0, 5);
  });

  it('holds the rope up until the body has actually arrived', () => {
    // A close hook is the case that catches this: the spear covers the whole
    // way home while the body only covers what is left over the stop distance,
    // so the spear gets back first and must not take the pull with it.
    const { game, pyke, harpoon } = throwAt(HARPOON_RANGE);
    const victim = champion(game, 130, 0, 'red');
    indexObjects(game, [pyke, victim, harpoon!] as never);
    tick(harpoon!, 60);

    const drag = live(victim).find(b => b instanceof Dash) as InstanceType<typeof Dash>;
    expect(drag).toBeTruthy();
    expect(drag.toRemove).toBe(false);
    expect(harpoon!.toRemove).toBe(false);
  });

  it('leaves allies and Pyke himself alone', () => {
    const { game, pyke, harpoon } = throwAt(HARPOON_RANGE);
    const friend = champion(game, 200, 0, 'blue');
    indexObjects(game, [pyke, friend, harpoon!] as never);

    const hurt = vi.spyOn(friend, 'takeDamage');
    const selfHurt = vi.spyOn(pyke, 'takeDamage');
    tick(harpoon!, 60);

    expect(hurt).not.toHaveBeenCalled();
    expect(selfHurt).not.toHaveBeenCalled();
  });

  it('renews its slow instead of stacking ten of them', () => {
    const game = createGame();
    const pyke = champion(game, 0, 0, 'blue');
    game.setPlayer(pyke);
    const victim = champion(game, 300, 0, 'red');

    for (const _throw of [0, 1, 2]) {
      const spell = new Pyke_Q(pyke);
      pressSpell(spell, { at: { x: HARPOON_RANGE, y: 0 } });
      const harpoon = pending(game, Pyke_Q_Harpoon)!;
      game.objectManager._objectToBeAdd.length = 0;
      indexObjects(game, [pyke, victim, harpoon] as never);
      tick(harpoon, 60);
      victim.position.set(300, 0);
    }

    expect(live(victim).filter(b => b instanceof Slow)).toHaveLength(1);
  });
});

/**
 * W is a repositioning tool, not a chase tool, and the two rules that make it
 * one are the decay and the break. Either missing turns it into Twitch's Q.
 */
describe('Pyke W — Lặn Mất Tăm', () => {
  const dive = () => {
    const game = createGame();
    const pyke = champion(game, 0, 0, 'blue');
    game.setPlayer(pyke);
    const spell = new Pyke_W(pyke);
    const accepted = pressSpell(spell, { at: { x: 100, y: 0 } });
    const stealth = live(pyke).find(b => b instanceof Pyke_W_Stealth) as InstanceType<
      typeof Pyke_W_Stealth
    >;
    const rush = live(pyke).find(b => b instanceof Pyke_W_Rush) as InstanceType<typeof Pyke_W_Rush>;
    return { game, pyke, spell, accepted, stealth, rush };
  };

  it('submerges him and speeds him up for the dive', () => {
    const { accepted, stealth, rush } = dive();
    expect(accepted).toBe(true);
    expect(stealth).toBeInstanceOf(Invisible);
    expect(stealth.duration).toBe(DIVE_MS);
    expect(rush).toBeInstanceOf(Speedup);
    expect(rush.percent).toBeCloseTo(SPEEDUP_START_PERCENT, 5);
  });

  it('gives the two buffs stack ids of their own', () => {
    const { stealth, rush } = dive();
    expect(typeof stealth.stackId).toBe('string');
    expect(typeof rush.stackId).toBe('string');
    expect(stealth.stackId).not.toBe(rush.stackId);
  });

  it('does not break on the cast that started it', () => {
    const { pyke } = dive();
    expect(live(pyke).some(b => b instanceof Pyke_W_Stealth)).toBe(true);
  });

  it('starts fast and is ordinary by the end', () => {
    const { pyke, rush } = dive();
    const base = 3;

    expect(pyke.stats.speed.value).toBeCloseTo(base * (1 + SPEEDUP_START_PERCENT), 5);

    tick(rush, Math.round(DIVE_MS / 2 / 16));
    const halfway = rush.percent;
    expect(halfway).toBeLessThan(SPEEDUP_START_PERCENT);
    expect(halfway).toBeGreaterThan(SPEEDUP_END_PERCENT);
    expect(pyke.stats.speed.value).toBeCloseTo(base * (1 + halfway), 5);

    tick(rush, Math.round(DIVE_MS / 2 / 16));
    expect(rush.percent).toBeCloseTo(SPEEDUP_END_PERCENT, 2);
  });

  it('surfaces the moment he casts anything else', () => {
    const { game, pyke } = dive();
    game.eventManager.emit(EventType.ON_POST_CAST_SPELL, {
      owner: pyke,
      countsAsAbilityCast: true,
    });

    expect(live(pyke).some(b => b instanceof Pyke_W_Stealth)).toBe(false);
    expect(live(pyke).some(b => b instanceof Pyke_W_Rush)).toBe(false);
  });

  it('surfaces the moment a basic attack of his lands', () => {
    const { game, pyke } = dive();
    const victim = champion(game, 60, 0, 'red');
    game.eventManager.emit(EventType.ON_ATTACK_HIT, {
      attacker: pyke,
      victim,
      damage: 10,
      ranged: false,
    });

    expect(live(pyke).some(b => b instanceof Pyke_W_Stealth)).toBe(false);
  });

  it('ignores somebody else casting and somebody else swinging', () => {
    const { game, pyke } = dive();
    const stranger = champion(game, 400, 0, 'red');
    game.eventManager.emit(EventType.ON_POST_CAST_SPELL, {
      owner: stranger,
      countsAsAbilityCast: true,
    });
    game.eventManager.emit(EventType.ON_ATTACK_HIT, {
      attacker: stranger,
      victim: pyke,
      damage: 10,
      ranged: false,
    });

    expect(live(pyke).some(b => b instanceof Pyke_W_Stealth)).toBe(true);
  });

  it('takes its listeners with it when the dive ends', () => {
    const { game, stealth } = dive();
    const before = game.eventManager.subscribers.get(EventType.ON_POST_CAST_SPELL)?.length ?? 0;
    expect(before).toBeGreaterThan(0);

    stealth.deactivateBuff();

    expect(game.eventManager.subscribers.get(EventType.ON_POST_CAST_SPELL)?.length ?? 0).toBe(0);
    expect(game.eventManager.subscribers.get(EventType.ON_ATTACK_HIT)?.length ?? 0).toBe(0);
  });
});

/**
 * E is two moving things in sequence — Pyke out, the phantom back — and the
 * phantom is the half that does the work.
 */
describe('Pyke E — Dòng Nước Ma Quái', () => {
  const surge = () => {
    const game = createGame();
    const pyke = champion(game, 0, 0, 'blue');
    game.setPlayer(pyke);
    const spell = new Pyke_E(pyke);
    const accepted = pressSpell(spell, { at: { x: 1_000, y: 0 } });
    return { game, pyke, spell, accepted, phantom: pending(game, Pyke_E_Phantom) };
  };

  it('dashes him a fixed distance toward the aim point', () => {
    const { accepted, pyke } = surge();
    expect(accepted).toBe(true);

    const dash = live(pyke).find(b => b instanceof Dash) as InstanceType<typeof Dash>;
    expect(dash).toBeTruthy();
    expect(dash.dashDestination!.dist(createVector(0, 0))).toBeCloseTo(PHANTOM_DASH_DISTANCE, 5);
  });

  it('leaves the phantom standing where he started', () => {
    const { phantom } = surge();
    expect(phantom).toBeTruthy();
    expect(phantom!.position.dist(createVector(0, 0))).toBeCloseTo(0, 5);
  });

  it('holds the phantom still until the delay is up, then sends it after him', () => {
    const { pyke, phantom } = surge();
    pyke.position.set(PHANTOM_DASH_DISTANCE, 0);

    tick(phantom!, Math.floor(PHANTOM_DELAY_MS / 16) - 1);
    expect(phantom!.position.x).toBeCloseTo(0, 5);

    tick(phantom!, 3);
    expect(phantom!.position.x).toBeGreaterThan(0);
  });

  it('stuns and burns what the return sweeps through', () => {
    const { game, pyke, phantom } = surge();
    pyke.position.set(PHANTOM_DASH_DISTANCE, 0);
    const caught = champion(game, PHANTOM_DASH_DISTANCE / 2, 0, 'red');
    indexObjects(game, [pyke, caught] as never);

    const hurt = vi.spyOn(caught, 'takeDamage');
    tick(phantom!, Math.ceil(PHANTOM_DELAY_MS / 16) + Math.ceil(PHANTOM_DASH_DISTANCE / PHANTOM_SPEED) + 4);

    expect(hurt.mock.calls[0].slice(0, 3)).toEqual([E_DAMAGE, pyke, 'PHYSICAL']);
    const stun = live(caught).find(b => b instanceof Stun) as InstanceType<typeof Stun>;
    expect(stun?.duration).toBe(E_STUN_MS);
  });

  it('stuns each enemy once however many frames it spends on top of them', () => {
    const { game, pyke, phantom } = surge();
    pyke.position.set(PHANTOM_DASH_DISTANCE, 0);
    const caught = champion(game, PHANTOM_DASH_DISTANCE / 2, 0, 'red');
    indexObjects(game, [pyke, caught] as never);

    const hurt = vi.spyOn(caught, 'takeDamage');
    tick(phantom!, 400);

    expect(hurt).toHaveBeenCalledTimes(1);
    expect(caught.buffs.filter(b => b instanceof Stun)).toHaveLength(1);
  });

  it('sweeps past allies and past Pyke without touching either', () => {
    const { game, pyke, phantom } = surge();
    pyke.position.set(PHANTOM_DASH_DISTANCE, 0);
    const friend = champion(game, PHANTOM_DASH_DISTANCE / 2, 0, 'blue');
    indexObjects(game, [pyke, friend] as never);

    const hurt = vi.spyOn(friend, 'takeDamage');
    const selfHurt = vi.spyOn(pyke, 'takeDamage');
    tick(phantom!, 400);

    expect(hurt).not.toHaveBeenCalled();
    expect(selfHurt).not.toHaveBeenCalled();
    expect(live(pyke).some(b => b instanceof Stun)).toBe(false);
  });
});

/**
 * R is the champion. The threshold has to be a real execute — it kills through
 * a shield, core's marks have to agree with it, and a kill has to hand the
 * button straight back.
 */
describe('Pyke R — Tử Thần Đáy Sâu', () => {
  const arena = () => {
    const game = createGame();
    const pyke = champion(game, 0, 0, 'blue');
    game.setPlayer(pyke);
    return { game, pyke, spell: new Pyke_R(pyke) };
  };

  const strikeHome = (game: TestGame): void => {
    const mark = pending(game, Pyke_R_Mark);
    expect(mark).toBeTruthy();
    tick(mark!, Math.ceil(WINDUP_MS / 16) + 2);
  };

  it('is a unit-targeted spell that says whose body it may take', () => {
    const { spell } = arena();
    expect(spell.castSpec.targeting).toBe('UNIT');
    expect(spell.targetingRequest.targetTeam).toBe('ENEMY');
    expect(spell.range).toBe(R_RANGE);
  });

  it('promises a kill exactly where the threshold is', () => {
    const { game, spell } = arena();
    // One point under the line, and deliberately *more* health than the
    // ordinary blow deals — so this can only be true because of the execute.
    const doomed = champion(game, 200, 0, 'red');
    doomed.stats.health.baseValue = EXECUTE_THRESHOLD - 1;
    expect(STRIKE_DAMAGE).toBeLessThan(EXECUTE_THRESHOLD - 1);
    expect(isLethal(spell.executeDamageAgainst(doomed), doomed)).toBe(true);

    // One point over it, and the blow is ordinary again.
    const onTheLine = champion(game, 220, 0, 'red');
    onTheLine.stats.health.baseValue = EXECUTE_THRESHOLD;
    expect(spell.executeDamageAgainst(onTheLine)).toBe(STRIKE_DAMAGE);
    expect(isLethal(spell.executeDamageAgainst(onTheLine), onTheLine)).toBe(false);
  });

  it('counts a shield as health it has to chew through', () => {
    const { game, spell } = arena();
    const shielded = champion(game, 200, 0, 'red');
    shielded.stats.health.baseValue = 20;
    const bubble = new api.buffs.Shield(5_000, shielded, shielded);
    bubble.amount = EXECUTE_THRESHOLD;
    shielded.addBuff(bubble);

    expect(isLethal(spell.executeDamageAgainst(shielded), shielded)).toBe(false);
  });

  it('takes the one that dies over the one that is close', () => {
    const { game, pyke, spell } = arena();
    const healthy = champion(game, 60, 0, 'red');
    const dying = champion(game, 300, 0, 'red');
    dying.stats.health.baseValue = 10;
    indexObjects(game, [pyke, healthy, dying] as never);

    expect(pickExecuteTarget(spell)).toBe(dying);
  });

  it('kills outright below the threshold and hands the button straight back', () => {
    const { game, pyke, spell } = arena();
    const doomed = champion(game, 200, 0, 'red');
    // 31: more than the 30 the ordinary blow deals, so surviving is what a
    // missing execute would look like.
    doomed.stats.health.baseValue = EXECUTE_THRESHOLD - 1;
    indexObjects(game, [pyke, doomed] as never);

    expect(pressSpell(spell, { target: doomed, at: doomed.position })).toBe(true);
    expect(doomed.isDead).toBe(false);

    strikeHome(game);

    expect(doomed.isDead).toBe(true);
    expect(spell.currentCooldown).toBe(0);
  });

  it('is an ordinary blow at the threshold, and stays on cooldown', () => {
    const { game, pyke, spell } = arena();
    const sturdy = champion(game, 200, 0, 'red');
    sturdy.stats.health.baseValue = EXECUTE_THRESHOLD;
    indexObjects(game, [pyke, sturdy] as never);
    const hurt = vi.spyOn(sturdy, 'takeDamage');

    expect(pressSpell(spell, { target: sturdy, at: sturdy.position })).toBe(true);
    strikeHome(game);

    expect(hurt.mock.calls[0].slice(0, 3)).toEqual([STRIKE_DAMAGE, pyke, 'MAGIC']);
    expect(sturdy.isDead).toBe(false);
    // Two health left, which is the whole difference the threshold makes.
    expect(sturdy.stats.health.value).toBe(2);
    expect(spell.currentCooldown).toBeGreaterThan(0);
  });

  it('does not reach a body that walked out of the X before the blade came up', () => {
    const { game, pyke, spell } = arena();
    const runner = champion(game, 200, 0, 'red');
    runner.stats.health.baseValue = EXECUTE_THRESHOLD - 1;
    indexObjects(game, [pyke, runner] as never);

    expect(pressSpell(spell, { target: runner, at: runner.position })).toBe(true);
    runner.position.set(200, 400);
    strikeHome(game);

    expect(runner.isDead).toBe(false);
    expect(runner.stats.health.value).toBe(EXECUTE_THRESHOLD - 1);
  });

  it('refuses to resolve onto Pyke or an ally with the cursor on open ground', () => {
    const { game, pyke, spell } = arena();
    const friend = champion(game, 100, 0, 'blue');
    indexObjects(game, [pyke, friend] as never);
    const selfHurt = vi.spyOn(pyke, 'takeDamage');
    const friendHurt = vi.spyOn(friend, 'takeDamage');

    expect(pressSpell(spell, { at: { x: 900, y: 900 } })).toBe(false);
    expect(pending(game, Pyke_R_Mark)).toBeUndefined();
    expect(selfHurt).not.toHaveBeenCalled();
    expect(friendHurt).not.toHaveBeenCalled();
  });
});
