import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestApi } from '@moba2d/core/testing';
import type { CastContext } from '@moba2d/core/content/types';
import {
  createGame,
  createUnit,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Malphite_R, { CHARGE_SPEED, MAX_RANGE } from '../../spells/Malphite_R';

const __api = buildTestApi();
const { Dash, Stun } = __api.buffs;
type Dash = InstanceType<typeof __api.buffs.Dash>;

/**
 * "Không thể cản phá bởi các hiệu ứng khống chế", tested against the two things
 * that were cản phá-ing it.
 *
 * Reported from a real match: Temari's W drag and her R throw both stopped the
 * charge dead, crater and all. Neither is an interrupt in the sense the dash
 * was checking for — both are `Dash` buffs applied to the victim, which is what
 * every pull, knockback and throw in every pack is, and `Dash.buffAddType` is
 * `REPLACE_EXISTING`. So the pull did not *cancel* the charge, it *replaced*
 * it, and `cancelable = false` never had an opinion about that.
 *
 * The displacements below are built the way `Temari_W.dragToward` and
 * `Temari_R`'s burst build theirs, deliberately including their
 * `cancelable = false` and empty `buffsToCheckCancel` — a copy of the shape,
 * not an import, so this still measures the real case if that pack changes.
 */
function unit(game: TestGame, x = 0, teamId = 'blue') {
  const result = createUnit(game, x, teamId);
  result.stats.mana.baseValue = 500;
  result.stats.health.baseValue = 1000;
  result.stats.maxHealth.baseValue = 1000;
  result.animatedValues.displaySize = 55;
  return result;
}

const castAt = (owner: ReturnType<typeof unit>, x: number, y: number): CastContext =>
  Object.freeze({
    spellId: 'malphite-r',
    activationId: 'activation',
    startedAtMs: 1,
    caster: owner,
    origin: Object.freeze({ x: owner.position.x, y: owner.position.y }),
    cursorWorld: Object.freeze({ x, y }),
    direction: Object.freeze({ x: 1, y: 0 }),
  });

/** Exactly the shape Temari's drag and throw hand to `addBuff`. */
const displace = (
  victim: ReturnType<typeof unit>,
  by: ReturnType<typeof unit>,
  to: { x: number; y: number }
) => {
  const thrown = new Dash(500, by, victim);
  thrown.dashDestination = createVector(to.x, to.y);
  thrown.dashSpeed = 10;
  thrown.cancelable = false;
  thrown.showTrail = false;
  thrown.buffsToCheckCancel = [];
  victim.addBuff(thrown);
  return thrown;
};

const chargeOf = (owner: ReturnType<typeof unit>): Dash | undefined =>
  owner.buffs.find((b): b is Dash => b instanceof Dash && !b.toRemove);

describe('Malphite R', () => {
  beforeEach(() => {
    installSpellObjectGlobals();
    vi.stubGlobal('deltaTime', 16);
    vi.stubGlobal('random', () => 0.5);
    vi.stubGlobal('TWO_PI', Math.PI * 2);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('charges on a dash that is marked unstoppable, not merely uncancelable', () => {
    const game = createGame();
    const owner = unit(game);
    expect(new Malphite_R(owner).press(castAt(owner, MAX_RANGE, 0))).toBe(true);

    const charge = chargeOf(owner)!;
    expect(charge.unstoppable).toBe(true);
    expect(charge.dashSpeed).toBe(CHARGE_SPEED);
  });

  it('keeps flying through a pull, which is what the card promises', () => {
    const game = createGame();
    const owner = unit(game);
    const temari = unit(game, 600, 'red');
    new Malphite_R(owner).press(castAt(owner, MAX_RANGE, 0));
    const charge = chargeOf(owner)!;

    charge.update();
    const reached = owner.position.x;
    expect(reached).toBeGreaterThan(0);

    // The drag, then the throw — the two effects the report named.
    const drag = displace(owner, temari, { x: -300, y: 0 });
    const throwOut = displace(owner, temari, { x: -300, y: 300 });

    expect(charge.toRemove).toBe(false);
    expect(chargeOf(owner)).toBe(charge);
    expect(drag.toRemove || !owner.buffs.includes(drag)).toBe(true);
    expect(throwOut.toRemove || !owner.buffs.includes(throwOut)).toBe(true);

    // And it is still going where he aimed it, not where he was pulled.
    charge.update();
    expect(owner.position.x).toBeGreaterThan(reached);
    expect(charge.dashDestination?.x).toBeCloseTo(MAX_RANGE, 5);
  });

  it('still takes the crowd control itself — only the charge is protected', () => {
    const game = createGame();
    const owner = unit(game);
    const temari = unit(game, 600, 'red');
    new Malphite_R(owner).press(castAt(owner, MAX_RANGE, 0));
    const charge = chargeOf(owner)!;

    const stun = new Stun(800, temari, owner);
    owner.addBuff(stun);

    // The stun lands and outlives the flight; what it may not do is end it.
    expect(owner.buffs).toContain(stun);
    expect(stun.toRemove).toBe(false);
    charge.update();
    expect(charge.toRemove).toBe(false);
  });

  it('lets a pull land again the moment the charge is over', () => {
    const game = createGame();
    const owner = unit(game);
    const temari = unit(game, 600, 'red');
    new Malphite_R(owner).press(castAt(owner, MAX_RANGE, 0));
    const charge = chargeOf(owner)!;

    charge.deactivateBuff();

    const pull = displace(owner, temari, { x: -300, y: 0 });
    expect(pull.toRemove).toBe(false);
    expect(owner.buffs).toContain(pull);
  });
});

/**
 * And the rule behind the one ability, across the whole pack.
 *
 * Three cards promise it and they promise it in three different sentences —
 * "Không thể cản phá bởi các hiệu ứng khống chế" (Malphite R), "không gì cản
 * được" (Vi R), "không ngăn được cú kéo này" (Amumu Q). Two of the three were
 * found only because the first grep went looking for the first phrasing and
 * missed them, which is exactly the kind of gap a promise-shaped rule closes
 * and a per-ability test does not.
 *
 * A source scan, like `noCoreReach`: what is being checked is that a sentence
 * on a card is backed by the one flag that makes it true, and reading the two
 * off the file costs a millisecond across every spell in the pack. `cancelable
 * = false` does **not** count — it is the older, narrower flag that skips the
 * interrupt check and leaves a displacement free to replace the dash through
 * the stack, which is the bug all three of these had.
 */
describe("a card that promises the charge cannot be stopped", () => {
  /** The ways this pack says it. Add the sentence here when a new one says it. */
  const PROMISES = ['cản phá', 'không gì cản được', 'không ngăn được'];

  const spellDir = join(__dirname, '../../spells');
  const sources = readdirSync(spellDir)
    .filter(name => name.endsWith('.ts'))
    .map(name => ({ name, text: readFileSync(join(spellDir, name), 'utf8') }));

  it('finds spells to scan, or this proves nothing', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it('is backed by a dash that is unstoppable, not merely uncancelable', () => {
    // Only the description, never a comment: this file's own prose names all
    // three abilities, and a scan that read comments would pass on itself.
    const promising = sources.filter(({ text }) => {
      const at = text.indexOf('description');
      if (at === -1) return false;
      const description = text.slice(at, text.indexOf(';', at));
      return PROMISES.some(phrase => description.includes(phrase));
    });

    expect(promising.map(s => s.name).sort()).toEqual([
      'Amumu_Q.ts',
      'Malphite_R.ts',
      'Vi_R.ts',
    ]);

    const unbacked = promising
      .filter(({ text }) => !text.includes('unstoppable = true'))
      .map(({ name }) => name);
    expect(
      unbacked,
      'these cards promise crowd control cannot stop the dash, and nothing in ' +
        'the file makes that true — a displacement is another Dash and replaces ' +
        'the charge through the stack whatever `cancelable` says'
    ).toEqual([]);
  });
});
