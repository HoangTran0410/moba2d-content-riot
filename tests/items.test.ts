import { describe, expect, it } from 'vitest';
import { buildTestApi, PackRegistry } from '@moba2d/core/testing';
import type { ContentPack, SpellSource } from '@moba2d/core/content/types';
import riotCode, { data } from '../pack';
import { spellCatalog } from '../generated/spellCatalog';
import { assetManifest } from '../generated/assetManifest';

const api = buildTestApi();

/**
 * The shop this pack ships: fourteen items, four spells behind them, and the
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

/** The four, by name. Not derived from a prefix the code under test also uses. */
const ITEM_SPELL_IDS = [
  'Item_Thornmail',
  'Item_Zhonyas',
  'Item_Ghostblade',
  'Item_Quicksilver',
] as const;

/**
 * The set as specified: id, name, cost, and every stat with its exact amount.
 * Written out rather than read back off `data.items`, which is the thing under
 * test — a table that asks the shop what the shop says agrees with itself
 * whatever the shop says.
 */
const SPEC: Record<
  string,
  { name: string; cost: number; stats: Record<string, number>; passive?: string; active?: string }
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
  },
  warmogs_armor: {
    name: 'Giáp Máu Warmog',
    cost: 1200,
    stats: { maxHealth: 70, healthRegen: 0.05 },
  },
  thornmail: { name: 'Giáp Gai', cost: 1100, stats: { armor: 45 }, passive: 'Item_Thornmail' },
  infinity_edge: {
    name: 'Vô Cực Kiếm',
    cost: 1300,
    stats: { attackDamage: 18, critChance: 0.25, critDamage: 0.2 },
  },
  quicksilver_sash: {
    name: 'Khăn Giải Thuật',
    cost: 1100,
    stats: { magicResist: 25, attackDamage: 6 },
    active: 'Item_Quicksilver',
  },
  blade_of_the_ruined_king: {
    name: 'Gươm Suy Vong',
    cost: 1200,
    stats: { attackDamage: 10, attackSpeed: 0.25, omnivamp: 0.12 },
  },
  zhonyas_hourglass: {
    name: 'Đồng Hồ Cát Zhonya',
    cost: 1400,
    stats: { armor: 30 },
    active: 'Item_Zhonyas',
  },
  youmuus_ghostblade: {
    name: 'Kiếm Ma Youmuu',
    cost: 1200,
    stats: { attackDamage: 12 },
    active: 'Item_Ghostblade',
  },
};

describe('no Item_ spell leaks into spellDisplay', () => {
  it('has all four in the generated catalogue, or the scan below proves nothing', () => {
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

  it('still hands all four over in the code half, or the items that name them are inert', () => {
    const code = riotCode(api);
    for (const id of ITEM_SPELL_IDS) {
      expect(code.spells?.[id], id).toBeTypeOf('function');
    }
  });
});

describe('the item set', () => {
  const items = data.items ?? {};

  it('ships exactly the fourteen specified, keyed by their own id', () => {
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

  it('reaches its spells only through passive/active, and only the four', () => {
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
    expect(data.manifest.coreRange).toBe('>=1.3.0');
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

    expect(registry.items()).toHaveLength(14);
    const thornmail = registry.item('lol:thornmail');
    expect(thornmail?.passive).toBe('lol:Item_Thornmail');
    expect(thornmail?.icon).toBe('lol:item_thornmail');
  });
});
