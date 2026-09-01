import { describe, expect, it } from 'vitest';
import { ATTACK, DEFENCE, ROLE_NAME, type Role } from '../data';
import { data } from '../data';

/**
 * What each role is made of, held to the numbers it was tuned to.
 *
 * `ATTACK` had been per-role for a long time. `DEFENCE` had not, so every
 * champion this pack ships was **100 health with no resistances** — less than
 * a lane minion's 140 — and a tank and a marksman were the same body. It only
 * became unplayable once the shop grew: a full attack build here reaches about
 * 298 damage a second, and the best tank build in the shop died to one
 * marksman in two and a half seconds.
 *
 * The arithmetic below is written out by hand rather than imported, on the
 * rule `Mitigation.test.ts` states in core: a table asked to verify itself
 * agrees with itself however wrong it is.
 */
const roles = Object.keys(ATTACK) as Role[];

/** `100 / (100 + r)`, core's curve, restated so this file is a second opinion. */
const mitigated = (resistance: number): number => 100 / (100 + resistance);

describe('every role is a whole champion', () => {
  it('declares both halves, for all six', () => {
    // The failure this prevents is a role with an attack profile and no body,
    // which is silently 100 health again — the exact state being escaped.
    expect(Object.keys(DEFENCE).sort()).toEqual(roles.slice().sort());
    expect(Object.keys(ROLE_NAME).sort()).toEqual(roles.slice().sort());
  });

  it('gives every champion on the roster one', () => {
    const champions = (data.champions ?? []).filter(entry => entry.playable);
    expect(champions.length).toBeGreaterThan(0);
    for (const champion of champions) {
      expect(champion.defence, `${champion.name} has no body`).toBeDefined();
      expect(champion.attack, `${champion.name} has no attack profile`).toBeDefined();
    }
  });

  it('publishes them all to the loadout screen', () => {
    // A hand-built kit picks from this list. A role missing from it is a role
    // the player cannot choose, however well tuned.
    expect((data.archetypes ?? []).map(entry => entry.id).sort()).toEqual(
      roles.map(role => role.toLowerCase()).sort()
    );
  });
});

describe('the durability spread', () => {
  it('puts every champion above a lane minion, which is where the bug was', () => {
    // A minion is 140. Every champion was 100.
    for (const role of roles) {
      expect(DEFENCE[role].health, `${role} is thinner than a minion`).toBeGreaterThanOrEqual(125);
    }
  });

  it('orders the front line ahead of the back line, on both resistances', () => {
    expect(DEFENCE.TANK.health).toBeGreaterThan(DEFENCE.BRUISER.health);
    expect(DEFENCE.BRUISER.health).toBeGreaterThan(DEFENCE.ASSASSIN.health);
    expect(DEFENCE.TANK.armor).toBeGreaterThan(DEFENCE.MARKSMAN.armor);
    expect(DEFENCE.TANK.magicResist).toBeGreaterThan(DEFENCE.MARKSMAN.magicResist);
  });

  it('leans on the resistances rather than the pool, so flat heals keep their worth', () => {
    // 39 abilities in this pack restore or shield a flat amount. A shield is
    // worth `1 + armor/100` times its face value and worth a *smaller share*
    // of a larger pool, so the tank's advantage has to come mostly from the
    // multiplier — otherwise this pack's own supports quietly stop mattering.
    const poolRatio = DEFENCE.TANK.health / DEFENCE.MARKSMAN.health;
    const armourRatio =
      mitigated(DEFENCE.MARKSMAN.armor) / mitigated(DEFENCE.TANK.armor);

    expect(poolRatio).toBeLessThan(2);
    expect(armourRatio, 'the resistances are not carrying this').toBeGreaterThan(1.3);
  });
});

describe('the target the whole pass was tuned to', () => {
  /** Everything a set of items grants of one stat. */
  const items = Object.values(data.items ?? {});
  const bestSix = (key: 'maxHealth' | 'armor' | 'magicResist'): number =>
    items
      .map(item => item.stats?.[key] ?? 0)
      .sort((a, b) => b - a)
      .slice(0, 6)
      .reduce((sum, amount) => sum + amount, 0);

  /**
   * The marksman that motivated all of this: every crit and attack-speed item
   * the shop sells, on the role built to use them.
   */
  const CARRY_BUILD = [
    'infinity_edge',
    'kraken_slayer',
    'runaans_hurricane',
    'blade_of_the_ruined_king',
    // Was Lưỡi Hái Linh Hồn. The shop sells armour penetration now (core
    // 1.14), and a marksman walking into six tank items without any is not
    // "the role built to use them" any more — it is a build that declines the
    // one answer the shop added for exactly this fight.
    'lord_dominiks_regards',
    'guinsoos_rageblade',
  ];

  const carryGrants = (key: string): number =>
    CARRY_BUILD.reduce((sum, id) => sum + ((data.items?.[id]?.stats as never)?.[key] ?? 0), 0);

  /** What the carry's build leaves of a tank's armour. */
  const carryPenetration = (): number => Math.min(1, carryGrants('armorPenetration'));

  const carryDps = (): number => {
    const build = CARRY_BUILD;
    const grants = (key: string): number =>
      build.reduce((sum, id) => sum + ((data.items?.[id]?.stats as never)?.[key] ?? 0), 0);

    const damage = ATTACK.MARKSMAN.damage + grants('attackDamage');
    // A share of the role's own base rate now, not swings a second added to it
    // — core's `PERCENT_OF_BASE`. `MAX_ATTACK_SPEED` is still the read clamp.
    const rate = Math.min(3, ATTACK.MARKSMAN.attacksPerSecond * (1 + grants('attackSpeed')));
    const crit = Math.min(1, grants('critChance'));
    return damage * rate * (1 + crit * (0.75 + grants('critDamage')));
  };

  /**
   * The armour the carry actually has to chew through: penetration is a
   * *share* of the number, so it is taken off before the curve rather than
   * after it — `combat/Mitigation.ts` does the same, and doing it after would
   * make a share of a mitigation multiplier, which is not a thing.
   */
  const tankArmorFacingCarry = (): number =>
    (DEFENCE.TANK.armor + bestSix('armor')) * (1 - carryPenetration());

  it('lets a full tank build hold a full marksman build for four to five seconds', () => {
    const health = DEFENCE.TANK.health + bestSix('maxHealth');
    const armor = tankArmorFacingCarry();
    const effective = health / mitigated(armor);
    const seconds = effective / carryDps();

    expect(seconds, `${seconds.toFixed(1)}s — ${health} health behind ${armor.toFixed(0)} armour`)
      .toBeGreaterThanOrEqual(3.5);
    expect(seconds).toBeLessThanOrEqual(6);
  });

  it('still lets two attackers bring that tank down in about two', () => {
    // The target is a tank that can open a fight, not one that has to be
    // ignored. Focus fire has to stay the right answer.
    const health = DEFENCE.TANK.health + bestSix('maxHealth');
    const seconds = health / mitigated(tankArmorFacingCarry()) / (carryDps() * 2);

    expect(seconds).toBeLessThan(3);
  });

  it('does not leave magic resistance far behind armour', () => {
    // It was: 110 against 148 across the shop, on a roster where abilities now
    // scale to about three times their base. A team that happened to deal
    // magic damage went through the best possible build noticeably faster.
    expect(bestSix('magicResist')).toBeGreaterThan(bestSix('armor') * 0.75);
  });
});
