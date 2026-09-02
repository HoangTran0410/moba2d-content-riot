/**
 * Can a bot reach these kits?
 *
 * The gate that catches an ability nobody can see is missing. Everything else
 * in this pack's build fails loudly; this one fails as an *absence*, in a
 * match: the bot has the ability, it is off cooldown, it is in range, and it
 * is never pressed.
 *
 * The rules live in core (`@moba2d/core/testing/bots`) and score every
 * ability through `BotBrain.scoreSpell` itself, so they cannot drift from the
 * numbers the bot uses. This file is the population and the debt.
 *
 * ## What the first sweep found here
 *
 * 190 findings across 67 champions, and one line of `inferRoles` explains
 * nearly all of them: a `SELF` cast with a mana cost reads as
 * `Buff | Shield`, and `scoreSpell` pays `Shield` **+20 below half health and
 * −5 above**. So the mask comes to exactly **0** in a fight, and `chooseSpell`
 * drops candidates scoring `<= 0` — the ability is not deprioritised while
 * fighting, it is not in the list.
 *
 *   self-cast-untagged  93   never said what it is
 *   dead-in-combat      68   only pressable while hurt or fleeing
 *   panic-ultimate      29   best moment is nearly dying
 *
 * Read as champions rather than counts: a bot holding **Garen** has four
 * abilities it can only press while running away. So does **Master Yi**, and
 * **Alistar**, and **Warwick**. Zed, Nocturne, Lee Sin, Ekko and Diana save
 * their ultimate for the moment they are about to die. None of this is
 * visible from any other gate, and all of it was reported the only way it
 * could be — as a bot that felt passive.
 *
 * ## Why the list rather than the fix
 *
 * Ninety-three tags is ninety-three judgements about what an ability *is*,
 * and each one is a sentence somebody has to mean. Guessing them in a batch
 * is how `Kage Bunshin` ended up tagged `Summon` alone and scoring *lower*
 * than the inference it replaced. So the debt is written down, the gate is
 * green today, and the next new champion goes red on its own — which is the
 * only property that actually stops the list from growing.
 *
 * Delete a line when you tag the spell. Stale entries fail on their own.
 */
import { describeBotRoles } from '@moba2d/core/testing/bots';
import { data } from '../pack';
import * as spells from '../spells/index';

describeBotRoles({
  label: 'lol — the bot can reach every kit',
  spells,
  champions: (data.champions ?? [])
    .filter(champion => champion.playable)
    .map(champion => ({ id: champion.id, name: champion.name, spells: champion.spells ?? [] })),
  // Emptied. Ninety-seven abilities read one at a time — description,
  // constants, `castSpec` and body — and each one given the sentence that
  // justifies its tag. What made that affordable rather than a guessing
  // exercise is that the reading is the work and the sweep is the check: the
  // gate below re-scores every one of them through `BotBrain.scoreSpell`, so
  // a tag that sounds right and scores wrong still fails here.
  knownDebt: [
  ],
});
