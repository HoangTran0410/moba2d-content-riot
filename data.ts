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
import { twistedTreeline } from './maps/twistedTreeline';

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
/**
 * `boltUnitsPerSecond` is the basic-attack missile speed, ranged roles only —
 * melee swings carry none. The per-champion overrides on the roster below are
 * **the live wiki's own missile speeds at half scale, rounded to 25** (this
 * canvas halves the source game's distances and walk speeds the same way):
 * Graves' 3800 becomes 1900, Caitlyn's 2500 becomes 1250, Varus' 2000 becomes
 * 1000, Soraka's 1000 becomes 500. The role numbers here are only the
 * fallback for a champion the wiki lists no missile for (a form-swapping gun,
 * an attack the source game applies instantly) and for future rows nobody has
 * looked up yet. `tests/attackProfiles.test.ts` pins the mapping.
 */
export const ATTACK = {
  MARKSMAN: { damage: 10, attacksPerSecond: 1.65, range: 410, boltUnitsPerSecond: 1200 },
  MAGE: { damage: 12, attacksPerSecond: 1.05, range: 385, boltUnitsPerSecond: 800 },
  SUPPORT: { damage: 10, attacksPerSecond: 1.0, range: 385, boltUnitsPerSecond: 800 },
  ASSASSIN: { damage: 15, attacksPerSecond: 1.25, range: 130 },
  BRUISER: { damage: 17, attacksPerSecond: 1.1, range: 130 },
  TANK: { damage: 15, attacksPerSecond: 0.95, range: 125 },
} as const;

/** Every role in this pack's taxonomy, in the order a picker should show them. */
export type Role = keyof typeof ATTACK;

/**
 * The other half of a role: how much punishment it takes.
 *
 * The twin of `ATTACK`, and it did not exist for most of this project's life —
 * so every champion above, from the tank to the marksman, was **100 health
 * with no resistances**, which is less health than a minion's 140. A bruiser
 * and a marksman were the same body, and the only thing that made a champion
 * feel different in a fight was its kit.
 *
 * That was survivable while nothing could be bought. It stopped being when the
 * shop grew: a full attack build here reaches about **298 damage a second**
 * against a pool core's own comment says was sized for roughly 15, and the
 * best tank build in this shop died to one marksman in 2.5 seconds.
 *
 * ## Why the resistances carry this and the health pool barely moves
 *
 * Health is one number and armour is a multiplier over it, and they are not
 * interchangeable for the 39 abilities in this pack that restore or shield a
 * **flat amount**. A 40-point shield behind 100 armour is worth 80 effective
 * points — the same multiplier the pool itself gets, so every one of those 39
 * abilities keeps its worth exactly. Raising the pool to 260 instead would
 * leave that shield worth 40 against a body two and a half times bigger, and
 * nothing in core could compensate; the fix would be 39 edits.
 *
 * Resistances also cannot run away. `100 / (100 + r)` is asymptotic, so no
 * amount of armour is ever immunity — 300 armour is four times effective
 * health and 600 is seven, never infinite. A health pool is linear and has no
 * such brake.
 *
 * ## The numbers
 *
 * Tuned so a full tank build survives a full marksman build for about four to
 * five seconds rather than two and a half — long enough to open a fight, eat a
 * rotation and get out, while two attackers still bring it down in about two.
 * `tests/roleProfiles.test.ts` holds that target.
 */
export const DEFENCE = {
  MARKSMAN: { health: 125, healthRegen: 0.06, armor: 15, magicResist: 15 },
  MAGE: { health: 135, healthRegen: 0.06, armor: 15, magicResist: 22 },
  SUPPORT: { health: 150, healthRegen: 0.07, armor: 28, magicResist: 30 },
  ASSASSIN: { health: 145, healthRegen: 0.06, armor: 22, magicResist: 18 },
  BRUISER: { health: 190, healthRegen: 0.08, armor: 40, magicResist: 28 },
  TANK: { health: 220, healthRegen: 0.09, armor: 55, magicResist: 45 },
} as const;

/** What a player sees when picking a role for a hand-built kit. */
export const ROLE_NAME: Record<Role, string> = {
  MARKSMAN: 'Xạ Thủ',
  MAGE: 'Pháp Sư',
  SUPPORT: 'Hỗ Trợ',
  ASSASSIN: 'Sát Thủ',
  BRUISER: 'Đấu Sĩ',
  TANK: 'Đỡ Đòn',
};

/**
 * Which role a roster row picked, read back off the `ATTACK` numbers it copied.
 *
 * Derived rather than declared as a `role:` field on all 59 rows, and that is
 * the point rather than a shortcut: a row already names its role by taking one
 * of exactly six profiles, so reading the second half back from the same
 * choice makes an attack profile and a durability profile **impossible to
 * disagree**. A row that said `attack: ATTACK.TANK, defence: DEFENCE.MAGE`
 * would type-check and ship.
 *
 * Matched on `damage`/`attacksPerSecond`/`range` rather than on object
 * identity, because a third of the roster spreads its role and overrides one
 * field — `{ ...ATTACK.MAGE, boltUnitsPerSecond: 875 }`, the live wiki's own
 * missile speeds. Identity missed every one of those and left them bodiless;
 * `roleProfiles.test.ts` caught it on the first run. Those three fields are
 * what a role *is*; the bolt speed is a per-champion flourish on top.
 */
const roleShapes = (Object.keys(ATTACK) as Role[]).map(role => ({ role, shape: ATTACK[role] }));

export const roleOfAttack = (attack: unknown): Role | undefined => {
  const profile = attack as { damage?: number; attacksPerSecond?: number; range?: number };
  if (!profile) return undefined;
  return roleShapes.find(
    ({ shape }) =>
      shape.damage === profile.damage &&
      shape.attacksPerSecond === profile.attacksPerSecond &&
      shape.range === profile.range
  )?.role;
};

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
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 875 },
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
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 800 },
    image: 'champ_lux',

    spells: ['Lux_Q', 'Lux_W', 'Lux_E', 'Lux_R'],
  },
  {
    name: 'Ashe',
    attack: { ...ATTACK.MARKSMAN, boltUnitsPerSecond: 1250 },
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
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 850 },
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
    attack: { ...ATTACK.MARKSMAN, boltUnitsPerSecond: 750 },
    image: 'champ_teemo',

    spells: ['Teemo_Q', 'Teemo_W', 'Teemo_E', 'Teemo_R'],
  },
  {
    name: 'Veigar',
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 750 },
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
    attack: { ...ATTACK.MARKSMAN, boltUnitsPerSecond: 1900 },
    image: 'champ_graves',

    spells: ['Graves_Q', 'Graves_W', 'Graves_E', 'Graves_R'],
  },
  {
    name: 'Anivia',
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 800 },
    image: 'champ_anivia',

    spells: ['Anivia_Q', 'Anivia_W', 'Anivia_E', 'Anivia_R'],
  },
  {
    name: 'Varus',
    attack: { ...ATTACK.MARKSMAN, boltUnitsPerSecond: 1000 },
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
    // Role default: the wiki lists 0 — the source game applies his swing
    // instantly, which this engine's bolt cannot be, so the role's own lob
    // stands in.
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
    attack: { ...ATTACK.SUPPORT, boltUnitsPerSecond: 800 },
    image: 'champ_morgana',

    spells: ['Morgana_Q', 'Morgana_W', 'Morgana_E', 'Morgana_R'],
  },
  {
    name: 'Janna',
    attack: { ...ATTACK.SUPPORT, boltUnitsPerSecond: 900 },
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
    attack: { ...ATTACK.MARKSMAN, boltUnitsPerSecond: 1250 },
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
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 750 },
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
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 750 },
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
    // Role default: the wiki lists no missile speed for a gun that swaps
    // forms mid-fight (N/A) — see the ATTACK table's own comment.
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
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 1000 },
    image: 'champ_malzahar',

    spells: ['Malzahar_Q', 'Malzahar_W', 'Malzahar_E', 'Malzahar_R'],
  },
  {
    name: 'Ezreal',
    attack: { ...ATTACK.MARKSMAN, boltUnitsPerSecond: 1000 },
    image: 'champ_ezreal',

    spells: ['Ezreal_Q', 'Ezreal_W', 'Ezreal_E', 'Ezreal_R'],
  },
  {
    name: 'Caitlyn',
    attack: { ...ATTACK.MARKSMAN, boltUnitsPerSecond: 1250 },
    image: 'champ_caitlyn',

    spells: ['Caitlyn_Q', 'Caitlyn_W', 'Caitlyn_E', 'Caitlyn_R'],
  },
  {
    name: 'Soraka',
    attack: { ...ATTACK.SUPPORT, boltUnitsPerSecond: 500 },
    image: 'champ_soraka',

    spells: ['Soraka_Q', 'Soraka_W', 'Soraka_E', 'Soraka_R'],
  },
  {
    name: 'Brand',
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 1000 },
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
    attack: { ...ATTACK.MARKSMAN, boltUnitsPerSecond: 1000 },
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
    attack: { ...ATTACK.MARKSMAN, boltUnitsPerSecond: 1300 },
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
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 900 },
    image: 'champ_syndra',

    spells: ['Syndra_Q', 'Syndra_W', 'Syndra_E', 'Syndra_R'],
  },
  {
    name: 'Ziggs',
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 750 },
    image: 'champ_ziggs',

    spells: ['Ziggs_Q', 'Ziggs_W', 'Ziggs_E', 'Ziggs_R'],
  },
  {
    name: 'Irelia',
    attack: ATTACK.BRUISER,
    image: 'champ_irelia',

    spells: ['Irelia_Q', 'Irelia_W', 'Irelia_E', 'Irelia_R'],
  },
  {
    name: 'Shen',
    // Melee, `rangetype: 'Melee'` and `range: 125` in his own imported record
    // (`docs/abilities/shen/champion.json`), `herotype: 'Tank'` — the archetype
    // reads straight off the record rather than off anyone's impression.
    attack: ATTACK.TANK,
    image: 'champ_shen',

    spells: ['Shen_Q', 'Shen_W', 'Shen_E', 'Shen_R'],
  },
  {
    name: 'Lissandra',
    // The wiki lists 2200; halved and rounded to 25 like every other override
    // on this table — see the ATTACK block's own comment.
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 1100 },
    image: 'champ_lissandra',

    spells: ['Lissandra_Q', 'Lissandra_W', 'Lissandra_E', 'Lissandra_R'],
  },
  {
    name: 'Pyke',
    // `rangetype: 'Melee'`, `range: 150`, `alttype: 'Assassin'`.
    attack: ATTACK.ASSASSIN,
    image: 'champ_pyke',

    spells: ['Pyke_Q', 'Pyke_W', 'Pyke_E', 'Pyke_R'],
  },
  {
    name: 'Orianna',
    // The wiki lists 1500, halved to 750.
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 750 },
    image: 'champ_orianna',

    spells: ['Orianna_Q', 'Orianna_W', 'Orianna_E', 'Orianna_R'],
  },
  {
    name: 'Twisted Fate',
    // `herotype: 'Mage'` with `alttype: 'Marksman'`, and MAGE is the honest
    // read of the half this kit ships: his damage is the cards, not the swing.
    // Missile speed 1500 on the wiki, halved to 750.
    attack: { ...ATTACK.MAGE, boltUnitsPerSecond: 750 },
    image: 'champ_twistedfate',

    spells: ['TwistedFate_Q', 'TwistedFate_W', 'TwistedFate_E', 'TwistedFate_R'],
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
    // Derived from the very object `attack` points at, so the two halves of a
    // role cannot drift apart on a row — see `ROLE_OF_ATTACK`.
    const role = kit.attack ? roleOfAttack(kit.attack) : undefined;
    out.push({
      id: kit.name,
      name: kit.name,
      image: kit.image,
      playable,
      attack: kit.attack,
      ...(role ? { defence: DEFENCE[role] } : {}),
      spells: [...kit.spells],
      recall: 'Recall',
      summonerShelf: kit.summonerShelf,
    });
  }
  return out;
};

/**
 * This pack's role taxonomy, published for the loadout screen.
 *
 * A player who assembles a kit by hand — Q from one champion, R from another —
 * has no champion to inherit a body from, and core cannot invent one: it does
 * not know what a "tank" is and deliberately never will, because a taxonomy is
 * the roster's vocabulary and not the engine's (see `ATTACK`'s own note on why
 * that table moved out of core). So the pack hands the picker its six roles as
 * data, exactly the way it hands over its champions and its items, and core
 * stores nothing but whichever id came back.
 *
 * Order matters and is the order above: front line first is not how a picker
 * should read, so it runs marksman to tank, squishy to solid.
 */
const archetypeEntries = () =>
  (Object.keys(ATTACK) as Role[]).map(role => ({
    id: role.toLowerCase(),
    name: ROLE_NAME[role],
    attack: ATTACK[role],
    defence: DEFENCE[role],
  }));

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
 *
 * ## The recipes
 *
 * `buildsFrom` names components by local id, and `cost` stays the **total** —
 * what the item is worth from an empty bag. What a player pays when the parts
 * are already held is `cost` minus what those parts cost, worked out by core's
 * `ItemShop.priceFor`, so no combine cost is written down anywhere and none
 * can drift from the price beside it.
 *
 * Two rules core cannot check, both enforced by `tests/items.test.ts`:
 *
 *   - **A finished item is never a downgrade on anything its parts grant.**
 *     Combining swaps the parts' stats for the finished item's, so granting
 *     less of something the parts granted charges gold to get worse. Zhonya's
 *     is why the rule is written down: it grants 30 armour and two Giáp Lụa
 *     grant 36, so the obvious two-component recipe would have cost 800 gold
 *     to lose six armour. It builds from one instead, and its combine cost
 *     carries the rest — the item is bought for the active, not the stats.
 *   - **Every component builds into something.** A component nothing uses is a
 *     stat stick a player buys once and can never upgrade, and the shop gives
 *     them no way to find that out before they spend.
 *
 * The shapes are deliberately varied — one part, two, two of the same, three
 * of the same — because the shop panel draws recipes and the engine matches
 * duplicate parts against separate held copies, and neither is exercised by a
 * catalogue where every recipe looks the same.
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
    cost: 400,
    description: 'Tăng 22 kháng phép, giảm khoảng 18% sát thương phép nhận vào.',
    stats: { magicResist: 22 },
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
  sheen: {
    id: 'sheen',
    name: 'Thủy Kiếm',
    icon: 'item_sheen',
    cost: 450,
    description:
      'Tăng 15 năng lượng tối đa. Nội tại: sau khi dùng chiêu, đòn đánh kế tiếp gây thêm 50% công cơ bản.',
    stats: { maxMana: 15 },
    passive: 'Item_Sheen',
  },
  tiamat: {
    id: 'tiamat',
    name: 'Rìu Tiamat',
    icon: 'item_tiamat',
    cost: 550,
    description:
      'Tăng 6 sát thương công. Nội tại: đòn đánh gây thêm 40% công lên các kẻ địch khác quanh mục tiêu.',
    stats: { attackDamage: 6 },
    passive: 'Item_Tiamat',
  },

  // ---- Finished items --------------------------------------------------
  berserkers_greaves: {
    id: 'berserkers_greaves',
    name: 'Giày Cuồng Nộ',
    icon: 'item_berserkers_greaves',
    cost: 900,
    buildsFrom: ['boots', 'recurve_bow'],
    description: 'Tăng 0.45 tốc chạy và 0.3 đòn đánh mỗi giây.',
    stats: { speed: 0.45, attackSpeed: 0.3 },
  },
  warmogs_armor: {
    id: 'warmogs_armor',
    name: 'Giáp Máu Warmog',
    icon: 'item_warmogs_armor',
    cost: 1200,
    buildsFrom: ['ruby_crystal', 'ruby_crystal'],
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
    buildsFrom: ['cloth_armor', 'cloth_armor'],
    description: 'Tăng 45 giáp, và phản 25% sát thương nhận vào về kẻ đã gây ra nó.',
    stats: { armor: 45 },
    passive: 'Item_Thornmail',
  },
  infinity_edge: {
    id: 'infinity_edge',
    name: 'Vô Cực Kiếm',
    icon: 'item_infinity_edge',
    cost: 1300,
    buildsFrom: ['long_sword', 'long_sword', 'long_sword'],
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
    cost: 1200,
    buildsFrom: ['null_magic_mantle', 'long_sword'],
    description:
      'Tăng 40 kháng phép và 6 sát thương công. Kích hoạt: gỡ bỏ mọi hiệu ứng khống chế đang chịu.',
    stats: { magicResist: 40, attackDamage: 6 },
    active: 'Item_Quicksilver',
  },
  blade_of_the_ruined_king: {
    id: 'blade_of_the_ruined_king',
    name: 'Gươm Suy Vong',
    icon: 'item_blade_of_the_ruined_king',
    cost: 1200,
    buildsFrom: ['recurve_bow', 'long_sword'],
    description:
      'Tăng 10 sát thương công, 0.25 đòn đánh mỗi giây và hút 12% sát thương gây ra. ' +
      'Nội tại: đòn đánh gây thêm 5% máu hiện tại của mục tiêu.',
    stats: { attackDamage: 10, attackSpeed: 0.25, omnivamp: 0.12 },
    passive: 'Item_RuinedKing',
  },
  zhonyas_hourglass: {
    id: 'zhonyas_hourglass',
    name: 'Đồng Hồ Cát Zhonya',
    icon: 'item_zhonyas_hourglass',
    cost: 1500,
    buildsFrom: ['cloth_armor'],
    description:
      'Tăng 30 giáp và 150% sát thương chiêu thức. Kích hoạt: đóng băng bản thân 2.5 giây, ' +
      'không thể bị nhắm và không nhận sát thương.',
    stats: { armor: 30, abilityPower: 1.5 },
    active: 'Item_Zhonyas',
  },
  youmuus_ghostblade: {
    id: 'youmuus_ghostblade',
    name: 'Kiếm Ma Youmuu',
    icon: 'item_youmuus_ghostblade',
    cost: 1200,
    buildsFrom: ['long_sword', 'long_sword'],
    description: 'Tăng 12 sát thương công. Kích hoạt: tăng 40% tốc chạy trong 5 giây.',
    stats: { attackDamage: 12 },
    active: 'Item_Ghostblade',
  },

  // ---- The on-hit shelf ------------------------------------------------
  // Every passive below rides core 1.5's `Buff.onHit` pipeline (see
  // `manifest.coreRange`); each spell file carries its own numbers as
  // exported constants, and the description here repeats them because the
  // shop prints this line, not the spell's.
  guinsoos_rageblade: {
    id: 'guinsoos_rageblade',
    name: 'Cuồng Đao Guinsoo',
    icon: 'item_guinsoos_rageblade',
    cost: 1400,
    buildsFrom: ['recurve_bow', 'long_sword'],
    description:
      'Tăng 8 sát thương công và 0.35 đòn đánh mỗi giây. Nội tại: mỗi đòn đánh tăng thêm tốc đánh, ' +
      'cộng dồn 6 lần; khi tích đủ, mỗi đòn thứ 3 kích hoạt các hiệu ứng đòn đánh 2 lần.',
    stats: { attackDamage: 8, attackSpeed: 0.35 },
    passive: 'Item_Guinsoo',
  },
  wits_end: {
    id: 'wits_end',
    name: 'Đao Tím',
    icon: 'item_wits_end',
    cost: 1450,
    buildsFrom: ['recurve_bow', 'null_magic_mantle'],
    description:
      'Tăng 0.3 đòn đánh mỗi giây, 32 kháng phép và 100% sát thương chiêu thức. ' +
      'Nội tại: đòn đánh gây thêm 4 sát thương phép và tăng tốc chạy trong chốc lát.',
    stats: { attackSpeed: 0.3, magicResist: 32, abilityPower: 1 },
    passive: 'Item_WitsEnd',
  },
  kraken_slayer: {
    id: 'kraken_slayer',
    name: 'Móc Diệt Thủy Quái',
    icon: 'item_kraken_slayer',
    cost: 1500,
    buildsFrom: ['recurve_bow', 'long_sword', 'long_sword'],
    description:
      'Tăng 14 sát thương công và 0.3 đòn đánh mỗi giây. Nội tại: mỗi đòn thứ 3 liên tiếp lên ' +
      'cùng một mục tiêu gây thêm 12 sát thương vật lý.',
    stats: { attackDamage: 14, attackSpeed: 0.3 },
    passive: 'Item_Kraken',
  },
  nashors_tooth: {
    id: 'nashors_tooth',
    name: 'Nanh Nashor',
    icon: 'item_nashors_tooth',
    cost: 1450,
    buildsFrom: ['recurve_bow'],
    description:
      'Tăng 0.4 đòn đánh mỗi giây và 140% sát thương chiêu thức. ' +
      'Nội tại: đòn đánh gây thêm 7 sát thương phép.',
    stats: { attackSpeed: 0.4, abilityPower: 1.4 },
    passive: 'Item_Nashor',
  },
  trinity_force: {
    id: 'trinity_force',
    name: 'Tam Hợp Kiếm',
    icon: 'item_trinity_force',
    cost: 1700,
    buildsFrom: ['sheen', 'long_sword', 'recurve_bow'],
    description:
      'Tăng 10 sát thương công, 0.3 đòn đánh mỗi giây, 20 năng lượng và 0.15 tốc chạy. ' +
      'Nội tại: sau khi dùng chiêu, đòn đánh kế tiếp gây thêm 100% công cơ bản.',
    stats: { attackDamage: 10, attackSpeed: 0.3, maxMana: 20, speed: 0.15 },
    passive: 'Item_TrinityForce',
  },
  divine_sunderer: {
    id: 'divine_sunderer',
    name: 'Búa Rìu Sát Thần',
    icon: 'item_divine_sunderer',
    cost: 1500,
    buildsFrom: ['sheen', 'ruby_crystal'],
    description:
      'Tăng 35 máu, 15 năng lượng và 8 sát thương công. Nội tại: sau khi dùng chiêu, đòn đánh ' +
      'kế tiếp gây thêm 6% máu tối đa của mục tiêu và hồi lại 65% lượng đó.',
    stats: { maxHealth: 35, maxMana: 15, attackDamage: 8 },
    passive: 'Item_DivineSunderer',
  },
  essence_reaver: {
    id: 'essence_reaver',
    name: 'Lưỡi Hái Linh Hồn',
    icon: 'item_essence_reaver',
    cost: 1400,
    buildsFrom: ['sheen', 'long_sword'],
    description:
      'Tăng 12 sát thương công, 25 năng lượng và 15% tỉ lệ chí mạng. Nội tại: sau khi dùng chiêu, ' +
      'đòn đánh kế tiếp gây thêm 70% công cơ bản và hồi 15% năng lượng tối đa.',
    stats: { attackDamage: 12, maxMana: 25, critChance: 0.15 },
    passive: 'Item_EssenceReaver',
  },
  lich_bane: {
    id: 'lich_bane',
    name: 'Kiếm Tai Ương',
    icon: 'item_lich_bane',
    cost: 1500,
    buildsFrom: ['sheen', 'boots'],
    description:
      'Tăng 0.4 tốc chạy, 20 năng lượng và 160% sát thương chiêu thức. Nội tại: sau khi dùng chiêu, ' +
      'đòn đánh kế tiếp gây thêm 18 sát thương phép.',
    stats: { speed: 0.4, maxMana: 20, abilityPower: 1.6 },
    passive: 'Item_LichBane',
  },
  ravenous_hydra: {
    id: 'ravenous_hydra',
    name: 'Rìu Mãng Xà',
    icon: 'item_ravenous_hydra',
    cost: 1400,
    buildsFrom: ['tiamat', 'long_sword'],
    description:
      'Tăng 14 sát thương công và hút 10% sát thương gây ra. Nội tại: đòn đánh gây thêm 60% công ' +
      'lên các kẻ địch khác quanh mục tiêu.',
    stats: { attackDamage: 14, omnivamp: 0.1 },
    passive: 'Item_RavenousHydra',
  },
  titanic_hydra: {
    id: 'titanic_hydra',
    name: 'Rìu Đại Mãng Xà',
    icon: 'item_titanic_hydra',
    cost: 1500,
    buildsFrom: ['tiamat', 'ruby_crystal'],
    description:
      'Tăng 8 sát thương công và 40 máu tối đa. Nội tại: đòn đánh gây thêm 3 cộng 3% máu tối đa ' +
      'của bạn lên các kẻ địch khác quanh mục tiêu.',
    stats: { attackDamage: 8, maxHealth: 40 },
    passive: 'Item_TitanicHydra',
  },
  runaans_hurricane: {
    id: 'runaans_hurricane',
    name: 'Cuồng Cung Runaan',
    icon: 'item_runaans_hurricane',
    cost: 1400,
    buildsFrom: ['recurve_bow', 'recurve_bow'],
    description:
      'Tăng 0.55 đòn đánh mỗi giây. Nội tại (đánh xa): mỗi đòn đánh bắn thêm 2 tia phụ vào các ' +
      'kẻ địch khác gần nhất, gây 45% công và áp dụng hiệu ứng đòn đánh của bạn.',
    stats: { attackSpeed: 0.55 },
    passive: 'Item_Runaan',
  },
  dusk_and_dawn: {
    id: 'dusk_and_dawn',
    name: 'Bình Minh & Hoàng Hôn',
    icon: 'item_dusk_and_dawn',
    cost: 1700,
    buildsFrom: ['ruby_crystal', 'ruby_crystal'],
    description:
      'Tăng 60 máu tối đa và 6 sát thương công. Nội tại: các hiệu ứng đòn đánh của bạn kích hoạt ' +
      '2 lần mỗi đòn đánh.',
    stats: { maxHealth: 60, attackDamage: 6 },
    passive: 'Item_DuskAndDawn',
  },

  // ---- Meters and team buttons -----------------------------------------
  // Two shapes this shop did not have. A **meter** charges off something the
  // player is doing anyway (swinging, walking) and spends the whole of it on
  // one swing — different from the spellblade family's window and from Móc
  // Diệt Thủy Quái's count of three, because the player can watch it fill and
  // decide when to cash it. A **team button** is an active that does something
  // for somebody else: every active shipped before these three fires at
  // whoever pressed it and cannot miss.
  statikk_shiv: {
    id: 'statikk_shiv',
    name: 'Móc Sét Statikk',
    icon: 'item_statikk_shiv',
    cost: 1300,
    buildsFrom: ['recurve_bow', 'long_sword'],
    description:
      'Tăng 10 sát thương công và 0.35 đòn đánh mỗi giây. Nội tại: mỗi đòn đánh tích điện; ' +
      'khi tích đầy, đòn kế tiếp phóng tia sét gây 16 sát thương phép lên mục tiêu và lan ' +
      'sang 3 kẻ địch gần đó.',
    stats: { attackDamage: 10, attackSpeed: 0.35 },
    passive: 'Item_StatikkShiv',
  },
  dead_mans_plate: {
    id: 'dead_mans_plate',
    name: 'Giáp Người Chết',
    icon: 'item_dead_mans_plate',
    cost: 1200,
    buildsFrom: ['cloth_armor', 'ruby_crystal'],
    description:
      'Tăng 30 giáp, 50 máu tối đa và 0.2 tốc chạy. Nội tại: di chuyển tích lực, tối đa tăng ' +
      'thêm 30% tốc chạy; đòn đánh kế tiếp xả toàn bộ lực, gây tới 20 sát thương vật lý và ' +
      'làm chậm 50% khi tích đầy.',
    stats: { armor: 30, maxHealth: 50, speed: 0.2 },
    passive: 'Item_DeadMansPlate',
  },
  locket_of_the_iron_solari: {
    id: 'locket_of_the_iron_solari',
    name: 'Vòng Sắt Mặt Trời',
    icon: 'item_locket_of_the_iron_solari',
    cost: 1300,
    buildsFrom: ['cloth_armor', 'null_magic_mantle'],
    description:
      'Tăng 25 giáp, 25 kháng phép và 40 máu tối đa. Kích hoạt: tạo khiên 30 cho bản thân và ' +
      'các đồng minh xung quanh trong 2.5 giây.',
    stats: { armor: 25, magicResist: 40, maxHealth: 40 },
    active: 'Item_Locket',
  },
  shurelyas_battlesong: {
    id: 'shurelyas_battlesong',
    name: 'Khúc Ca Shurelya',
    icon: 'item_shurelyas_battlesong',
    cost: 1400,
    buildsFrom: ['boots', 'ruby_crystal'],
    description:
      'Tăng 0.45 tốc chạy, 40 máu tối đa, 30 năng lượng, 100% sát thương chiêu thức và giảm 15% ' +
      'thời gian hồi chiêu. Kích hoạt: tăng 35% tốc chạy cho bản thân và các đồng minh xung ' +
      'quanh trong 3 giây.',
    stats: {
      speed: 0.45,
      maxHealth: 40,
      maxMana: 30,
      abilityPower: 1,
      cooldownReduction: 0.15,
    },
    active: 'Item_Shurelya',
  },
  everfrost: {
    id: 'everfrost',
    name: 'Vĩnh Sương',
    icon: 'item_everfrost',
    cost: 1500,
    buildsFrom: ['ruby_crystal', 'null_magic_mantle'],
    description:
      'Tăng 45 máu tối đa, 35 kháng phép, 40 năng lượng, 140% sát thương chiêu thức và giảm 10% ' +
      'thời gian hồi chiêu. Kích hoạt: bắn ra một luồng băng gây 30 sát thương phép và trói ' +
      '1.2 giây mọi kẻ địch trúng đòn.',
    stats: {
      maxHealth: 45,
      magicResist: 35,
      maxMana: 40,
      abilityPower: 1.4,
      cooldownReduction: 0.1,
    },
    active: 'Item_Everfrost',
  },
});

/**
 * The jungle, as monster identities — six of them, matching Task 7's split:
 * the epic camp, the two buff camps, wolves, gromp, raptors. Where each one
 * stands is `maps/summonersRift_map.json`'s `slots.neutral`
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
        // Three minutes. Baron pays a two-minute team-wide blessing
        // (`monsters/JungleBuffs.ts`'s `BARON_BUFF`), so a three-second
        // respawn meant the pit was simply a permanent aura for whichever
        // team could stand in it — the objective has to be *gone* for long
        // enough that holding the buff is worth playing around.
        reviveTime: 180_000,
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
        // Reach 400, so core derives `ranged` on its own; the colour is all
        // this body has to say. Purple to match the blessing it pays.
        attackColor: [196, 132, 255],
        offset: { x: 0, y: 0 },
      },
    ],
  },
  /**
   * Rồng nguyên tố. Rooted like Baron and, like Baron, worth a team-wide
   * blessing — but the blessing **replaces** rather than stacks, and the
   * respawn is read against its duration. Both numbers, and why they are a
   * pair, are in `monsters/Dragon.ts`.
   */
  dragon: {
    id: 'dragon',
    name: 'Dragon',
    fills: ['dragon'],
    members: [
      {
        name: 'Rồng Nguyên Tố',
        avatar: 'monster_Elemental_Dragon',
        // The one boss in this pack with legs. Baron and Vilemaw are scenery
        // with a long reach; a dragon that cannot take a step is not, and it
        // is the objective a match is meant to rotate around every minute.
        //
        // 2 is what every other single-bodied camp walks at, and a champion
        // walks at 3 — so it genuinely follows and is genuinely kiteable, and
        // with 320 of reach it does not need to catch anyone to keep
        // breathing on them. Paired with `anchored` below, which is what
        // stops legs also meaning hookable.
        speed: 2,
        size: 88,
        attackRange: 320,
        // A minute, not Baron's three: this game's pace, and the ceiling the
        // pack's newer objectives all observe.
        reviveTime: 60_000,
        health: 700,
        // A boss's whole fight, because this camp has no kit: `code.ts` wires
        // `makeDragonAbilities`, and that returns one entry — the blessing
        // paid on death, never cast. Baron and Vilemaw can afford modest
        // swings because `monsters/Baron.ts` and `monsters/Vilemaw.ts` carry
        // the rest in spit, slam, pool, web and venom. At 10 per 1.8s this
        // camp put out 5.6 dps and was the weakest fighting thing in the
        // jungle — a raptor pit did two and a half times as much.
        //
        // 24 per 1.6s is 15 dps, just past the raptors and a shade over
        // Baron's swing-plus-kit total. It is a large single hit on a ~100
        // health champion on purpose: the swing is a `breath` cone with a
        // wind-up that re-checks reach before it lands, so it is dodgeable by
        // walking, and a number worth walking away from is what makes that
        // telegraph mean anything. `tests/monsters/campPower.test.ts` measures
        // all of this against the real camps rather than trusting the table.
        damage: 24,
        attackInterval: 1_600,
        aggroRange: 400,
        // The one camp in this pack that overrides the derived style: at
        // reach 320 core would give it a spat projectile, and a dragon that
        // does not breathe is the whole of what was wrong with this pit.
        attackStyle: 'breath',
        attackColor: [255, 138, 58],
        // Walks, but cannot be relocated. Giving it legs alone also made it
        // hookable, and a boss that any grab can pull out of the pit it
        // guards is not guarding anything. It still takes every slow, stun,
        // root and knock-up — what it refuses is being *moved*.
        anchored: true,
        // Tighter than the jungle's own 350. With legs, the default leash
        // (`max(camp.r, aggroRange) + chaseMargin`) would let it follow you
        // 750px off its pit and into a lane. 150 keeps the chase to about
        // 550 — far enough that stepping back is not an escape, short enough
        // that the pit is still where the fight happens.
        chaseMargin: 150,
        offset: { x: 0, y: 0 },
      },
    ],
  },
  /**
   * Bãi quái đá. One body in the data; the other five arrive at runtime when
   * this one dies — see `monsters/Krugs.ts` for the split and for why its
   * children are `ephemeral`.
   */
  krugs: {
    id: 'krugs',
    name: 'Krugs',
    fills: ['krugs'],
    members: [
      {
        name: 'Krug Cổ',
        avatar: 'monster_Ancient_Krug',
        speed: 1.6,
        size: 74,
        attackRange: 50,
        // Three seconds, matching the wolves and raptors it stands beside.
        // A farm camp's pace is a property of the jungle, not of this camp.
        reviveTime: 3000,
        health: 260,
        damage: 11,
        offset: { x: 0, y: 0 },
      },
    ],
  },
  /**
   * Cua sông. The first camp in this pack that declares behaviour rather than
   * only numbers: it runs instead of fighting, and its leash is the shape of
   * the river.
   */
  scuttle: {
    id: 'scuttle',
    name: 'Scuttle Crab',
    fills: ['scuttle'],
    members: [
      {
        name: 'Cua Sông',
        avatar: 'monster_Rift_Scuttle',
        // Faster than anything else in the jungle, because running is the
        // whole of what it does.
        speed: 3.1,
        size: 46,
        attackRange: 50,
        reviveTime: 45_000,
        health: 180,
        // It never swings, so this is only ever the number `Monster` would
        // have derived from health. Stated as zero so nothing about the camp
        // depends on reading `temperament` to know it is harmless.
        damage: 0,
        // Wide, because this is the distance at which it *notices* you and
        // starts running — not a distance at which anything is attacked.
        aggroRange: 420,
        temperament: 'skittish',
        roam: { kind: 'terrain', layer: 'water' },
        offset: { x: 0, y: 0 },
      },
    ],
  },
  /**
   * Vilemaw. Ships with no slot on either of this pack's maps: it exists so a
   * hand-drawn Twisted Treeline can put `role: "vilemaw"` where it wants a
   * boss. See `monsters/Vilemaw.ts` for why it does not also fill `baron`.
   */
  vilemaw: {
    id: 'vilemaw',
    name: 'Vilemaw',
    fills: ['vilemaw'],
    members: [
      {
        name: 'Vilemaw',
        avatar: 'monster_Vilemaw',
        speed: 0,
        size: 100,
        attackRange: 360,
        reviveTime: 60_000,
        health: 900,
        damage: 11,
        attackInterval: 2000,
        aggroRange: 460,
        attackColor: [152, 245, 128],
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
        attackColor: [120, 190, 255],
        // Matched to the blessing's own ninety seconds
        // (`monsters/JungleBuffs.ts`), so the camp comes back at about the
        // moment the buff runs out: holding it is a route you keep walking,
        // not a wall you refarm three seconds after clearing it.
        reviveTime: 90_000,
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
        attackColor: [255, 120, 90],
        /** Same ninety seconds as Blue, for the same reason. */
        reviveTime: 90_000,
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
        attackColor: [150, 225, 140],
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
        attackColor: [255, 150, 150],
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
        attackColor: [255, 150, 150],
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
        attackColor: [255, 150, 150],
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
        attackColor: [255, 150, 150],
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
   * `coreRange` is load-bearing rather than documentation, and it has now been
   * raised for the same reason twice.
   *
   * `>=1.3.0` was for `items`: `ContentPackData.items` existed as a *field*
   * before core read it, so a pack declaring a shop against an older core
   * validates cleanly, installs cleanly, and has every one of its fourteen
   * items silently ignored — no error, no shop, nothing to look at.
   *
   * `>=1.4.0` is for `ItemDef.buildsFrom`. Same shape, one level down: an
   * older core drops the field, so every recipe below simply does not exist,
   * every finished item costs full price for ever, and the shop looks like it
   * is working. The floor is what turns that into a refused install.
   *
   * `>=1.5.0` is for the on-hit shelf (API contract 5): `Buff.onHit`,
   * `Buff.sourceSpell`, `Spell.countsAsAbilityCast` and
   * `api.combat.applyOnHitEffects`. On an older core the plain payloads would
   * merely be inert, but Cuồng Đao Guinsoo and Cuồng Cung Runaan *call*
   * `applyOnHitEffects` and would crash the swing that procs them — the
   * loudest possible version of "silently ignored", mid-fight.
   *
   * `>=1.6.0` is for `MonsterAbility.onKilled`, which the jungle blessings
   * (bùa xanh/đỏ/Baron, `monsters/JungleBuffs.ts`) hang everything on. An
   * older core never calls the hook, so the camps go back to paying nothing
   * but gold — the buff row just never appears, and nothing says why.
   *
   * `>=1.7.0` was for the two item stats that make abilities scale with a
   * build: `abilityPower` and `cooldownReduction`. Six items below grant them.
   * This one is the *loud* failure rather than the silent kind — core's
   * `ITEM_STAT_KEYS` is an allow-list and `validate.ts` refuses a pack naming
   * a key that is not on it, so an older core rejects this pack outright
   * instead of shipping a shop whose mage items do nothing. The floor turns
   * that rejection into a sentence a player can read.
   *
   * `>=1.8.0` is for `ChampionEntry.defence` and `ContentPackData.archetypes` —
   * the durability half of a role, and the taxonomy a hand-built kit picks from.
   * `defence` is the silent kind again: an older core drops the field and every
   * champion below is back to 100 health with no resistances, which is the exact
   * state this pack raised its floor to escape. `archetypes` is the loud kind:
   * an older core's `validate.ts` does not know the key and the pack is refused.
   *
   * `satisfiesCoreRange` parses `*` and `>=X.Y.Z` and nothing else, which is
   * also why this is no longer the unparseable `'^1'` it used to be.
   */
  manifest: {
    id: 'lol',
    version: '1.0.0',
    coreRange: '>=1.8.0',
    assets: 'lol',
  },
  spellDisplay: displayData(),
  champions: championEntries(),
  archetypes: archetypeEntries(),
  items: itemEntries(),
  monsters: monsterEntries(),
  maps: [summonersRift, twistedTreeline],
};
