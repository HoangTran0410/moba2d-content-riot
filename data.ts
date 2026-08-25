import type {
  ChampionAttack,
  ChampionEntry,
  ContentPackData,
  ItemDef,
  MonsterDef,
  SpellDisplayData,
} from '@moba2d/core/content/ContentPack';
import type { SpellCatalogId as PackSpellCatalogId } from './generated/spellCatalog';
import { spellCatalog } from './generated/spellCatalog';
import { summonersRift } from './maps/summonersRift';

/**
 * The riot pack's own identity. A literal, not computed — `manifest.id`
 * below is the canonical spelling, and this is that same string exported
 * for the handful of core files that need the well-known "first bundled
 * pack" id without reaching into `packs/` themselves: `src/content/install.ts`
 * re-exports it from `./pack` (itself re-exporting it from here), and
 * `src/game/spellRegistry.ts`'s `qualifySpellId` reads it from there — a
 * bare, unqualified spell id (a loadout saved before content became packs)
 * has always meant "the bundled pack's own", and still does.
 */
export const BUNDLED_PACK_ID = 'lol';

/** `'BasicAttack'` is core's id, not this pack's own — slot 0 of every kit below names it. */
type RosterSpellId = PackSpellCatalogId | 'BasicAttack';

/**
 * This pack's own basic-attack role taxonomy — bruiser, marksman, and the
 * rest. It used to be core's (`src/game/config/spellCatalog.ts`'s
 * `ATTACK`), duplicated into this file so the roster below could reference
 * it without a pack file reaching into core (the `pack-core-boundary` seam
 * refuses that outside the three type-only specifiers it allows). That
 * duplication was a fix-round finding: core's copy had no consumer left in
 * `src/` (only `tests/game/combat/AttackProfiles.test.ts` read it), so the
 * six numbers a match actually ships were the *unguarded* copy and the
 * *guarded* one was dead — exactly the drift `mana-spend-seam.test.ts`'s
 * own rule warns about, just for a tuning table instead of a spend path.
 * `ATTACK` now lives here, once, exported so `tests/packs/riot/attackProfiles.test.ts`
 * guards the copy a match actually plays with. A role taxonomy is the
 * roster's vocabulary, not the engine's — `DEFAULT_CHAMPION_ATTACK`
 * (`@/game/gameObject/attackableUnits/Champion`), the fallback for a
 * champion with no profile at all, is core's, and stays there; it is a
 * mechanism, not content.
 */
export const ATTACK = {
  MARKSMAN: { damage: 10, attacksPerSecond: 1.65, range: 410 },
  MAGE: { damage: 12, attacksPerSecond: 1.05, range: 385 },
  SUPPORT: { damage: 10, attacksPerSecond: 1.0, range: 385 },
  ASSASSIN: { damage: 15, attacksPerSecond: 1.25, range: 130 },
  BRUISER: { damage: 17, attacksPerSecond: 1.1, range: 130 },
  TANK: { damage: 15, attacksPerSecond: 0.95, range: 125 },
} as const;

/**
 * The roster — every champion this pack ships, as data. Moved verbatim out
 * of `src/game/config/spellCatalog.ts`'s `CHAMPION_KITS` (batch 4 task 7):
 * same 59 rows, same order, same ids, same tuning. Only the surrounding
 * scaffolding changed — this is real pack content now, not a table core
 * happened to still be holding for an adapter to read.
 */
const ROSTER: {
  name: string;
  // A plain string, not core's generated `AssetKey` union: batch 4 task 4
  // moved every champion portrait out of core's `assets/` and into this
  // pack's own `assets/` tree, so core's manifest no longer knows any
  // `'champ_*'` key.
  image: string | null;
  spells: RosterSpellId[];
  attack?: ChampionAttack;
  /** See `ChampionEntry.summonerShelf`'s own doc comment. Set on exactly one row, below. */
  summonerShelf?: boolean;
}[] = [
  // First, and a shelf of its own rather than a line on the summoner spell
  // shelf: it belongs to no champion and it is not a summoner spell, it is the
  // attack every champion already has. It is also the way back — a player who
  // swaps slot 0 out for something else and wants `A` to attack again needs to
  // find this, and hunting for it at the bottom of the Phép Bổ Trợ list would
  // make that a one-way door in practice.
  {
    name: 'Đánh Thường',
    image: 'spell_basic_attack',
    spells: ['BasicAttack'],
  },
  {
    name: 'Phép Bổ Trợ',
    image: null,
    spells: ['Flash', 'Ghost', 'Heal', 'Ignite', 'StealthWard'],
    summonerShelf: true,
  },
  {
    name: 'Yasuo',
    attack: ATTACK.BRUISER,
    image: 'champ_yasuo',

    spells: ['Yasuo_Q', 'Yasuo_W', 'Yasuo_E', 'Yasuo_R'],
  },
  {
    name: 'Shaco',
    attack: ATTACK.ASSASSIN,
    image: 'champ_shaco',

    spells: ['Shaco_Q', 'Shaco_W', 'Shaco_E', 'Shaco_R'],
  },
  {
    name: 'Ahri',
    attack: ATTACK.MAGE,
    image: 'champ_ahri',

    spells: ['Ahri_Q', 'Ahri_W', 'Ahri_E', 'Ahri_R'],
  },
  {
    name: 'Lee Sin',
    attack: ATTACK.BRUISER,
    image: 'champ_leesin',

    spells: ['LeeSin_Q', 'LeeSin_W', 'LeeSin_E', 'LeeSin_R'],
  },
  {
    name: 'Blitzcrank',
    attack: ATTACK.TANK,
    image: 'champ_blitzcrank',

    spells: ['Blitzcrank_Q', 'Blitzcrank_W', 'Blitzcrank_E', 'Blitzcrank_R'],
  },
  {
    name: 'Lux',
    attack: ATTACK.MAGE,
    image: 'champ_lux',

    spells: ['Lux_Q', 'Lux_W', 'Lux_E', 'Lux_R'],
  },
  {
    name: 'Ashe',
    attack: ATTACK.MARKSMAN,
    image: 'champ_ashe',

    spells: ['Ashe_Q', 'Ashe_W', 'Ashe_E', 'Ashe_R'],
  },
  {
    name: "Cho'Gath",
    attack: ATTACK.BRUISER,
    image: 'champ_chogath',

    spells: ['ChoGath_Q', 'ChoGath_W', 'ChoGath_E', 'ChoGath_R'],
  },
  {
    name: 'Leblanc',
    attack: ATTACK.MAGE,
    image: 'champ_leblanc',

    spells: ['Leblanc_Q', 'Leblanc_W', 'Leblanc_E', 'Leblanc_R'],
  },
  {
    name: 'Malphite',
    attack: ATTACK.TANK,
    image: 'champ_malphite',

    spells: ['Malphite_Q', 'Malphite_W', 'Malphite_E', 'Malphite_R'],
  },
  {
    name: 'Olaf',
    attack: ATTACK.BRUISER,
    image: 'champ_olaf',

    spells: ['Olaf_Q', 'Olaf_W', 'Olaf_E', 'Olaf_R'],
  },
  {
    name: 'Teemo',
    attack: ATTACK.MARKSMAN,
    image: 'champ_teemo',

    spells: ['Teemo_Q', 'Teemo_W', 'Teemo_E', 'Teemo_R'],
  },
  {
    name: 'Veigar',
    attack: ATTACK.MAGE,
    image: 'champ_veigar',

    spells: ['Veigar_Q', 'Veigar_W', 'Veigar_E', 'Veigar_R'],
  },
  {
    name: 'Zed',
    attack: ATTACK.ASSASSIN,
    image: 'champ_zed',

    spells: ['Zed_Q', 'Zed_W', 'Zed_E', 'Zed_R'],
  },
  {
    name: 'Graves',
    attack: ATTACK.MARKSMAN,
    image: 'champ_graves',

    spells: ['Graves_Q', 'Graves_W', 'Graves_E', 'Graves_R'],
  },
  {
    name: 'Anivia',
    attack: ATTACK.MAGE,
    image: 'champ_anivia',

    spells: ['Anivia_Q', 'Anivia_W', 'Anivia_E', 'Anivia_R'],
  },
  {
    name: 'Varus',
    attack: ATTACK.MARKSMAN,
    image: 'champ_varus',

    spells: ['Varus_Q', 'Varus_W', 'Varus_E', 'Varus_R'],
  },
  {
    name: 'Pantheon',
    attack: ATTACK.BRUISER,
    image: 'champ_pantheon',

    spells: ['Pantheon_Q', 'Pantheon_W', 'Pantheon_E', 'Pantheon_R'],
  },
  {
    name: 'Thresh',
    attack: ATTACK.SUPPORT,
    image: 'champ_thresh',

    spells: ['Thresh_Q', 'Thresh_W', 'Thresh_E', 'Thresh_R'],
  },
  {
    name: 'Rammus',
    attack: ATTACK.TANK,
    image: 'champ_rammus',

    spells: ['Rammus_Q', 'Rammus_W', 'Rammus_E', 'Rammus_R'],
  },
  {
    name: 'Morgana',
    attack: ATTACK.SUPPORT,
    image: 'champ_morgana',

    spells: ['Morgana_Q', 'Morgana_W', 'Morgana_E', 'Morgana_R'],
  },
  {
    name: 'Janna',
    attack: ATTACK.SUPPORT,
    image: 'champ_janna',

    spells: ['Janna_Q', 'Janna_W', 'Janna_E', 'Janna_R'],
  },
  {
    name: 'Alistar',
    attack: ATTACK.TANK,
    image: 'champ_alistar',

    spells: ['Alistar_Q', 'Alistar_W', 'Alistar_E', 'Alistar_R'],
  },
  {
    name: 'Nocturne',
    attack: ATTACK.ASSASSIN,
    image: 'champ_nocturne',

    spells: ['Nocturne_Q', 'Nocturne_W', 'Nocturne_E', 'Nocturne_R'],
  },
  {
    name: 'Twitch',
    attack: ATTACK.MARKSMAN,
    image: 'champ_twitch',

    spells: ['Twitch_Q', 'Twitch_W', 'Twitch_E', 'Twitch_R'],
  },
  {
    name: 'Amumu',
    attack: ATTACK.TANK,
    image: 'champ_amumu',

    spells: ['Amumu_Q', 'Amumu_W', 'Amumu_E', 'Amumu_R'],
  },
  {
    name: 'Warwick',
    attack: ATTACK.BRUISER,
    image: 'champ_warwick',

    spells: ['Warwick_Q', 'Warwick_W', 'Warwick_E', 'Warwick_R'],
  },
  {
    name: 'Singed',
    attack: ATTACK.BRUISER,
    image: 'champ_singed',

    spells: ['Singed_Q', 'Singed_W', 'Singed_E', 'Singed_R'],
  },
  {
    name: 'Cassiopeia',
    attack: ATTACK.MAGE,
    image: 'champ_cassiopeia',

    spells: ['Cassiopeia_Q', 'Cassiopeia_W', 'Cassiopeia_E', 'Cassiopeia_R'],
  },
  {
    name: 'Fizz',
    attack: ATTACK.ASSASSIN,
    image: 'champ_fizz',

    spells: ['Fizz_Q', 'Fizz_W', 'Fizz_E', 'Fizz_R'],
  },
  {
    name: 'Annie',
    attack: ATTACK.MAGE,
    image: 'champ_annie',

    spells: ['Annie_Q', 'Annie_W', 'Annie_E', 'Annie_R'],
  },
  {
    name: 'Garen',
    attack: ATTACK.BRUISER,
    image: 'champ_garen',

    spells: ['Garen_Q', 'Garen_W', 'Garen_E', 'Garen_R'],
  },
  {
    name: 'Jinx',
    attack: ATTACK.MARKSMAN,
    image: 'champ_jinx',

    spells: ['Jinx_Q', 'Jinx_W', 'Jinx_E', 'Jinx_R'],
  },
  {
    name: 'Nasus',
    attack: ATTACK.BRUISER,
    image: 'champ_nasus',

    spells: ['Nasus_Q', 'Nasus_W', 'Nasus_E', 'Nasus_R'],
  },
  {
    name: 'Ekko',
    attack: ATTACK.ASSASSIN,
    image: 'champ_ekko',

    spells: ['Ekko_Q', 'Ekko_W', 'Ekko_E', 'Ekko_R'],
  },
  {
    name: 'Jarvan IV',
    attack: ATTACK.BRUISER,
    image: 'champ_jarvaniv',

    spells: ['JarvanIV_Q', 'JarvanIV_W', 'JarvanIV_E', 'JarvanIV_R'],
  },
  {
    name: 'Camille',
    attack: ATTACK.ASSASSIN,
    image: 'champ_camille',

    spells: ['Camille_Q', 'Camille_W', 'Camille_E', 'Camille_R'],
  },
  {
    name: 'Darius',
    attack: ATTACK.BRUISER,
    image: 'champ_darius',

    spells: ['Darius_Q', 'Darius_W', 'Darius_E', 'Darius_R'],
  },
  {
    name: 'Renekton',
    attack: ATTACK.BRUISER,
    image: 'champ_renekton',

    spells: ['Renekton_Q', 'Renekton_W', 'Renekton_E', 'Renekton_R'],
  },
  {
    name: 'Xin Zhao',
    attack: ATTACK.BRUISER,
    image: 'champ_xinzhao',

    spells: ['XinZhao_Q', 'XinZhao_W', 'XinZhao_E', 'XinZhao_R'],
  },
  {
    name: 'Tryndamere',
    attack: ATTACK.BRUISER,
    image: 'champ_tryndamere',

    spells: ['Tryndamere_Q', 'Tryndamere_W', 'Tryndamere_E', 'Tryndamere_R'],
  },
  {
    name: 'Master Yi',
    attack: ATTACK.ASSASSIN,
    image: 'champ_masteryi',

    spells: ['MasterYi_Q', 'MasterYi_W', 'MasterYi_E', 'MasterYi_R'],
  },
  {
    name: 'Malzahar',
    attack: ATTACK.MAGE,
    image: 'champ_malzahar',

    spells: ['Malzahar_Q', 'Malzahar_W', 'Malzahar_E', 'Malzahar_R'],
  },
  {
    name: 'Ezreal',
    attack: ATTACK.MARKSMAN,
    image: 'champ_ezreal',

    spells: ['Ezreal_Q', 'Ezreal_W', 'Ezreal_E', 'Ezreal_R'],
  },
  {
    name: 'Caitlyn',
    attack: ATTACK.MARKSMAN,
    image: 'champ_caitlyn',

    spells: ['Caitlyn_Q', 'Caitlyn_W', 'Caitlyn_E', 'Caitlyn_R'],
  },
  {
    name: 'Soraka',
    attack: ATTACK.SUPPORT,
    image: 'champ_soraka',

    spells: ['Soraka_Q', 'Soraka_W', 'Soraka_E', 'Soraka_R'],
  },
  {
    name: 'Brand',
    attack: ATTACK.MAGE,
    image: 'champ_brand',

    spells: ['Brand_Q', 'Brand_W', 'Brand_E', 'Brand_R'],
  },
  {
    name: 'Katarina',
    attack: ATTACK.ASSASSIN,
    image: 'champ_katarina',

    spells: ['Katarina_Q', 'Katarina_W', 'Katarina_E', 'Katarina_R'],
  },
  {
    name: 'Vayne',
    attack: ATTACK.MARKSMAN,
    image: 'champ_vayne',

    spells: ['Vayne_Q', 'Vayne_W', 'Vayne_E', 'Vayne_R'],
  },
  {
    name: 'Riven',
    attack: ATTACK.BRUISER,
    image: 'champ_riven',

    spells: ['Riven_Q', 'Riven_W', 'Riven_E', 'Riven_R'],
  },
  {
    name: 'Sett',
    attack: ATTACK.BRUISER,
    image: 'champ_sett',

    spells: ['Sett_Q', 'Sett_W', 'Sett_E', 'Sett_R'],
  },
  {
    name: 'Jhin',
    attack: ATTACK.MARKSMAN,
    image: 'champ_jhin',

    spells: ['Jhin_Q', 'Jhin_W', 'Jhin_E', 'Jhin_R'],
  },
  {
    name: 'Nautilus',
    attack: ATTACK.TANK,
    image: 'champ_nautilus',

    spells: ['Nautilus_Q', 'Nautilus_W', 'Nautilus_E', 'Nautilus_R'],
  },
  {
    name: 'Diana',
    attack: ATTACK.ASSASSIN,
    image: 'champ_diana',

    spells: ['Diana_Q', 'Diana_W', 'Diana_E', 'Diana_R'],
  },
  {
    name: 'Vi',
    attack: ATTACK.BRUISER,
    image: 'champ_vi',

    spells: ['Vi_Q', 'Vi_W', 'Vi_E', 'Vi_R'],
  },
  {
    name: 'Syndra',
    attack: ATTACK.MAGE,
    image: 'champ_syndra',

    spells: ['Syndra_Q', 'Syndra_W', 'Syndra_E', 'Syndra_R'],
  },
  {
    name: 'Ziggs',
    attack: ATTACK.MAGE,
    image: 'champ_ziggs',

    spells: ['Ziggs_Q', 'Ziggs_W', 'Ziggs_E', 'Ziggs_R'],
  },
  {
    name: 'Irelia',
    attack: ATTACK.BRUISER,
    image: 'champ_irelia',

    spells: ['Irelia_Q', 'Irelia_W', 'Irelia_E', 'Irelia_R'],
  },
];

/**
 * Every champion this pack ships, as the registry's own `ChampionEntry`
 * shape. `id` is the champion's *name* (`'Yasuo'`, not a generated key) —
 * batch 2's own compatibility promise: a `PregameConfig.championName`
 * persisted before this pack existed already held that string, and
 * `preset.ts`'s `planLoadout` still looks a stored loadout up by name. This
 * pack changing shape must never change what that string resolves to.
 */
const championEntries = (): ChampionEntry[] => {
  const out: ChampionEntry[] = [];
  for (const kit of ROSTER) {
    // `champ_` was the old test for "a real champion rather than a shelf of
    // loose abilities"; it is a declared field here and never read as a
    // naming convention again.
    const playable =
      Boolean(kit.image?.startsWith('champ_')) && kit.spells.length === 4 && Boolean(kit.attack);
    out.push({
      id: kit.name,
      name: kit.name,
      image: kit.image,
      playable,
      attack: kit.attack,
      spells: [...kit.spells],
      recall: 'Recall',
      summonerShelf: kit.summonerShelf,
    });
  }
  return out;
};

/**
 * Every spell's display fields, as plain data — this pack's own generated
 * catalogue, reshaped into the registry's `SpellDisplayData`. Core's own
 * `BasicAttack` entry is *not* folded in here: a pack file may not import
 * `@/generated/spellCatalog` (the `pack-core-boundary` seam), so
 * `src/content/install.ts` folds it on afterward, onto the `data` this
 * module exports — see that file's own header for why the merge belongs to
 * core rather than to this pack.
 *
 * **The four `Item_*` spells are deliberately left out.** This is the
 * population a `'random'` loadout slot is drawn from and a persisted slot is
 * validated against — `PackRegistry.spellDisplayIds`, read by
 * `spellRegistry.ts`'s `allSpellIds`/`isSpellId` — so without this skip
 * "Đồng Hồ Cát Zhonya's active" could be dealt as somebody's Q, on a champion
 * who does not own the item, with a ninety-second cooldown and no way to see
 * where it came from. They still belong to the *code* half (`code.ts`'s
 * `spells`, built from `generated/spellModules.ts`), which is what makes
 * `ItemDef.passive`/`ItemDef.active` resolvable at all; core's own
 * `lol:Recall` is the existing precedent for "loadable but not displayed", and
 * `PackRegistry.spellDisplay`'s own doc comment says a declared spell with no
 * display entry is a shape rather than a defect.
 *
 * Matched on the `Item_` prefix rather than a hand-kept list of four, because
 * the failure mode of the list is a fifth item spell added a year from now
 * that nobody remembers to add to it. `tests/items.test.ts` scans this
 * module's output for the leak either way.
 */
const displayData = (): Record<string, SpellDisplayData> => {
  const out: Record<string, SpellDisplayData> = {};
  for (const [id, entry] of Object.entries(spellCatalog)) {
    if (id.startsWith('Item_')) continue;
    out[id] = {
      name: entry.name,
      description: entry.description,
      iconKey: entry.iconKey,
      coolDownMs: entry.coolDownMs,
      manaCost: entry.manaCost,
      specCoolDownMs: entry.specCoolDownMs,
    };
  }
  return out;
};

/**
 * The shop, as this pack declares it — six components and eight finished
 * items, keyed by local id exactly the way `ItemDef.id` requires.
 *
 * **None of these numbers is Riot's, and they are not meant to be.** A
 * champion in this engine has a 100-point health pool, 14 attack damage and 3
 * movement speed; a player starts on 500 gold, earns 2 a second, 20 a minion
 * and 200 a kill, so a ten-minute match is 3000–4000 gold and a full build is
 * three finished items, not six. Every value below is sized to that economy.
 * The only thing taken from Riot is the artwork and the Vietnamese name — see
 * `scripts/import-items.mjs` and `docs/items-source-manifest.json`, which
 * record every icon's source URL and hash.
 *
 * `stats` keys are core's `ITEM_STAT_KEYS` allow-list and nothing else;
 * `validate.ts` refuses the whole pack over a key that is not on it. Two of
 * them mean something a reader is likely to guess wrong, so they are worth
 * stating once here rather than in six descriptions: `attackSpeed` is
 * *attacks per second* and every item grant lands on `flatBonus`, so
 * `attackSpeed: 0.3` is +0.3 swings a second on a base of 1.1 — not +30%; and
 * `healthRegen` is applied per frame (`Stats.update`, base 0.06), so
 * `healthRegen: 0.25` is roughly four times the regeneration a champion has
 * for free.
 *
 * **A component with no passive and no active is legal and is the point.**
 * `ItemDef`'s own doc comment says so: a pack that could not express an inert
 * component could not express a build path, and a build path is what makes the
 * cheap rows above worth selling at all.
 */
const itemEntries = (): Record<string, ItemDef> => ({
  // ---- Components ------------------------------------------------------
  long_sword: {
    id: 'long_sword',
    name: 'Kiếm Dài',
    icon: 'item_long_sword',
    cost: 350,
    description: 'Tăng 6 sát thương công.',
    stats: { attackDamage: 6 },
  },
  cloth_armor: {
    id: 'cloth_armor',
    name: 'Giáp Lụa',
    icon: 'item_cloth_armor',
    cost: 300,
    description: 'Tăng 18 giáp, giảm khoảng 15% sát thương vật lý nhận vào.',
    stats: { armor: 18 },
  },
  null_magic_mantle: {
    id: 'null_magic_mantle',
    name: 'Áo Vải',
    icon: 'item_null_magic_mantle',
    cost: 350,
    description: 'Tăng 18 kháng phép, giảm khoảng 15% sát thương phép nhận vào.',
    stats: { magicResist: 18 },
  },
  ruby_crystal: {
    id: 'ruby_crystal',
    name: 'Hồng Ngọc',
    icon: 'item_ruby_crystal',
    cost: 400,
    description: 'Tăng 25 máu tối đa.',
    stats: { maxHealth: 25 },
  },
  boots: {
    id: 'boots',
    name: 'Giày',
    icon: 'item_boots',
    cost: 300,
    description: 'Tăng 0.35 tốc chạy.',
    stats: { speed: 0.35 },
  },
  recurve_bow: {
    id: 'recurve_bow',
    name: 'Cung Gỗ',
    icon: 'item_recurve_bow',
    cost: 500,
    description: 'Tăng 0.25 đòn đánh mỗi giây.',
    stats: { attackSpeed: 0.25 },
  },

  // ---- Finished items --------------------------------------------------
  berserkers_greaves: {
    id: 'berserkers_greaves',
    name: 'Giày Cuồng Nộ',
    icon: 'item_berserkers_greaves',
    cost: 900,
    description: 'Tăng 0.45 tốc chạy và 0.3 đòn đánh mỗi giây.',
    stats: { speed: 0.45, attackSpeed: 0.3 },
  },
  warmogs_armor: {
    id: 'warmogs_armor',
    name: 'Giáp Máu Warmog',
    icon: 'item_warmogs_armor',
    cost: 1200,
    // `healthRegen` is applied per *frame* by `Stats.update`, not per second —
    // base is 0.06, which is 3.6 health a second at 60fps. 0.25 was ~15/s on a
    // 100-health pool, which outheals most of the abilities in this pack.
    description: 'Tăng 70 máu tối đa và hồi máu nhanh gần gấp đôi mức cơ bản.',
    stats: { maxHealth: 70, healthRegen: 0.05 },
  },
  thornmail: {
    id: 'thornmail',
    name: 'Giáp Gai',
    icon: 'item_thornmail',
    cost: 1100,
    description: 'Tăng 45 giáp, và phản 25% sát thương nhận vào về kẻ đã gây ra nó.',
    stats: { armor: 45 },
    passive: 'Item_Thornmail',
  },
  infinity_edge: {
    id: 'infinity_edge',
    name: 'Vô Cực Kiếm',
    icon: 'item_infinity_edge',
    cost: 1300,
    description: 'Tăng 18 sát thương công, 25% tỉ lệ chí mạng và 20% sát thương chí mạng.',
    stats: { attackDamage: 18, critChance: 0.25, critDamage: 0.2 },
  },
  // The name and the icon are Data Dragon item 3140, whose Vietnamese name is
  // 'Khăn Giải Thuật' — Quicksilver Sash. The local id says Mercurial Scimitar
  // (which is item 3139, 'Đao Thủy Ngân'). The three were specified together
  // and are shipped as specified; anyone correcting one of them has to correct
  // all three, or the row goes from inconsistent to broken.
  quicksilver_sash: {
    id: 'quicksilver_sash',
    name: 'Khăn Giải Thuật',
    icon: 'item_quicksilver_sash',
    cost: 1100,
    description:
      'Tăng 25 kháng phép và 6 sát thương công. Kích hoạt: gỡ bỏ mọi hiệu ứng khống chế đang chịu.',
    stats: { magicResist: 25, attackDamage: 6 },
    active: 'Item_Quicksilver',
  },
  blade_of_the_ruined_king: {
    id: 'blade_of_the_ruined_king',
    name: 'Gươm Suy Vong',
    icon: 'item_blade_of_the_ruined_king',
    cost: 1200,
    description: 'Tăng 10 sát thương công, 0.25 đòn đánh mỗi giây và hút 12% sát thương gây ra.',
    stats: { attackDamage: 10, attackSpeed: 0.25, omnivamp: 0.12 },
  },
  zhonyas_hourglass: {
    id: 'zhonyas_hourglass',
    name: 'Đồng Hồ Cát Zhonya',
    icon: 'item_zhonyas_hourglass',
    cost: 1400,
    description:
      'Tăng 30 giáp. Kích hoạt: đóng băng bản thân 2.5 giây, không thể bị nhắm và không nhận sát thương.',
    stats: { armor: 30 },
    active: 'Item_Zhonyas',
  },
  youmuus_ghostblade: {
    id: 'youmuus_ghostblade',
    name: 'Kiếm Ma Youmuu',
    icon: 'item_youmuus_ghostblade',
    cost: 1200,
    description: 'Tăng 12 sát thương công. Kích hoạt: tăng 40% tốc chạy trong 5 giây.',
    stats: { attackDamage: 12 },
    active: 'Item_Ghostblade',
  },
});

/**
 * The jungle, as monster identities — six of them, matching Task 7's split:
 * the epic camp, the two buff camps, wolves, gromp, raptors. Where each one
 * stands is `packs/riot/maps/summonersRiftGeometry.ts`'s `NEUTRAL_SLOTS`
 * (moved there from core's own `mapPresets.ts` by batch 4 task 6), read
 * through that same module's `slots.neutral`; a `role` here and a `role`
 * there is the only thing tying a camp's identity to its place, and
 * `PackRegistry.monstersFilling` is the match.
 *
 * No `CHAMPION_KITS`/`spellCatalog` reads, so — unlike `champions`/`spellDisplay`
 * above — this needs no getter to dodge the module's own load-order cycle;
 * it is safe to build once, eagerly.
 *
 * **A camp is a composition, not N copies of one body.** `wolves.members`
 * and `raptors.members` are a Greater Wolf/Crimson Raptor plus its smaller
 * pack-mates, each with its own avatar, size and health — every number below
 * is copied from the pre-Task-7 `MonsterPreset` table (`git show
 * f2092e4:src/game/mapPresets.ts`), not retuned. `offset` is that same
 * source's per-body `camp: {x, y}` minus its group's anchor position
 * (`wolf1`'s own camp for the wolves offsets, `raptor1`'s for the raptors) —
 * see `tests/game/preset.mapSlots.test.ts`'s "recovers the original preset
 * entries" test, which checks `slot + offset === original camp` against that
 * same historical table.
 *
 * `wolves` and `raptors` each fill **two** neutral slots (Summoner's Rift
 * has a wolf pit and a raptor pit on both sides), but there is only one
 * `MonsterDef` of each — its `members`/`offset` layout is reused at both
 * slots. That is a real, disclosed loss of fidelity: the original data
 * placed the second pit's small bodies at slightly different offsets from
 * its own anchor than the first pit's. It is not a loss of *tuning* — the
 * second pit's bodies had byte-identical avatar/speed/size/attackRange/
 * reviveTime/health to the first's in the original table (verified, not
 * assumed) — only of the incidental few-dozen-pixel arrangement within the
 * pit, which one shared `MonsterDef` cannot carry two different versions of.
 */
const monsterEntries = (): Record<string, MonsterDef> => ({
  baron: {
    id: 'baron',
    name: 'Baron',
    fills: ['baron'],
    members: [
      {
        name: 'Baron',
        avatar: 'monster_Baron_Nashor',
        speed: 0,
        size: 100,
        attackRange: 400,
        reviveTime: 3000,
        health: 1000,
        // Rooted with a long reach. The bite is small because it is the one
        // part of the fight nobody can dodge — the rest of Baron's kit lives
        // in `packs/riot/monsters/Baron.ts`'s `makeBaronAbilities` (wired in
        // `./code.ts`, this pack's code half, and merged onto the preset by
        // `preset.ts`'s `monsterBodyPreset`, which this data-only definition
        // cannot carry) and is all avoidable.
        damage: 12,
        attackInterval: 2000,
        aggroRange: 480,
        offset: { x: 0, y: 0 },
      },
    ],
  },
  blue: {
    id: 'blue',
    name: 'Blue',
    fills: ['blue'],
    members: [
      {
        name: 'Blue',
        avatar: 'monster_Blue_Sentinel',
        speed: 2,
        size: 80,
        attackRange: 50,
        reviveTime: 3000,
        health: 300,
        offset: { x: 0, y: 0 },
      },
    ],
  },
  red: {
    id: 'red',
    name: 'Red',
    fills: ['red'],
    members: [
      {
        name: 'Red',
        avatar: 'monster_Red_Brambleback',
        speed: 2,
        size: 80,
        attackRange: 50,
        reviveTime: 3000,
        health: 300,
        offset: { x: 0, y: 0 },
      },
    ],
  },
  // Anchor: wolf1 at (1685, 3562). wolf1_a (1602, 3511) -> offset (-83, -51).
  // wolf1_b (1725, 3659) -> offset (40, 97). Total health 300 + 100 + 100 = 500.
  wolves: {
    id: 'wolves',
    name: 'Wolves',
    fills: ['wolves'],
    members: [
      {
        name: 'Greater Wolf',
        avatar: 'monster_Greater_Murk_Wolf',
        speed: 2,
        size: 70,
        attackRange: 50,
        reviveTime: 3000,
        health: 300,
        offset: { x: 0, y: 0 },
      },
      {
        name: 'Wolf',
        avatar: 'monster_Murk_Wolf',
        speed: 2.5,
        size: 40,
        attackRange: 50,
        reviveTime: 3000,
        health: 100,
        offset: { x: -83, y: -51 },
      },
      {
        name: 'Wolf',
        avatar: 'monster_Murk_Wolf',
        speed: 2.5,
        size: 40,
        attackRange: 50,
        reviveTime: 3000,
        health: 100,
        offset: { x: 40, y: 97 },
      },
    ],
  },
  gromp: {
    id: 'gromp',
    name: 'Gromp',
    fills: ['gromp'],
    members: [
      {
        name: 'Gromp',
        avatar: 'monster_Gromp',
        speed: 2,
        size: 70,
        attackRange: 150,
        reviveTime: 3000,
        health: 300,
        offset: { x: 0, y: 0 },
      },
    ],
  },
  // Anchor: raptor1 at (2954, 4110). raptor1_a (3045, 4026) -> offset (91, -84).
  // raptor1_b (3149, 4095) -> offset (195, -15). raptor1_c (3060, 4169) ->
  // offset (106, 59). Total health 300 + 50 + 50 + 50 = 450.
  raptors: {
    id: 'raptors',
    name: 'Raptors',
    fills: ['raptors'],
    members: [
      {
        name: 'Crimson Raptor',
        avatar: 'monster_Crimson_Raptor',
        speed: 2,
        size: 70,
        attackRange: 150,
        reviveTime: 3000,
        health: 300,
        offset: { x: 0, y: 0 },
      },
      {
        name: 'Raptor',
        avatar: 'monster_Raptor',
        speed: 2,
        size: 40,
        attackRange: 150,
        reviveTime: 3000,
        health: 50,
        offset: { x: 91, y: -84 },
      },
      {
        name: 'Raptor',
        avatar: 'monster_Raptor',
        speed: 2,
        size: 40,
        attackRange: 150,
        reviveTime: 3000,
        health: 50,
        offset: { x: 195, y: -15 },
      },
      {
        name: 'Raptor',
        avatar: 'monster_Raptor',
        speed: 2,
        size: 40,
        attackRange: 150,
        reviveTime: 3000,
        health: 50,
        offset: { x: 106, y: 59 },
      },
    ],
  },
});

/**
 * This pack's data half: everything a picker needs — a roster, a spell's
 * tooltip, a map to offer — without ever building a `ContentApi`. Plain
 * fields, not getters: the old getters in `bundledPack.ts` existed to dodge
 * a load-order cycle through `spellCatalog.ts` (`CHAMPION_KITS` lived
 * there, and this module read it back out mid-cycle); `ROSTER` above is
 * this module's own, so there is nothing left to defer past. Matches
 * `packs/reference/pack.ts`'s own `data`, which never needed getters either.
 */
export const data: ContentPackData = {
  /**
   * `coreRange` is `>=1.3.0` because of `items` below, and the floor is
   * load-bearing rather than documentation. `ContentPackData.items` existed as
   * a *field* before core read it, so a pack declaring a shop against an older
   * core validates cleanly, installs cleanly, and has every one of its
   * fourteen items silently ignored — no error, no shop, nothing to look at.
   * `satisfiesCoreRange` parses `*` and `>=X.Y.Z` and nothing else, which is
   * also why this is no longer the unparseable `'^1'` it used to be.
   */
  manifest: {
    id: BUNDLED_PACK_ID,
    version: '1.0.0',
    coreRange: '>=1.3.0',
    assets: BUNDLED_PACK_ID,
  },
  spellDisplay: displayData(),
  champions: championEntries(),
  items: itemEntries(),
  monsters: monsterEntries(),
  maps: [summonersRift],
};
