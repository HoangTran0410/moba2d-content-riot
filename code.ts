import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type { ContentPackCode, SpellSource } from '@moba2d/core/content/ContentPack';
import { setPackApi } from './packApi';
import { spellModules } from './generated/spellModules';
import makeBaronAbilities from './monsters/Baron';
import makeDragonAbilities from './monsters/Dragon';
import makeKrugAbilities from './monsters/Krugs';
import makeScuttleAbilities from './monsters/ScuttleCrab';
import makeVilemawAbilities from './monsters/Vilemaw';
import {
  makeBaronBlessing,
  makeBlueSentinelAbilities,
  makeRedBramblebackAbilities,
} from './monsters/JungleBuffs';

/**
 * This pack's code half: real engine classes, built from the injected
 * `api` — 237 spells behind `./generated/spellModules.ts`'s dynamic
 * imports, and Baron's abilities.
 *
 * Deliberately its own file, sibling to `./data.ts` rather than folded into
 * it (batch 4 task 7 — see `./pack.ts`'s own header). `install.ts` — core,
 * not this pack — is what folds core's own `BasicAttack` *and* `Recall`
 * spells on top of what this factory returns: a pack file may not import
 * `@/generated/spellModules` or `@/game/gameObject/coreSpells/Recall`
 * (the `pack-core-boundary` seam allows only
 * `@moba2d/core/content/ContentApi`/`ContentPack`/`types`, type-only), and "a bare
 * spell id always resolves against this pack" is a promise `qualifySpellId`
 * makes about the *whole* installed `riot` entry, `BasicAttack` and `Recall`
 * included — not something this pack's own data is entitled to decide on
 * core's behalf. `./data.ts`'s `championEntries()` still names every
 * champion's way home as the bare string `'Recall'` (`recall: 'Recall'`);
 * `install.ts` is what makes that id resolve to a real class, exactly the
 * way it already does for the bare `'BasicAttack'` every kit's slot 0 names.
 */
const spellSources = (): Record<string, SpellSource> => {
  const out: Record<string, SpellSource> = {};
  for (const [id, load] of Object.entries(spellModules)) {
    out[id] = () => load().then(module => module.default);
  }
  return out;
};

/**
 * `api` is used here and nowhere else in this pack: `./data.ts` is pure data
 * and never touches it. Three monsters carry a code half — Baron, which both
 * fights and pays, and the two buff camps, whose whole meaning is what
 * killing them grants. See `./monsters/Baron.ts`'s own header for why
 * abilities live in the code half rather than on `MonsterBody`/`MonsterDef`,
 * and `./monsters/JungleBuffs.ts`'s for how a reward-only camp states itself
 * through the same `MonsterAbility` channel.
 */
const code = (api: ContentApi): ContentPackCode => {
  // **First, and before anything reaches a spell module.** Every class in
  // `spells/` is declared against `packApi.ts`'s `api` and reads it the moment
  // its module evaluates; the loaders below are lazy, so nothing has evaluated
  // yet when this runs. See `packApi.ts`'s header for the other two callers.
  setPackApi(api);

  return {
    spells: spellSources(),
    monsterAbilities: {
      // Baron's kit **plus** its reward, appended rather than replacing:
      // `makeBaronAbilities` is what it does while alive, `makeBaronBlessing`
      // is what killing it is worth. `Monster.castAbility` walks the list in
      // order and the blessing declares a negative range, so it can never be
      // picked as something to cast — see `monsters/JungleBuffs.ts`'s header.
      baron: [...makeBaronAbilities(api), makeBaronBlessing(api)],
      blue: makeBlueSentinelAbilities(api),
      red: makeRedBramblebackAbilities(api),
      // Three more reward camps and one more boss. Dragon and Vilemaw pay a
      // team-wide blessing the way Baron does; Krug's "reward" is that it
      // splits into more of itself; the crab leaves a shrine behind.
      dragon: makeDragonAbilities(api),
      krugs: makeKrugAbilities(api),
      scuttle: makeScuttleAbilities(api),
      vilemaw: makeVilemawAbilities(api),
    },
    // No `turretPassives` and no `slotObjects` any more: the three turret
    // passives and the health relic both moved into core (1.22), which is
    // where a tower's behaviour and a map's furniture belong — a map drawn in
    // core's own editor must not need this pack installed to get either. The
    // seams are unchanged and still this pack's to use: declaring
    // `turretPassives` replaces core's list wholesale, and a `slotObjects`
    // entry wins the role over core's own answer.
  };
};

export default code;
