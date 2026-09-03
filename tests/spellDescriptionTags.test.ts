import { describeSpellDescriptions } from '@moba2d/core/testing/spellText';
import { spellCatalog } from '../generated/spellCatalog';
import { data } from '../pack';

/**
 * This pack's coloured numbers, held to core's rules rather than to the copy
 * of them that used to live here.
 *
 * ## What this file used to be, and why none of it is needed
 *
 * A scan that read the pack's own Vietnamese prose: every `damage` span must
 * open with a flat figure; the words after that figure must not be "máu",
 * "giây", "giáp" or a dozen other units that mean it is not a hit; every
 * `heal` span must put its number first or it silently never rescales at all.
 * Each of those rules exists because core found the figure by *parsing the
 * sentence*, so the shape of the sentence was load-bearing.
 *
 * `api.text.dmg(amount, type, tail)` writes the markup now and records the
 * figure in `data-base`, so core reads a number it was given. The whole class
 * of defect goes with it: a span cannot be missing its damage type (required
 * argument), cannot lose its leading figure to a `+`, and cannot be a strike
 * count wearing the damage colour unless somebody called `dmg` on a strike
 * count. Three real bugs of exactly those shapes had shipped across the packs.
 *
 * One of them was in this pack and is worth naming, because it is the kind
 * only the helper could fix rather than merely catch: Jhin's Q lists its
 * escalating bounces as `18 / 24 / 30`, and the old parser scaled the leading
 * number and left the other two at their first-frame values. It now maps
 * `dmg()` over the array, so all three ends scale.
 *
 * ## Item text is in scope, and is paint
 *
 * `economy/ItemShop` builds every item ability with
 * `damageScalesWithAbilityPower = false` — an item already reads the wearer's
 * attack damage and must not draw from both stats — so core never rescales an
 * item description. The shelf's spans therefore carry `data-flat="none"`,
 * written by hand because `data.ts` is the pack's data half and may not
 * value-import the engine. That attribute is the difference between "paint,
 * deliberately" and "a figure whose author forgot the helper", which is the
 * distinction the rules below are built on.
 */
describeSpellDescriptions({
  descriptions: () => [
    ...Object.entries(spellCatalog).map(
      ([id, spell]): [string, string] => [id, spell.description]
    ),
    ...Object.values(data.items ?? {}).map(
      (item): [string, string] => [`item ${item.id}`, item.description ?? '']
    ),
  ],
});
