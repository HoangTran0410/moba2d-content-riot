import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi } from '@moba2d/core/testing';
import {
  createGame,
  createUnit,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  pressSpell,
} from '@moba2d/core/testing/spell';
import type { OnHitEvent } from '@moba2d/core/content/types';

import Item_Sheen, {
  SpellbladeBuff,
  SHEEN_BASE_AD_RATIO,
  SPELLBLADE_ICD_MS,
  SPELLBLADE_WINDOW_MS,
} from '../spells/Item_Sheen';
import { Item_TrinityForce_Blade, TRINITY_BASE_AD_RATIO } from '../spells/Item_TrinityForce';
import {
  Item_DivineSunderer_Blade,
  SUNDERER_MAX_HEALTH_RATIO,
  SUNDERER_HEAL_RATIO,
} from '../spells/Item_DivineSunderer';
import {
  Item_EssenceReaver_Blade,
  REAVER_MANA_REFUND_RATIO,
} from '../spells/Item_EssenceReaver';
import { Item_RuinedKing_Bite, RUINED_KING_CURRENT_HEALTH_RATIO } from '../spells/Item_RuinedKing';
import { Item_WitsEnd_Sting, WITS_END_MAGIC_DAMAGE } from '../spells/Item_WitsEnd';
import {
  Item_Kraken_Harpoon,
  KRAKEN_HIT_INTERVAL,
  KRAKEN_PROC_DAMAGE,
} from '../spells/Item_Kraken';
import {
  Item_Guinsoo_Rage,
  RAGE_MAX_STACKS,
  RAGE_STACK_ID,
  PHANTOM_HIT_INTERVAL,
} from '../spells/Item_Guinsoo';
import {
  Item_Runaan_SideBolt,
  Item_Runaan_Wind,
  SIDE_BOLT_AD_RATIO,
} from '../spells/Item_Runaan';
import { CleaveBuff } from '../spells/Item_Tiamat';
import { Item_DuskAndDawn_Twin } from '../spells/Item_DuskAndDawn';
import { Item_Nashor_Fang, NASHOR_MAGIC_DAMAGE } from '../spells/Item_Nashor';

const api = buildTestApi();
const EventType = api.enums.EventType;

/**
 * The on-hit shelf, driven through the same pipeline `landBasicAttack` drives:
 * `api.combat.applyOnHitEffects` with a real hit, real units and real buffs —
 * the numbers each item's file exports, checked against health bars they
 * actually move. No spell here is pressed through the cast machinery; the
 * passives' whole cast is "hang the buff", and the buffs are what is under
 * test.
 */

const FRAME_MS = 100;

type Unit = ReturnType<typeof createUnit>;
type World = { game: ReturnType<typeof createGame>; attacker: Unit; victim: Unit };

const world = (): World => {
  const game = createGame();
  const attacker = createUnit(game, 0, 'blue');
  const victim = createUnit(game, 50, 'red');
  for (const unit of [attacker, victim]) {
    unit.stats.maxHealth.baseValue = 200;
    unit.stats.health.baseValue = 200;
  }
  attacker.stats.attackDamage.baseValue = 14;
  return { game, attacker, victim };
};

const swing = (
  { attacker, victim }: Pick<World, 'attacker' | 'victim'>,
  overrides: Partial<OnHitEvent> = {}
): void => {
  api.combat.applyOnHitEffects({
    attacker,
    victim,
    damage: 20,
    ranged: true,
    crit: false,
    echo: false,
    ...overrides,
  });
};

beforeEach(() => {
  installSpellObjectGlobals();
  installSketchMathGlobals();
  vi.stubGlobal('deltaTime', FRAME_MS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('spellblade (Thủy Kiếm and its upgrades)', () => {
  const armed = (BladeClass: typeof SpellbladeBuff, w: World): SpellbladeBuff => {
    const blade = new BladeClass(0, w.attacker, w.attacker);
    blade.stackId = 'item_spellblade';
    w.attacker.addBuff(blade);
    // an ability cast by the wearer charges the blade…
    w.game.eventManager.emit(EventType.ON_POST_CAST_SPELL, { owner: w.attacker });
    return blade;
  };

  it('does nothing before any ability has been cast', () => {
    const w = world();
    const blade = new SpellbladeBuff(0, w.attacker, w.attacker);
    w.attacker.addBuff(blade);

    swing(w);
    expect(w.victim.stats.health.value).toBe(200);
  });

  it('spends the charge on the next attack, once', () => {
    const w = world();
    armed(SpellbladeBuff, w);

    swing(w);
    const proc = 14 * SHEEN_BASE_AD_RATIO;
    expect(w.victim.stats.health.value).toBe(200 - proc);

    // the charge is spent — the second swing is plain
    swing(w);
    expect(w.victim.stats.health.value).toBe(200 - proc);
  });

  it('is not charged by a cast that does not count as an ability', () => {
    const w = world();
    const blade = new SpellbladeBuff(0, w.attacker, w.attacker);
    w.attacker.addBuff(blade);
    w.game.eventManager.emit(EventType.ON_POST_CAST_SPELL, {
      owner: w.attacker,
      countsAsAbilityCast: false,
    });

    swing(w);
    expect(w.victim.stats.health.value).toBe(200);
  });

  it("is not charged by someone else's cast", () => {
    const w = world();
    const blade = new SpellbladeBuff(0, w.attacker, w.attacker);
    w.attacker.addBuff(blade);
    w.game.eventManager.emit(EventType.ON_POST_CAST_SPELL, { owner: w.victim });

    swing(w);
    expect(w.victim.stats.health.value).toBe(200);
  });

  it('holds the internal cooldown across recasts', () => {
    const w = world();
    const blade = armed(SpellbladeBuff, w);

    swing(w);
    const afterFirst = w.victim.stats.health.value;

    // recharged immediately, but the ICD has not run down
    w.game.eventManager.emit(EventType.ON_POST_CAST_SPELL, { owner: w.attacker });
    swing(w);
    expect(w.victim.stats.health.value).toBe(afterFirst);

    // run the clock past the ICD and the same charge spends
    for (let elapsed = 0; elapsed <= SPELLBLADE_ICD_MS; elapsed += FRAME_MS) blade.update();
    swing(w);
    expect(w.victim.stats.health.value).toBe(afterFirst - 14 * SHEEN_BASE_AD_RATIO);
  });

  it('lets an unspent charge expire', () => {
    const w = world();
    const blade = armed(SpellbladeBuff, w);

    for (let elapsed = 0; elapsed <= SPELLBLADE_WINDOW_MS; elapsed += FRAME_MS) blade.update();
    swing(w);
    expect(w.victim.stats.health.value).toBe(200);
  });

  it('never spends the charge on an echoed application', () => {
    const w = world();
    armed(SpellbladeBuff, w);

    swing(w, { echo: true });
    expect(w.victim.stats.health.value).toBe(200);

    swing(w); // the real swing still finds the charge intact
    expect(w.victim.stats.health.value).toBe(200 - 14 * SHEEN_BASE_AD_RATIO);
  });

  it('Tam Hợp Kiếm procs at its own ratio', () => {
    const w = world();
    armed(Item_TrinityForce_Blade as typeof SpellbladeBuff, w);

    swing(w);
    expect(w.victim.stats.health.value).toBe(200 - 14 * TRINITY_BASE_AD_RATIO);
  });

  it('Búa Rìu Sát Thần reads the victim\'s maximum health and heals the wearer', () => {
    const w = world();
    w.attacker.stats.health.baseValue = 100; // room to heal into
    armed(Item_DivineSunderer_Blade as typeof SpellbladeBuff, w);

    swing(w);
    const proc = 200 * SUNDERER_MAX_HEALTH_RATIO;
    expect(w.victim.stats.health.value).toBe(200 - proc);
    expect(w.attacker.stats.health.value).toBe(100 + Math.round(proc * SUNDERER_HEAL_RATIO));
  });

  it('Lưỡi Hái Linh Hồn refunds a slice of maximum mana', () => {
    const w = world();
    w.attacker.stats.maxMana.baseValue = 100;
    // Through the granting seam, not the pool: `restoreMana` is the one door
    // (granting is not billing — URF must not zero a refund), so the refund
    // is checked at that door rather than by reading the pool back.
    const restored = vi.spyOn(w.attacker, 'restoreMana');
    armed(Item_EssenceReaver_Blade as typeof SpellbladeBuff, w);

    swing(w);
    expect(restored).toHaveBeenCalledWith(100 * REAVER_MANA_REFUND_RATIO);
  });
});

describe('the plain payloads', () => {
  it('Gươm Suy Vong bites for a share of CURRENT health', () => {
    const w = world();
    w.attacker.addBuff(new Item_RuinedKing_Bite(0, w.attacker, w.attacker));

    swing(w);
    expect(w.victim.stats.health.value).toBe(200 - 200 * RUINED_KING_CURRENT_HEALTH_RATIO);

    // hurt, the bite is smaller — current health, not maximum. `takeDamage`
    // rounds each instance to whole points, so the expectation rounds too.
    const current = w.victim.stats.health.value;
    swing(w);
    expect(w.victim.stats.health.value).toBe(
      current - Math.round(current * RUINED_KING_CURRENT_HEALTH_RATIO)
    );
  });

  it('Đao Tím stings for magic and puts the surge on the wearer', () => {
    const w = world();
    w.attacker.addBuff(new Item_WitsEnd_Sting(0, w.attacker, w.attacker));

    const speedBefore = w.attacker.stats.speed.value;
    swing(w);
    expect(w.victim.stats.health.value).toBe(200 - WITS_END_MAGIC_DAMAGE);
    expect(w.attacker.stats.speed.value).toBeGreaterThan(speedBefore);
  });

  it('Móc Diệt Thủy Quái lands the harpoon on the third consecutive swing', () => {
    const w = world();
    w.attacker.addBuff(new Item_Kraken_Harpoon(0, w.attacker, w.attacker));

    for (let hit = 1; hit < KRAKEN_HIT_INTERVAL; hit++) swing(w);
    expect(w.victim.stats.health.value).toBe(200);

    swing(w);
    expect(w.victim.stats.health.value).toBe(200 - KRAKEN_PROC_DAMAGE);
  });

  it('switching targets resets the harpoon count', () => {
    const w = world();
    const other = createUnit(w.game, 120, 'red');
    other.stats.maxHealth.baseValue = 200;
    other.stats.health.baseValue = 200;
    w.attacker.addBuff(new Item_Kraken_Harpoon(0, w.attacker, w.attacker));

    swing(w);
    swing(w);
    swing(w, { victim: other }); // count restarts at 1, on the new target
    swing(w, { victim: other });
    expect(other.stats.health.value).toBe(200);
    swing(w, { victim: other });
    expect(other.stats.health.value).toBe(200 - KRAKEN_PROC_DAMAGE);
  });
});

describe('Cuồng Đao Guinsoo', () => {
  const rageStacks = (unit: Unit): number =>
    (unit.buffs ?? []).filter(
      (buff: { toRemove: boolean; stackId: unknown }) =>
        !buff.toRemove && buff.stackId === RAGE_STACK_ID
    ).length;

  it('builds rage per swing, up to the cap', () => {
    const w = world();
    // A base to take a share of: rage grants `percentBaseBonus` now, the way
    // every attack-speed source does, and a share of the fixture's default 0
    // would be nothing however many stacks were counted.
    w.attacker.stats.attackSpeed.baseValue = 1.2;
    w.attacker.addBuff(new Item_Guinsoo_Rage(0, w.attacker, w.attacker));

    const attackSpeedBefore = w.attacker.stats.attackSpeed.value;
    // `updateBuffs` between swings, the real game's cadence: the overlap cap
    // retires the oldest stack by marking it, and the frame's buff pass is
    // what actually takes it off the list.
    for (let hit = 0; hit < RAGE_MAX_STACKS + 3; hit++) {
      swing(w);
      w.attacker.updateBuffs();
    }

    expect(rageStacks(w.attacker)).toBe(RAGE_MAX_STACKS);
    expect(w.attacker.stats.attackSpeed.value).toBeGreaterThan(attackSpeedBefore);
  });

  it('at full rage, every third swing applies the other on-hits twice', () => {
    const w = world();
    w.attacker.addBuff(new Item_Guinsoo_Rage(0, w.attacker, w.attacker));
    w.attacker.addBuff(new Item_Nashor_Fang(0, w.attacker, w.attacker));

    // spin up to full rage, then read a clean slate
    for (let hit = 0; hit < RAGE_MAX_STACKS + 1; hit++) swing(w);
    w.victim.stats.health.baseValue = 200;

    let doubled = 0;
    for (let hit = 0; hit < PHANTOM_HIT_INTERVAL; hit++) {
      const before = w.victim.stats.health.value;
      swing(w);
      if (before - w.victim.stats.health.value === NASHOR_MAGIC_DAMAGE * 2) doubled++;
    }
    expect(doubled).toBe(1);
  });
});

describe('Cuồng Cung Runaan', () => {
  /**
   * Four bodies laid out so the two rules the fan has can disagree with each
   * other, because for most of this item's life they could not: it took the
   * two enemies nearest **the wearer**, so `behind` — a body at the wearer's
   * feet, pointing away from everything — was a side target, and `beside`,
   * standing on the victim, competed with it on distance from the wrong point.
   *
   * `queryObjects` is replaced rather than driven through the quadtree, but
   * the replacement answers honestly about *where* it was asked: it filters by
   * the circle the caller passed. That is the whole claim under test — the
   * circle is on the victim — so a stub that ignored the area would make every
   * case below vacuous.
   */
  const fanWorld = () => {
    const game = createGame();
    const attacker = createUnit(game, 0, 'blue');
    const victim = createUnit(game, 200, 'red');
    // 80 from the victim, and well inside the wearer's swing.
    const beside = createUnit(game, 280, 'red');
    // 60 from the victim: the nearest of the three that qualify.
    const closer = createUnit(game, 140, 'red');
    // 120 from the victim — a legal side target that loses to the other two,
    // so the fan's own count is what keeps it out.
    const crowd = createUnit(game, 200, 'red');
    crowd.position.set(200, 120);
    // At the wearer's feet and 260 from the victim: the reported bug.
    const behind = createUnit(game, -60, 'red');
    // 180 from the victim — inside the spread — but 380 out, past what a
    // swing of 300 could have reached over two 55-unit bodies.
    const outOfReach = createUnit(game, 380, 'red');

    for (const unit of [attacker, victim, beside, closer, crowd, behind, outOfReach]) {
      unit.stats.maxHealth.baseValue = 200;
      unit.stats.health.baseValue = 200;
    }
    attacker.stats.attackDamage.baseValue = 14;
    attacker.stats.attackRange.baseValue = 300;

    const others = [beside, closer, crowd, behind, outOfReach];
    game.objectManager.queryObjects = ((options: {
      area: { x: number; y: number; r: number };
    }) =>
      others.filter(
        unit =>
          Math.hypot(unit.position.x - options.area.x, unit.position.y - options.area.y) <=
          options.area.r
      )) as never;

    // The fan launches missiles now, so the objects it adds are the assertion
    // surface: nothing has been damaged at the moment of the swing. Narrowed
    // to the item's own bolts — an on-hit that lands with them adds objects of
    // its own, and counting those as side bolts is how "two" becomes three.
    const bolts: Item_Runaan_SideBolt[] = [];
    vi.spyOn(game.objectManager, 'addObject').mockImplementation(object => {
      if (object instanceof Item_Runaan_SideBolt) bolts.push(object);
    });

    return { game, attacker, victim, beside, closer, crowd, behind, outOfReach, bolts };
  };

  /** Fly every bolt to wherever it is going. */
  const land = (bolts: Item_Runaan_SideBolt[]): void => {
    for (const bolt of [...bolts]) {
      for (let frame = 0; frame < 500 && !bolt.toRemove; frame++) bolt.update();
    }
  };

  const boltDamage = Math.round(14 * SIDE_BOLT_AD_RATIO);

  it('fans two side bolts that carry the on-hits', () => {
    const w = fanWorld();
    w.attacker.addBuff(new Item_Runaan_Wind(0, w.attacker, w.attacker));
    w.attacker.addBuff(new Item_Nashor_Fang(0, w.attacker, w.attacker));

    swing(w);
    expect(w.bolts.length).toBe(2);
    land(w.bolts);

    // each side victim: the bolt's own damage plus the carried sting
    for (const side of [w.closer, w.beside]) {
      expect(side.stats.health.value).toBe(200 - boltDamage - NASHOR_MAGIC_DAMAGE);
    }
    // the third body beside the victim loses on distance, and only on that
    expect(w.crowd.stats.health.value).toBe(200);
    // the main victim: the sting once — never a bolt at the unit already hit
    expect(w.victim.stats.health.value).toBe(200 - NASHOR_MAGIC_DAMAGE);
  });

  /**
   * **One other enemy in the world**, deliberately.
   *
   * Both rules below are refusals, and a refusal is invisible next to a body
   * the fan would rather have shot anyway: with three legal side targets on
   * the board, dropping the rule outright still produces the same two bolts,
   * because the count and the sort settle it first. The only shape that can
   * fail is a world where the rule is the *only* thing standing between the
   * fan and its target.
   */
  const loneWorld = (x: number, y = 0) => {
    const w = fanWorld();
    const only = createUnit(w.game, x, 'red');
    only.position.set(x, y);
    only.stats.maxHealth.baseValue = 200;
    only.stats.health.baseValue = 200;
    w.game.objectManager.queryObjects = ((options: {
      area: { x: number; y: number; r: number };
    }) =>
      [only].filter(
        unit =>
          Math.hypot(unit.position.x - options.area.x, unit.position.y - options.area.y) <=
          options.area.r
      )) as never;
    return { ...w, only };
  };

  /**
   * The report, exactly: *"nhiều khi cả mục tiêu ở hướng đối diện của kẻ bị
   * bắn"*. This body is 60 from the wearer and 260 from what the wearer shot,
   * and the fan has nothing else to aim at.
   */
  it('fans off the victim, not off the wearer', () => {
    const w = loneWorld(-60);
    w.attacker.addBuff(new Item_Runaan_Wind(0, w.attacker, w.attacker));

    swing(w);
    land(w.bolts);

    expect(w.bolts.length).toBe(0);
    expect(w.only.stats.health.value).toBe(200);
  });

  /**
   * And never past what the wearer could have hit itself: 180 from the victim,
   * which is inside the spread, and 380 out, which a swing of 300 over two
   * 55-unit bodies is not.
   */
  it('does not reach a body the swing could not have reached', () => {
    const w = loneWorld(380);
    w.attacker.addBuff(new Item_Runaan_Wind(0, w.attacker, w.attacker));

    swing(w);
    land(w.bolts);

    expect(w.bolts.length).toBe(0);
    expect(w.only.stats.health.value).toBe(200);
  });

  /**
   * They are projectiles, not lines drawn after the fact. Nothing is hurt at
   * the swing; the damage is where the bolt arrives.
   */
  it('lands its damage on arrival rather than at the swing', () => {
    const w = fanWorld();
    w.attacker.addBuff(new Item_Runaan_Wind(0, w.attacker, w.attacker));

    swing(w);
    expect(w.bolts.length).toBe(2);
    expect(w.beside.stats.health.value).toBe(200);

    land(w.bolts);
    expect(w.beside.stats.health.value).toBe(200 - boltDamage);
  });

  it('stays quiet for a melee swing', () => {
    const w = fanWorld();
    w.attacker.addBuff(new Item_Runaan_Wind(0, w.attacker, w.attacker));

    swing(w, { ranged: false });
    land(w.bolts);
    expect(w.beside.stats.health.value).toBe(200);
  });

  it('never fans off an echoed application', () => {
    const w = fanWorld();
    w.attacker.addBuff(new Item_Runaan_Wind(0, w.attacker, w.attacker));

    swing(w, { echo: true });
    land(w.bolts);
    expect(w.beside.stats.health.value).toBe(200);
  });
});

describe('Bình Minh & Hoàng Hôn', () => {
  it('applies the on-hit payloads twice per real swing', () => {
    const w = world();
    w.attacker.addBuff(new Item_DuskAndDawn_Twin(0, w.attacker, w.attacker));
    w.attacker.addBuff(new Item_Nashor_Fang(0, w.attacker, w.attacker));

    swing(w);
    expect(w.victim.stats.health.value).toBe(200 - NASHOR_MAGIC_DAMAGE * 2);
  });

  it('does not double itself against another doubler', () => {
    const w = world();
    const first = new Item_DuskAndDawn_Twin(0, w.attacker, w.attacker);
    first.stackId = 'twin-one';
    const second = new Item_DuskAndDawn_Twin(0, w.attacker, w.attacker);
    second.stackId = 'twin-two';
    w.attacker.addBuff(first);
    w.attacker.addBuff(second);
    w.attacker.addBuff(new Item_Nashor_Fang(0, w.attacker, w.attacker));

    swing(w);
    // one real + one echo per doubler — echoes never breed echoes
    expect(w.victim.stats.health.value).toBe(200 - NASHOR_MAGIC_DAMAGE * 3);
  });
});

describe('selling the item takes the passive away', () => {
  it("the passive spell's removal deactivates the buff it hung", () => {
    const w = world();
    const spell = new Item_Sheen(w.attacker);
    spell.owner = w.attacker;
    // pressed the way `Champion.armPassives` presses it — a SELF cast at the
    // wearer's own feet
    expect(pressSpell(spell, { caster: w.attacker, at: w.attacker.position })).toBe(true);

    const hung = (w.attacker.buffs ?? []).find(
      (buff: { stackId: unknown }) => buff.stackId === 'item_spellblade'
    );
    expect(hung).toBeDefined();

    spell.onRemoved();
    expect((hung as { toRemove: boolean }).toRemove).toBe(true);
  });
});

/**
 * Display, not mechanics: a permanent armed state wallpapered the HUD buff
 * row and the overhead strip — six item icons, each counting negative seconds
 * — so those opt out via `Buff.hudVisible`. A buff whose state is worth a
 * glance (a spellblade charge, a rage count, a harpoon counter) stays on.
 */
describe('which item buffs the HUD shows', () => {
  it('armed passives opt out; stateful ones stay visible', () => {
    const w = world();
    const hidden = [
      Item_WitsEnd_Sting,
      Item_Nashor_Fang,
      Item_RuinedKing_Bite,
      Item_Runaan_Wind,
      Item_DuskAndDawn_Twin,
      CleaveBuff,
    ];
    const visible = [SpellbladeBuff, Item_Guinsoo_Rage, Item_Kraken_Harpoon];

    for (const Armed of hidden) {
      const buff = new Armed(0, w.attacker, w.attacker);
      expect(buff.hudVisible, Armed.name).toBe(false);
    }
    for (const Stateful of visible) {
      const buff = new Stateful(0, w.attacker, w.attacker);
      expect(buff.hudVisible, Stateful.name).toBe(true);
    }
  });
});
