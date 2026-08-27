import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import { indexObjects } from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';
import Riven_W, { W_DAMAGE } from '../spells/Riven_W';

/**
 * Damage this pack deals reaches the death recap with the ability's name on it.
 *
 * It used to reach it because every `takeDamage` call passed the name by hand,
 * and 21 assertions across this suite checked that the author had remembered —
 * `expect.any(String)` as a fourth argument. They were checking a habit, and
 * the habit had already failed elsewhere: a sibling pack's whole Lina kit
 * omitted it, so a player killed by her read "Sát thương phép" and learned
 * nothing. That is the bug this replaces.
 *
 * Core now infers the name from whatever is casting
 * (`@moba2d/core`'s `combat/DamageAttribution.ts`), so the 199 redundant
 * arguments are gone and no future spell has to remember. This is what proves
 * it still arrives — an assertion on the recap the player actually reads,
 * rather than on an argument nobody downstream had to honour.
 *
 * `Janna_W.test.ts` guards the other half: the five spells that deliberately
 * name something other than themselves, where the argument is an override and
 * stays.
 */
describe('damage this pack deals names itself in the recap', () => {
  let game: TestGame;

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 16);
    game = createGame();
  });

  it('files a cast under the ability, with nothing in the spell saying so', () => {
    const riven = createUnit(game, 0, 'blue');
    const victim = createUnit(game, 40, 'red');
    game.setPlayer(riven);
    indexObjects(game, [riven, victim]);

    const spell = new Riven_W(riven);
    expect(pressSpell(spell, { at: { x: 40, y: 0 } })).toBe(true);
    // W has a windup, so the burst lands on a later tick rather than on the
    // press. Driving the spell is also what keeps the attribution live: the
    // bracket is around `Spell.update`, not around the key press.
    for (let tick = 0; tick < 60 && victim.recentDamageLog.length === 0; tick++) spell.update();

    const hit = victim.recentDamageLog.find(entry => entry.amount === W_DAMAGE);
    expect(hit, 'the burst never landed, so this proves nothing').toBeDefined();
    expect(hit?.source, 'the recap would print the damage type instead').toBe(spell.name);
  });
});
