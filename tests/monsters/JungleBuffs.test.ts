import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi, indexObjects } from '@moba2d/core/testing';
import {
  createGame,
  installSketchMathGlobals,
  installSpellObjectGlobals,
  type TestGame,
} from '@moba2d/core/testing/spell';
import type { MonsterAbility } from '@moba2d/core/content/types';
import {
  BARON_BUFF,
  BLUE_BUFF,
  RED_BUFF,
  makeBaronBlessing,
  makeBlueSentinelAbilities,
  makeRedBramblebackAbilities,
} from '../../monsters/JungleBuffs';

/**
 * The three camps whose whole point is what killing them grants.
 *
 * Every case drives the real seam — `Monster.die` calling
 * `MonsterAbility.onKilled` — by hitting the camp for more than it has, never
 * by calling `onKilled` by hand: the reward has to survive the death path
 * (`firstDeath` latch, bounty, corpse cleanup) or it is not a reward, it is a
 * function nobody calls. Tuning arrives as imported constants so retuning a
 * blessing is not editing a test; the numbers written longhand below are the
 * ones a *probe* needs, and are deliberately not derived from the constant
 * they are checking.
 */

const api = buildTestApi();
const { Champion, Monster } = api.units;
const { DamageOverTime, Slow, StatAmp } = api.buffs;

type AnyBuff = InstanceType<typeof api.buffs.Buff>;
type ChampionInstance = InstanceType<typeof Champion>;

/** `deactivateBuff` marks; it does not splice. */
const live = (unit: { buffs: AnyBuff[] }): AnyBuff[] => unit.buffs.filter(buff => !buff.toRemove);

const named = (unit: { buffs: AnyBuff[] }, name: string): AnyBuff | undefined =>
  live(unit).find(buff => buff.name === name);

const champion = (game: TestGame, x: number, teamId: string): ChampionInstance =>
  new Champion({ game, position: createVector(x, 0), teamId } as never);

/** A camp standing on the origin, carrying the ability list under test. */
const camp = (game: TestGame, abilities: MonsterAbility[]) =>
  new Monster({
    game,
    preset: {
      name: 'Camp',
      avatar: 'monster_Blue_Sentinel',
      camp: { x: 0, y: -300, r: 100 },
      speed: 2,
      size: 80,
      attackRange: 50,
      reviveTime: 90_000,
      health: 300,
      abilities,
    },
  } as never);

/** Kill it the way a champion kills it, and hand back the corpse. */
const slay = (game: TestGame, abilities: MonsterAbility[], killer: { teamId: string }) => {
  const monster = camp(game, abilities);
  monster.takeDamage(9_999, killer as never);
  expect(monster.isDead, 'the camp survived the hit, so nothing was granted').toBe(true);
  return monster;
};

describe('the jungle blessings', () => {
  let game: TestGame;

  beforeEach(() => {
    installSpellObjectGlobals();
    installSketchMathGlobals();
    vi.stubGlobal('deltaTime', 16);
    game = createGame();
  });

  describe('Bùa Xanh', () => {
    it('hands the killer a blessing that ends on its own clock', () => {
      const killer = champion(game, 0, 'blue');
      game.setPlayer(killer);

      slay(game, makeBlueSentinelAbilities(api), killer);

      const blessing = named(killer, BLUE_BUFF.name);
      expect(blessing, 'the killer got no blessing at all').toBeTruthy();
      expect(blessing!.duration).toBe(BLUE_BUFF.durationMs);
      expect(blessing).toBeInstanceOf(StatAmp);
    });

    it('multiplies the killer’s mana regeneration', () => {
      const killer = champion(game, 0, 'blue');
      game.setPlayer(killer);
      const before = killer.stats.manaRegen.value;

      slay(game, makeBlueSentinelAbilities(api), killer);

      expect(killer.stats.manaRegen.value).toBeGreaterThan(before);
    });

    it('refunds a share of the pool the moment the camp falls', () => {
      const killer = champion(game, 0, 'blue');
      game.setPlayer(killer);
      const refund = vi.spyOn(killer, 'restoreMana');

      slay(game, makeBlueSentinelAbilities(api), killer);

      expect(refund).toHaveBeenCalledTimes(1);
      // 500 is the engine's own starting pool; a quarter of it is 125.
      expect(refund.mock.calls[0][0]).toBeCloseTo(
        killer.stats.maxMana.value * BLUE_BUFF.instantManaPercent
      );
    });

    it('burns ability cooldowns faster than the clock does', () => {
      const killer = champion(game, 0, 'blue');
      game.setPlayer(killer);
      const ability = { currentCooldown: 1_000 };
      killer.spells.push(ability as never);

      slay(game, makeBlueSentinelAbilities(api), killer);
      const blessing = named(killer, BLUE_BUFF.name)!;

      vi.stubGlobal('deltaTime', 100);
      blessing.update();

      // The spell's own countdown is untouched — this is the *extra* burn the
      // blessing adds on top of it, so 100ms of clock costs 100 * haste more.
      expect(ability.currentCooldown).toBeCloseTo(1_000 - 100 * BLUE_BUFF.cooldownHaste);
    });

    it('never runs a cooldown below zero', () => {
      const killer = champion(game, 0, 'blue');
      game.setPlayer(killer);
      const ability = { currentCooldown: 5 };
      killer.spells.push(ability as never);

      slay(game, makeBlueSentinelAbilities(api), killer);
      const blessing = named(killer, BLUE_BUFF.name)!;

      vi.stubGlobal('deltaTime', 10_000);
      blessing.update();

      expect(ability.currentCooldown).toBe(0);
    });

    it('blesses nobody when a minion lands the last hit', () => {
      const minion = new api.units.AttackableUnit({
        game,
        position: createVector(60, 0),
        teamId: 'blue',
      } as never);

      slay(game, makeBlueSentinelAbilities(api), minion);

      expect(live(minion)).toHaveLength(0);
    });

    it('is a reward, not a kit — the camp never casts it', () => {
      const abilities = makeBlueSentinelAbilities(api);
      const cast = vi.spyOn(abilities[0], 'cast');
      const killer = champion(game, 0, 'blue');
      game.setPlayer(killer);
      const monster = camp(game, abilities);
      monster.aggroOn(killer);

      // Standing on top of it, off cooldown: the only thing keeping the entry
      // out of `castAbility`'s reach is its declared range.
      killer.position.set(monster.position.x, monster.position.y);
      expect(monster.castAbility(killer)).toBe(false);
      expect(cast).not.toHaveBeenCalled();
    });
  });

  describe('Bùa Đỏ', () => {
    const brandFor = (killer: ChampionInstance): AnyBuff => named(killer, RED_BUFF.name)!;

    it('brands the killer rather than damaging anyone outright', () => {
      const killer = champion(game, 0, 'blue');
      game.setPlayer(killer);

      slay(game, makeRedBramblebackAbilities(api), killer);

      const brand = brandFor(killer);
      expect(brand, 'the killer carries no brand').toBeTruthy();
      expect(brand.duration).toBe(RED_BUFF.durationMs);
    });

    it('puts a burn and a slow on whatever the killer basic-attacks', () => {
      const killer = champion(game, 0, 'blue');
      const victim = champion(game, 120, 'red');
      game.setPlayer(killer);
      slay(game, makeRedBramblebackAbilities(api), killer);

      api.combat.applyOnHitEffects({
        attacker: killer,
        victim,
        damage: 10,
        ranged: false,
        crit: false,
        echo: false,
      });

      expect(live(victim).some(buff => buff instanceof DamageOverTime)).toBe(true);
      const slow = live(victim).find(buff => buff instanceof Slow) as InstanceType<typeof Slow>;
      expect(slow, 'nothing slowed the victim').toBeTruthy();
      expect(slow.percent).toBe(RED_BUFF.slowPercent);
    });

    it('renews one slow instead of stacking ten deep', () => {
      const killer = champion(game, 0, 'blue');
      const victim = champion(game, 120, 'red');
      game.setPlayer(killer);
      slay(game, makeRedBramblebackAbilities(api), killer);

      const swing = () =>
        api.combat.applyOnHitEffects({
          attacker: killer,
          victim,
          damage: 10,
          ranged: false,
          crit: false,
          echo: false,
        });
      for (let i = 0; i < 12; i++) swing();

      expect(live(victim).filter(buff => buff instanceof Slow)).toHaveLength(1);
      expect(live(victim).filter(buff => buff instanceof DamageOverTime)).toHaveLength(1);
    });

    it('names itself on the damage it deals, so the recap can group it', () => {
      const killer = champion(game, 0, 'blue');
      const victim = champion(game, 120, 'red');
      game.setPlayer(killer);
      slay(game, makeRedBramblebackAbilities(api), killer);

      api.combat.applyOnHitEffects({
        attacker: killer,
        victim,
        damage: 10,
        ranged: false,
        crit: false,
        echo: false,
      });
      const burn = live(victim).find(buff => buff instanceof DamageOverTime)!;

      const hurt = vi.spyOn(victim, 'takeDamage');
      vi.stubGlobal('deltaTime', RED_BUFF.burnTickMs);
      burn.update();

      expect(hurt).toHaveBeenCalledTimes(1);
      const [, attacker, type, label] = hurt.mock.calls[0];
      expect(attacker).toBe(killer);
      expect(type).toBe('TRUE');
      expect(label).toBe(RED_BUFF.name);
    });

    it('leaves an echoed application alone — the brand is the swing’s, not the proc’s', () => {
      const killer = champion(game, 0, 'blue');
      const victim = champion(game, 120, 'red');
      game.setPlayer(killer);
      slay(game, makeRedBramblebackAbilities(api), killer);

      api.combat.applyOnHitEffects({
        attacker: killer,
        victim,
        damage: 10,
        ranged: false,
        crit: false,
        echo: true,
      });

      expect(live(victim)).toHaveLength(0);
    });
  });

  describe('Bùa Baron', () => {
    it('blesses every living champion on the killer’s side', () => {
      const killer = champion(game, 0, 'blue');
      const ally = champion(game, 120, 'blue');
      const enemy = champion(game, 240, 'red');
      game.setPlayer(killer);
      indexObjects(game, [killer, ally, enemy]);

      slay(game, [makeBaronBlessing(api)], killer);

      expect(named(killer, BARON_BUFF.name), 'the killer went unblessed').toBeTruthy();
      expect(named(ally, BARON_BUFF.name), 'the ally went unblessed').toBeTruthy();
      expect(named(enemy, BARON_BUFF.name), 'the enemy was blessed').toBeFalsy();
    });

    it('grants attack damage, a bigger pool and regeneration together', () => {
      const killer = champion(game, 0, 'blue');
      game.setPlayer(killer);
      indexObjects(game, [killer]);
      const attack = killer.stats.attackDamage.value;
      const pool = killer.stats.maxMana.value;
      const regen = killer.stats.healthRegen.value;

      slay(game, [makeBaronBlessing(api)], killer);

      expect(killer.stats.attackDamage.value).toBeGreaterThan(attack);
      expect(killer.stats.maxMana.value).toBeGreaterThan(pool);
      expect(killer.stats.healthRegen.value).toBeGreaterThan(regen);
      expect(named(killer, BARON_BUFF.name)!.duration).toBe(BARON_BUFF.durationMs);
    });

    it('skips a dead ally rather than blessing a corpse', () => {
      const killer = champion(game, 0, 'blue');
      const fallen = champion(game, 120, 'blue');
      const enemy = champion(game, 240, 'red');
      game.setPlayer(killer);
      fallen.takeDamage(9_999, enemy);
      expect(fallen.isDead, 'the ally is not actually dead').toBe(true);
      indexObjects(game, [killer, fallen, enemy]);

      slay(game, [makeBaronBlessing(api)], killer);

      expect(named(fallen, BARON_BUFF.name)).toBeFalsy();
    });
  });
});
