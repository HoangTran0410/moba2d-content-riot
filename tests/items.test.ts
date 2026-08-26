import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTestApi, PackRegistry } from '@moba2d/core/testing';
import type { ContentPack, SpellSource } from '@moba2d/core/content/types';
import riotCode, { data } from '../pack';
import { spellCatalog } from '../generated/spellCatalog';
import { assetManifest } from '../generated/assetManifest';

const api = buildTestApi();

/**
 * The shop this pack ships: twenty-eight items, nineteen spells behind them, and the
 * one thing about them that is easy to get wrong in a way nothing complains
 * about.
 *
 * **`Item_*` must not reach `spellDisplay`.** That record is
 * `PackRegistry.spellDisplayIds`, which is the population a `'random'` loadout
 * slot is drawn from — so an item's active landing there is dealt to a
 * champion who does not own the item, on a key the HUD will happily draw. It
 * fails silently in both directions: nothing throws, and the spell works.
 *
 * The scan below is over the *data* rather than over `data.ts`'s source text,
 * because the data is what core reads and a text scan would pass the day
 * someone rewrote the filter into a helper. What makes it falsifiable rather
 * than vacuous is the first case: the four ids really are in the generated
 * catalogue, so "none of them is in `spellDisplay`" is a filter doing work
 * rather than four spells that do not exist.
 */

/** The nineteen, by name. Not derived from a prefix the code under test also uses. */
const ITEM_SPELL_IDS = [
  'Item_Thornmail',
  'Item_Zhonyas',
  'Item_Ghostblade',
  'Item_Quicksilver',
  'Item_Sheen',
  'Item_TrinityForce',
  'Item_DivineSunderer',
  'Item_EssenceReaver',
  'Item_LichBane',
  'Item_Tiamat',
  'Item_RavenousHydra',
  'Item_TitanicHydra',
  'Item_RuinedKing',
  'Item_WitsEnd',
  'Item_Kraken',
  'Item_Guinsoo',
  'Item_Runaan',
  'Item_Nashor',
  'Item_DuskAndDawn',
] as const;

/**
 * The set as specified: id, name, cost, and every stat with its exact amount.
 * Written out rather than read back off `data.items`, which is the thing under
 * test — a table that asks the shop what the shop says agrees with itself
 * whatever the shop says.
 */
const SPEC: Record<
  string,
  {
    name: string;
    cost: number;
    stats: Record<string, number>;
    passive?: string;
    active?: string;
    /** The recipe, in the order the shop draws it. Absent for a component. */
    buildsFrom?: string[];
  }
> = {
  long_sword: { name: 'Kiếm Dài', cost: 350, stats: { attackDamage: 6 } },
  cloth_armor: { name: 'Giáp Lụa', cost: 300, stats: { armor: 18 } },
  null_magic_mantle: { name: 'Áo Vải', cost: 350, stats: { magicResist: 18 } },
  ruby_crystal: { name: 'Hồng Ngọc', cost: 400, stats: { maxHealth: 25 } },
  boots: { name: 'Giày', cost: 300, stats: { speed: 0.35 } },
  recurve_bow: { name: 'Cung Gỗ', cost: 500, stats: { attackSpeed: 0.25 } },
  berserkers_greaves: {
    name: 'Giày Cuồng Nộ',
    cost: 900,
    stats: { speed: 0.45, attackSpeed: 0.3 },
    buildsFrom: ['boots', 'recurve_bow'],
  },
  warmogs_armor: {
    name: 'Giáp Máu Warmog',
    cost: 1200,
    stats: { maxHealth: 70, healthRegen: 0.05 },
    buildsFrom: ['ruby_crystal', 'ruby_crystal'],
  },
  thornmail: { name: 'Giáp Gai', cost: 1100, stats: { armor: 45 }, passive: 'Item_Thornmail', buildsFrom: ['cloth_armor', 'cloth_armor'] },
  infinity_edge: {
    name: 'Vô Cực Kiếm',
    cost: 1300,
    stats: { attackDamage: 18, critChance: 0.25, critDamage: 0.2 },
    buildsFrom: ['long_sword', 'long_sword', 'long_sword'],
  },
  quicksilver_sash: {
    name: 'Khăn Giải Thuật',
    cost: 1100,
    stats: { magicResist: 25, attackDamage: 6 },
    active: 'Item_Quicksilver',
    buildsFrom: ['null_magic_mantle', 'long_sword'],
  },
  blade_of_the_ruined_king: {
    name: 'Gươm Suy Vong',
    cost: 1200,
    stats: { attackDamage: 10, attackSpeed: 0.25, omnivamp: 0.12 },
    passive: 'Item_RuinedKing',
    buildsFrom: ['recurve_bow', 'long_sword'],
  },
  sheen: { name: 'Thủy Kiếm', cost: 450, stats: { maxMana: 15 }, passive: 'Item_Sheen' },
  tiamat: { name: 'Rìu Tiamat', cost: 550, stats: { attackDamage: 6 }, passive: 'Item_Tiamat' },
  guinsoos_rageblade: {
    name: 'Cuồng Đao Guinsoo',
    cost: 1400,
    stats: { attackDamage: 8, attackSpeed: 0.35 },
    passive: 'Item_Guinsoo',
    buildsFrom: ['recurve_bow', 'long_sword'],
  },
  wits_end: {
    name: 'Đao Tím',
    cost: 1300,
    stats: { attackSpeed: 0.3, magicResist: 20 },
    passive: 'Item_WitsEnd',
    buildsFrom: ['recurve_bow', 'null_magic_mantle'],
  },
  kraken_slayer: {
    name: 'Móc Diệt Thủy Quái',
    cost: 1500,
    stats: { attackDamage: 14, attackSpeed: 0.3 },
    passive: 'Item_Kraken',
    buildsFrom: ['recurve_bow', 'long_sword', 'long_sword'],
  },
  nashors_tooth: {
    name: 'Nanh Nashor',
    cost: 1300,
    stats: { attackSpeed: 0.4 },
    passive: 'Item_Nashor',
    buildsFrom: ['recurve_bow'],
  },
  trinity_force: {
    name: 'Tam Hợp Kiếm',
    cost: 1700,
    stats: { attackDamage: 10, attackSpeed: 0.3, maxMana: 20, speed: 0.15 },
    passive: 'Item_TrinityForce',
    buildsFrom: ['sheen', 'long_sword', 'recurve_bow'],
  },
  divine_sunderer: {
    name: 'Búa Rìu Sát Thần',
    cost: 1500,
    stats: { maxHealth: 35, maxMana: 15, attackDamage: 8 },
    passive: 'Item_DivineSunderer',
    buildsFrom: ['sheen', 'ruby_crystal'],
  },
  essence_reaver: {
    name: 'Lưỡi Hái Linh Hồn',
    cost: 1400,
    stats: { attackDamage: 12, maxMana: 25, critChance: 0.15 },
    passive: 'Item_EssenceReaver',
    buildsFrom: ['sheen', 'long_sword'],
  },
  lich_bane: {
    name: 'Kiếm Tai Ương',
    cost: 1400,
    stats: { speed: 0.4, maxMana: 20, attackSpeed: 0.15 },
    passive: 'Item_LichBane',
    buildsFrom: ['sheen', 'boots'],
  },
  ravenous_hydra: {
    name: 'Rìu Mãng Xà',
    cost: 1400,
    stats: { attackDamage: 14, omnivamp: 0.1 },
    passive: 'Item_RavenousHydra',
    buildsFrom: ['tiamat', 'long_sword'],
  },
  titanic_hydra: {
    name: 'Rìu Đại Mãng Xà',
    cost: 1500,
    stats: { attackDamage: 8, maxHealth: 40 },
    passive: 'Item_TitanicHydra',
    buildsFrom: ['tiamat', 'ruby_crystal'],
  },
  runaans_hurricane: {
    name: 'Cuồng Cung Runaan',
    cost: 1400,
    stats: { attackSpeed: 0.55 },
    passive: 'Item_Runaan',
    buildsFrom: ['recurve_bow', 'recurve_bow'],
  },
  dusk_and_dawn: {
    name: 'Bình Minh & Hoàng Hôn',
    cost: 1700,
    stats: { maxHealth: 60, attackDamage: 6 },
    passive: 'Item_DuskAndDawn',
    buildsFrom: ['ruby_crystal', 'ruby_crystal'],
  },
  zhonyas_hourglass: {
    name: 'Đồng Hồ Cát Zhonya',
    cost: 1400,
    stats: { armor: 30 },
    active: 'Item_Zhonyas',
    buildsFrom: ['cloth_armor'],
  },
  youmuus_ghostblade: {
    name: 'Kiếm Ma Youmuu',
    cost: 1200,
    stats: { attackDamage: 12 },
    active: 'Item_Ghostblade',
    buildsFrom: ['long_sword', 'long_sword'],
  },
};

describe('no Item_ spell leaks into spellDisplay', () => {
  it('has every one in the generated catalogue, or the scan below proves nothing', () => {
    for (const id of ITEM_SPELL_IDS) {
      expect(Object.keys(spellCatalog), id).toContain(id);
    }
  });

  it("keeps every one of them out of the data half's spellDisplay", () => {
    const display = Object.keys(data.spellDisplay ?? {});
    expect(display.length).toBeGreaterThan(200);
    for (const id of ITEM_SPELL_IDS) {
      expect(display, id).not.toContain(id);
    }
    // The prefix, not only the four: a fifth item spell added later must not
    // slip in behind a list nobody remembered to grow.
    expect(display.filter(id => id.startsWith('Item_'))).toEqual([]);
  });

  it('still hands every one over in the code half, or the items that name them are inert', () => {
    const code = riotCode(api);
    for (const id of ITEM_SPELL_IDS) {
      expect(code.spells?.[id], id).toBeTypeOf('function');
    }
  });
});

describe('the item set', () => {
  const items = data.items ?? {};

  it('ships exactly the twenty-eight specified, keyed by their own id', () => {
    expect(Object.keys(items).sort()).toEqual(Object.keys(SPEC).sort());
    for (const [key, def] of Object.entries(items)) {
      // `validate.ts` refuses the pack over this, but the message names a key
      // rather than what went wrong with it.
      expect(def.id, key).toBe(key);
    }
  });

  it('carries the specified name, cost and stats, to the number', () => {
    for (const [key, expected] of Object.entries(SPEC)) {
      const def = items[key];
      expect(def, key).toBeDefined();
      expect(def.name, key).toBe(expected.name);
      expect(def.cost, key).toBe(expected.cost);
      expect(def.stats ?? {}, key).toEqual(expected.stats);
      expect(def.passive, `${key} passive`).toBe(expected.passive);
      expect(def.active, `${key} active`).toBe(expected.active);
      expect(def.buildsFrom, `${key} buildsFrom`).toEqual(expected.buildsFrom);
    }
  });

  it('gives every one of them a one-line Vietnamese description the shop can print', () => {
    for (const [key, def] of Object.entries(items)) {
      expect(def.description, key).toBeTruthy();
      // `ShopPanel.vue` interpolates it (`{{ row.description }}`), it does not
      // `v-html` it — so a spell description's `<span class="buff">` markup
      // would be printed at the player as literal angle brackets.
      expect(def.description, key).not.toMatch(/[<>]/);
    }
  });

  it('names an icon this pack actually ships', () => {
    for (const [key, def] of Object.entries(items)) {
      expect(Object.keys(assetManifest), key).toContain(def.icon);
    }
  });

  it('reaches its spells only through passive/active, and only the nineteen', () => {
    const named = new Set<string>();
    for (const def of Object.values(items)) {
      if (def.passive) named.add(def.passive);
      if (def.active) named.add(def.active);
    }
    expect([...named].sort()).toEqual([...ITEM_SPELL_IDS].sort());
  });

  it('declares a core floor new enough that core actually reads `items`', () => {
    // `ContentPackData.items` existed as a field before core read it, so a
    // pack declaring a shop against an older core installs cleanly and has
    // every item silently ignored. `satisfiesCoreRange` parses `*` and
    // `>=X.Y.Z` and nothing else.
    expect(data.manifest.coreRange).toBe('>=1.5.0');
  });

  it("survives core's own validation, stat allow-list included", () => {
    // The real gate, rather than a second copy of `ITEM_STAT_KEYS` kept here:
    // `PackRegistry.install` runs `validate.ts`, which refuses a stats key
    // that is not on core's allow-list, an `id` that disagrees with its key,
    // and a passive/active naming a spell the code half does not ship.
    //
    // `BasicAttack` and `Recall` are folded on the way `src/content/install.ts`
    // folds them — this pack is deliberately not installable without them
    // (`tests/pack.test.ts`), and that has nothing to do with items.
    const code = riotCode(api);
    const spells: Record<string, SpellSource> = {
      ...(code.spells ?? {}),
      BasicAttack: class {} as SpellSource,
      Recall: class {} as SpellSource,
    };
    const pack: ContentPack = { ...data, ...code, spells };

    const registry = new PackRegistry();
    registry.install(pack);

    expect(registry.items()).toHaveLength(28);
    const thornmail = registry.item('lol:thornmail');
    expect(thornmail?.passive).toBe('lol:Item_Thornmail');
    expect(thornmail?.icon).toBe('lol:item_thornmail');
  });
});

/**
 * Ghép đồ — the build paths, and the three rules core cannot check for us.
 *
 * Core's `validate.ts` refuses a recipe naming an item that does not exist, a
 * cycle, and a total under the sum of its parts. Everything below is a rule
 * about *this shop* rather than about recipes in general, and every one of
 * them is silent if broken:
 *
 *   - **A finished item must not be a downgrade.** Combining swaps the parts'
 *     stats for the finished item's, so an item granting less of something its
 *     own parts granted makes the upgrade a punishment. Caught while designing
 *     these: Zhonya's grants 30 armour and two Giáp Lụa grant 36, so the
 *     obvious two-component recipe would have charged 800 gold to lose six
 *     armour. It builds from one instead.
 *   - **Every component must be reachable.** A component nothing builds from
 *     is a cheap stat stick a player buys once and then cannot upgrade, and
 *     the shop gives them no way to find that out.
 *   - **A recipe must fit in the bag.** Six slots, and the parts have to be
 *     held at once for the combine to be worth anything.
 */
describe('the build paths', () => {
  const items = data.items ?? {};

  /** The six the shop sells as parts rather than as an end in themselves. */
  const COMPONENTS = [
    'long_sword',
    'cloth_armor',
    'null_magic_mantle',
    'ruby_crystal',
    'boots',
    'recurve_bow',
    'sheen',
    'tiamat',
  ];

  const finished = Object.values(items).filter(def => !COMPONENTS.includes(def.id));

  /** Everything the parts of `def` grant, added up. */
  const partStats = (def: (typeof items)[string]): Record<string, number> => {
    const total: Record<string, number> = {};
    for (const partId of def.buildsFrom ?? []) {
      for (const [key, amount] of Object.entries(items[partId]?.stats ?? {})) {
        total[key] = (total[key] ?? 0) + amount;
      }
    }
    return total;
  };

  it('gives every finished item a recipe and every component none', () => {
    for (const id of COMPONENTS) {
      expect(items[id]?.buildsFrom, `${id} is a component`).toBeUndefined();
    }
    for (const def of finished) {
      expect(def.buildsFrom?.length, `${def.id} builds from nothing`).toBeGreaterThan(0);
    }
  });

  it('names only parts this pack actually sells', () => {
    for (const def of finished) {
      for (const partId of def.buildsFrom ?? []) {
        expect(items[partId], `${def.id} builds from ${partId}`).toBeDefined();
      }
    }
  });

  it('prices every total at or above the sum of its parts', () => {
    // Core refuses the pack over this, but its message arrives at install and
    // names one item. Here it names all eight and prints the combine cost,
    // which is the number a designer is actually retuning.
    for (const def of finished) {
      const parts = (def.buildsFrom ?? []).reduce((sum, id) => sum + (items[id]?.cost ?? 0), 0);
      expect(def.cost, `${def.id}: parts cost ${parts}, item costs ${def.cost}`).toBeGreaterThanOrEqual(parts);
    }
  });

  it('never makes the upgrade worse than the things it is made of', () => {
    for (const def of finished) {
      const own = def.stats ?? {};
      for (const [key, fromParts] of Object.entries(partStats(def))) {
        expect(
          own[key] ?? 0,
          `${def.id} grants ${own[key] ?? 0} ${key}, its parts grant ${fromParts}`
        ).toBeGreaterThanOrEqual(fromParts);
      }
    }
  });

  it('gives every component somewhere to go', () => {
    const used = new Set(finished.flatMap(def => def.buildsFrom ?? []));
    for (const id of COMPONENTS) {
      expect(used.has(id), `${id} builds into nothing`).toBe(true);
    }
  });

  it('keeps every recipe inside the six slots a bag has', () => {
    for (const def of finished) {
      expect((def.buildsFrom ?? []).length, def.id).toBeLessThanOrEqual(6);
    }
  });
});

/**
 * The floor is declared **twice** — `data.ts`'s `manifest.coreRange`, which is
 * the copy `PackRegistry` holds after this pack's code has already run, and
 * `scripts/write-manifest.mjs`'s, which is the copy a *runtime* install checks
 * before a line of it runs. Only the second one can refuse an install, so the
 * two drifting means the bundled build and the published build disagree about
 * which cores they support — and the published one wins. This has already been
 * missed once.
 */
describe('the core floor', () => {
  it('is the same number in the manifest writer as in the data half', () => {
    const script = readFileSync(new URL('../scripts/write-manifest.mjs', import.meta.url), 'utf8');
    const declared = script.match(/^const coreRange = '([^']+)';$/m)?.[1];
    expect(declared, 'scripts/write-manifest.mjs no longer declares one').toBeTruthy();
    expect(declared).toBe(data.manifest.coreRange);
  });
});
