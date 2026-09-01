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
  knownDebt: [
  // A costed `SELF` cast with no `static aiRoles`. `inferRoles` calls every
  // one of them `Buff | Shield`, and the pack has never said otherwise.
  'self-cast-untagged:Ahri_W',
  'self-cast-untagged:Alistar_E',
  'self-cast-untagged:Alistar_Q',
  'self-cast-untagged:Alistar_R',
  'self-cast-untagged:Alistar_W',
  'self-cast-untagged:Amumu_E',
  'self-cast-untagged:Amumu_R',
  'self-cast-untagged:Amumu_W',
  'self-cast-untagged:Annie_E',
  'self-cast-untagged:Blitzcrank_R',
  'self-cast-untagged:Blitzcrank_W',
  'self-cast-untagged:Camille_Q',
  'self-cast-untagged:Cassiopeia_E',
  'self-cast-untagged:ChoGath_R',
  'self-cast-untagged:Darius_Q',
  'self-cast-untagged:Darius_R',
  'self-cast-untagged:Darius_W',
  'self-cast-untagged:Diana_R',
  'self-cast-untagged:Diana_W',
  'self-cast-untagged:Ekko_R',
  'self-cast-untagged:Fizz_Q',
  'self-cast-untagged:Fizz_W',
  'self-cast-untagged:Garen_E',
  'self-cast-untagged:Garen_Q',
  'self-cast-untagged:Garen_R',
  'self-cast-untagged:Garen_W',
  'self-cast-untagged:Janna_R',
  'self-cast-untagged:JarvanIV_W',
  'self-cast-untagged:Jinx_Q',
  'self-cast-untagged:KogMaw_W',
  'self-cast-untagged:LeeSin_E',
  'self-cast-untagged:LeeSin_R',
  'self-cast-untagged:LeeSin_W',
  'self-cast-untagged:Lissandra_R',
  'self-cast-untagged:Lissandra_W',
  'self-cast-untagged:Malphite_E',
  'self-cast-untagged:MasterYi_E',
  'self-cast-untagged:MasterYi_Q',
  'self-cast-untagged:MasterYi_R',
  'self-cast-untagged:MasterYi_W',
  'self-cast-untagged:Morgana_E',
  'self-cast-untagged:Morgana_R',
  'self-cast-untagged:Nasus_Q',
  'self-cast-untagged:Nasus_R',
  'self-cast-untagged:Nasus_W',
  'self-cast-untagged:Nautilus_E',
  'self-cast-untagged:Nautilus_W',
  'self-cast-untagged:Nocturne_E',
  'self-cast-untagged:Nocturne_R',
  'self-cast-untagged:Nocturne_W',
  'self-cast-untagged:Olaf_R',
  'self-cast-untagged:Olaf_W',
  'self-cast-untagged:Orianna_R',
  'self-cast-untagged:Orianna_W',
  'self-cast-untagged:Pantheon_W',
  'self-cast-untagged:Pyke_W',
  'self-cast-untagged:Rammus_E',
  'self-cast-untagged:Rammus_W',
  'self-cast-untagged:Renekton_Q',
  'self-cast-untagged:Renekton_R',
  'self-cast-untagged:Renekton_W',
  'self-cast-untagged:Riven_R',
  'self-cast-untagged:Riven_W',
  'self-cast-untagged:Sett_Q',
  'self-cast-untagged:Shaco_E',
  'self-cast-untagged:Shen_W',
  'self-cast-untagged:Singed_E',
  'self-cast-untagged:Singed_Q',
  'self-cast-untagged:Singed_R',
  'self-cast-untagged:Soraka_R',
  'self-cast-untagged:Teemo_W',
  'self-cast-untagged:Thresh_R',
  'self-cast-untagged:Trundle_Q',
  'self-cast-untagged:TwistedFate_W',
  'self-cast-untagged:Twitch_E',
  'self-cast-untagged:Twitch_Q',
  'self-cast-untagged:Twitch_R',
  'self-cast-untagged:Varus_W',
  'self-cast-untagged:Vayne_R',
  'self-cast-untagged:Vayne_W',
  'self-cast-untagged:Vi_E',
  'self-cast-untagged:Vi_W',
  'self-cast-untagged:Warwick_E',
  'self-cast-untagged:Warwick_Q',
  'self-cast-untagged:Warwick_R',
  'self-cast-untagged:Warwick_W',
  'self-cast-untagged:XinZhao_E',
  'self-cast-untagged:XinZhao_Q',
  'self-cast-untagged:XinZhao_R',
  'self-cast-untagged:Yasuo_E',
  'self-cast-untagged:Yasuo_R',
  'self-cast-untagged:Zed_E',
  'self-cast-untagged:Zed_R',
  // The consequence of the line above, priced: `Buff + Shield` is 5 − 5 = 0
  // above half health, and `chooseSpell` drops candidates scoring `<= 0`. A
  // bot holding Garen has *four* abilities it can only press while fleeing.
  'dead-in-combat:Ahri_W',
  'dead-in-combat:Alistar_E',
  'dead-in-combat:Alistar_Q',
  'dead-in-combat:Alistar_W',
  'dead-in-combat:Amumu_E',
  'dead-in-combat:Amumu_W',
  'dead-in-combat:Annie_E',
  'dead-in-combat:Blitzcrank_W',
  'dead-in-combat:Camille_Q',
  'dead-in-combat:Cassiopeia_E',
  'dead-in-combat:Darius_Q',
  'dead-in-combat:Darius_W',
  'dead-in-combat:Diana_W',
  'dead-in-combat:Fizz_Q',
  'dead-in-combat:Fizz_W',
  'dead-in-combat:Garen_E',
  'dead-in-combat:Garen_Q',
  'dead-in-combat:Garen_W',
  'dead-in-combat:Janna_E',
  'dead-in-combat:JarvanIV_W',
  'dead-in-combat:Jinx_Q',
  'dead-in-combat:KogMaw_W',
  'dead-in-combat:LeeSin_E',
  'dead-in-combat:LeeSin_W',
  'dead-in-combat:Lissandra_W',
  'dead-in-combat:Malphite_E',
  'dead-in-combat:MasterYi_E',
  'dead-in-combat:MasterYi_Q',
  'dead-in-combat:MasterYi_W',
  'dead-in-combat:Morgana_E',
  'dead-in-combat:Nasus_Q',
  'dead-in-combat:Nasus_W',
  'dead-in-combat:Nautilus_E',
  'dead-in-combat:Nautilus_W',
  'dead-in-combat:Nocturne_E',
  'dead-in-combat:Nocturne_W',
  'dead-in-combat:Olaf_W',
  'dead-in-combat:Orianna_E',
  'dead-in-combat:Orianna_W',
  'dead-in-combat:Pantheon_W',
  'dead-in-combat:Pyke_W',
  'dead-in-combat:Rammus_E',
  'dead-in-combat:Rammus_W',
  'dead-in-combat:Renekton_Q',
  'dead-in-combat:Renekton_W',
  'dead-in-combat:Riven_W',
  'dead-in-combat:Sett_Q',
  'dead-in-combat:Shaco_E',
  'dead-in-combat:Shen_W',
  'dead-in-combat:Singed_E',
  'dead-in-combat:Singed_Q',
  'dead-in-combat:Soraka_W',
  'dead-in-combat:Teemo_W',
  'dead-in-combat:Trundle_Q',
  'dead-in-combat:TwistedFate_W',
  'dead-in-combat:Twitch_E',
  'dead-in-combat:Twitch_Q',
  'dead-in-combat:Varus_W',
  'dead-in-combat:Vayne_W',
  'dead-in-combat:Vi_E',
  'dead-in-combat:Vi_W',
  'dead-in-combat:Warwick_E',
  'dead-in-combat:Warwick_Q',
  'dead-in-combat:Warwick_W',
  'dead-in-combat:XinZhao_E',
  'dead-in-combat:XinZhao_Q',
  'dead-in-combat:Yasuo_E',
  'dead-in-combat:Zed_E',
  // An ultimate whose single best moment is nearly dying. Zed, Nocturne,
  // Lee Sin, Master Yi, Ekko — the whole shape of this pack's assassins.
  'panic-ultimate:Alistar_R',
  'panic-ultimate:Amumu_R',
  'panic-ultimate:Blitzcrank_R',
  'panic-ultimate:ChoGath_R',
  'panic-ultimate:Darius_R',
  'panic-ultimate:Diana_R',
  'panic-ultimate:Ekko_R',
  'panic-ultimate:Garen_R',
  'panic-ultimate:Janna_R',
  'panic-ultimate:LeeSin_R',
  'panic-ultimate:Lissandra_R',
  'panic-ultimate:MasterYi_R',
  'panic-ultimate:Morgana_R',
  'panic-ultimate:Nasus_R',
  'panic-ultimate:Nocturne_R',
  'panic-ultimate:Olaf_R',
  'panic-ultimate:Orianna_R',
  'panic-ultimate:Renekton_R',
  'panic-ultimate:Riven_R',
  'panic-ultimate:Shen_R',
  'panic-ultimate:Singed_R',
  'panic-ultimate:Soraka_R',
  'panic-ultimate:Thresh_R',
  'panic-ultimate:Twitch_R',
  'panic-ultimate:Vayne_R',
  'panic-ultimate:Warwick_R',
  'panic-ultimate:XinZhao_R',
  'panic-ultimate:Yasuo_R',
  'panic-ultimate:Zed_R',
  ],
});
