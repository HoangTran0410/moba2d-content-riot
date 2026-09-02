/**
 * *When* the bot does things — the axis nothing else in this pack measures.
 *
 * `BotBrain.cast` schedules a follow-through for every `RECAST` activation at
 * `recastDelayMs`, which defaults to **0**. That is right for the five
 * abilities here whose recast *is* the payload — a detonation detonates, a
 * queued shot fires, a second dash goes a second time — and wrong for the
 * three below, each in a different way. `Spell.aiRecastAfterMs` is where an
 * ability says so.
 *
 * The failure is silent in all three cases: the ability is chosen, cast, and
 * recast exactly as designed. It is just recast at the worst possible moment,
 * forever, and nothing anywhere compares the moment to anything.
 */
import { describe, expect, it } from 'vitest';
import Riven_R, { R_DURATION_MS } from '../spells/Riven_R';
import Janna_Q from '../spells/Janna_Q';
import TwistedFate_W, { CARD_ORDER, SHUFFLE_INTERVAL_MS } from '../spells/TwistedFate_W';
import Jhin_R from '../spells/Jhin_R';
import Ziggs_W from '../spells/Ziggs_W';
import Irelia_E from '../spells/Irelia_E';
import Renekton_E from '../spells/Renekton_E';
import Syndra_W from '../spells/Syndra_W';
import Varus_Q, { DAMAGE_CHARGE_MS, MAX_CHARGE_MS, RANGE_CHARGE_MS } from '../spells/Varus_Q';
import Pyke_Q from '../spells/Pyke_Q';
import Irelia_W from '../spells/Irelia_W';
import Vi_Q from '../spells/Vi_Q';

describe('recasts the bot must not spend at once', () => {
  it('holds the Wind Slash until the window it would end is nearly over', () => {
    // `onRecast` fires the cone *and* calls `endReforge()`. Pressed at once
    // the bot gets the cone and none of the nine seconds; never pressed, the
    // window lapses on its own and the cone never happens. Late is the only
    // answer, and it must stay inside the window to fire at all.
    expect(Riven_R.aiRecastAfterMs).toBeLessThan(R_DURATION_MS);
    expect(Riven_R.aiRecastAfterMs).toBeGreaterThan(R_DURATION_MS * 0.8);
  });

  it('never presses the storm, because leaving it alone is stronger', () => {
    // The recast releases at whatever charge it has, and the object fires
    // itself at full charge if nobody interrupts. An automatic press was
    // strictly worse than doing nothing.
    expect(Janna_Q.aiRecastAfterMs).toBe(Infinity);
  });

  it('waits for the card a bot can actually use', () => {
    // Derived, never restated: the assertion reads the same table the ability
    // does, so retuning `SHUFFLE_INTERVAL_MS` or reordering the deck fails
    // here instead of quietly moving which card the bot locks.
    const step = Math.floor((TwistedFate_W.aiRecastAfterMs ?? 0) / SHUFFLE_INTERVAL_MS);
    expect(CARD_ORDER[step % CARD_ORDER.length]).toBe('VANG');
  });

  it('lands the wait in the middle of that card, not on its edge', () => {
    // A recast timed to a boundary is a coin toss on frame timing.
    const within = (TwistedFate_W.aiRecastAfterMs ?? 0) % SHUFFLE_INTERVAL_MS;
    expect(within).toBeGreaterThan(SHUFFLE_INTERVAL_MS * 0.25);
    expect(within).toBeLessThan(SHUFFLE_INTERVAL_MS * 0.75);
  });
});

describe('recasts that are the payload keep their follow-through', () => {
  it('says nothing, so the bot presses them as it always has', () => {
    // The other half of the rule, and the one worth guarding: a detonation
    // that never detonates is the opposite regression, and it would be just
    // as invisible.
    for (const spell of [Jhin_R, Ziggs_W, Irelia_E, Renekton_E, Syndra_W]) {
      expect(spell.aiRecastAfterMs, spell.name).toBeUndefined();
    }
  });
});

describe('how long the bot holds a charge', () => {
  it('lets go of the arrow the moment it stops improving', () => {
    // Derived from the ability's own two ramps rather than restated: range
    // maxes at one and damage at the other, so anything at or past the later
    // of the two is a full-strength shot and everything after it is a bot
    // standing still, not thinking, for no gain.
    const stopsPaying = Math.max(RANGE_CHARGE_MS, DAMAGE_CHARGE_MS);
    expect(Varus_Q.aiChargeReleaseAtMs).toBe(stopsPaying);
    // And well clear of the window that ends in a cancel, not a shot.
    expect(Varus_Q.aiChargeReleaseAtMs).toBeLessThan(MAX_CHARGE_MS);
  });

  it('names a moment on every charge whose window ends in a cancel', () => {
    // `releaseAtMax: false` means `SpellRuntime.updateCharge` throws the
    // ability away at max. Core clamps a bot short of it anyway, so this is
    // not a safety net — it is that holding these to the ceiling buys nothing
    // and costs the bot its eyes.
    for (const spell of [Varus_Q, Pyke_Q]) {
      expect(spell.aiChargeReleaseAtMs, spell.name).toBeDefined();
    }
  });

  it('says nothing on the charges that fire themselves at the top', () => {
    // `releaseAtMax: true` — the runtime lets go at full charge, so the
    // default is already the best answer and a number here would be a second
    // copy of `maxDurationMs` waiting to drift.
    for (const spell of [Irelia_W, Vi_Q]) {
      expect(spell.aiChargeReleaseAtMs, spell.name).toBeUndefined();
    }
  });
});
