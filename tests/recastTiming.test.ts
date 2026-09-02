/**
 * When the bot is allowed to press a recast.
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
