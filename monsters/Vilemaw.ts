import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type { MonsterAbility } from '@moba2d/core/content/types';
import { beneficiary, blessing, drawBlessingRing, teamOf } from './JungleBuffs';

/**
 * Vilemaw — a boss for Twisted Treeline, built to be swapped in where Baron
 * would otherwise stand.
 *
 * ## `fills: ['vilemaw']`, and deliberately **not** `'baron'`
 *
 * Adding `'baron'` to its `fills` looks convenient and is a trap.
 * `preset.ts`'s `monsterFillingSlot` takes `monstersFilling(role)[0]` and
 * install order decides the winner, so a Vilemaw that also filled `baron`
 * could take over Summoner's Rift's own Baron pit — a boss silently replaced
 * on a map nobody was editing. One role, and the map that wants it says so.
 *
 * ## The kit is not Baron's
 *
 * Baron is a rooted boss whose whole pressure is *area*: spit, slam, pool.
 * Vilemaw's is **position** — it drags you into the pit and then punishes the
 * ground you are standing on. Same fight length, opposite mistake: you lose
 * to Baron by standing in things, and to Vilemaw by standing too close to the
 * edge to begin with.
 */

type ChampionInstance = InstanceType<ContentApi['units']['Champion']>;
type AttackableUnitInstance = InstanceType<ContentApi['units']['AttackableUnit']>;

export const VILEMAW = {
  name: 'Vilemaw',
  blessingName: 'Bùa Vilemaw',
  /** Same 60s ceiling the other new objectives observe. */
  reviveTime: 60_000,
  /** Long, finite, and read against the respawn — see `Dragon.ts`'s header. */
  durationMs: 180_000,
  stackId: 'vilemaw-blessing',
  blessing: { attackDamage: 7, abilityPower: 0.1, healthRegen: 0.05 },
} as const;

export const WEB = {
  name: 'Tơ Kéo',
  cooldownMs: 7_000,
  /** Reaches well past the bite, which is the point of it. */
  range: 520,
  /** How close to the pit you end up. */
  landing: 150,
  dashSpeed: 16,
  damage: 8,
} as const;

export const VENOM = {
  name: 'Nọc Độc',
  cooldownMs: 9_000,
  range: 300,
  radius: 190,
  durationMs: 4_000,
  tickEveryMs: 500,
  damagePerTick: 4,
} as const;

const VENOM_GREEN: [number, number, number] = [140, 230, 110];
const VOID_PINK: [number, number, number] = [230, 110, 160];

/**
 * The pool Vilemaw spits under whoever it just yanked.
 *
 * Its own `SpellObject`, not something drawn from the boss: 190px of pool
 * around a 100px body reaches well past it, and an effect drawn from a culled
 * caster disappears while its damage keeps landing.
 */
export function makeVenomPool(api: ContentApi) {
  return class VenomPool extends api.AreaSpellObject {
    zIndex = api.layers.GROUND_Z_INDEX;

    constructor(owner: AttackableUnitInstance, center: { x: number; y: number }) {
      super(owner, center, VENOM.radius, {
        durationMs: VENOM.durationMs,
        tickEveryMs: VENOM.tickEveryMs,
        candidateFilter: (target: AttackableUnitInstance) =>
          target instanceof api.units.Champion,
        onTick: (target: AttackableUnitInstance) => {
          target.takeDamage(VENOM.damagePerTick, owner);
        },
      });
    }

    draw(): void {
      const { x, y } = this.center;
      const left = 1 - Math.min(1, this.elapsedMs / VENOM.durationMs);
      push();
      noStroke();
      fill(VENOM_GREEN[0], VENOM_GREEN[1], VENOM_GREEN[2], 60 * left);
      circle(x, y, this.radius * 2);
      fill(VENOM_GREEN[0], VENOM_GREEN[1], VENOM_GREEN[2], 90 * left);
      circle(x, y, this.radius * 1.3);
      pop();
    }
  };
}

/** The blessing, on `BARON_BUFF`'s shape with its own numbers. */
export function makeVilemawBuff(api: ContentApi) {
  return class VilemawBuff extends api.buffs.StatAmp {
    name = VILEMAW.blessingName;
    stackId = VILEMAW.stackId;
    image = api.asset('monster_Vilemaw');
    buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
    bonuses: InstanceType<ContentApi['buffs']['StatAmp']>['bonuses'] = {
      attackDamage: { flatBonus: VILEMAW.blessing.attackDamage },
      abilityPower: { flatBonus: VILEMAW.blessing.abilityPower },
      healthRegen: { flatBonus: VILEMAW.blessing.healthRegen },
    };

    draw(): void {
      drawBlessingRing(this.targetUnit, VOID_PINK, 8);
    }
  };
}

export default function makeVilemawAbilities(api: ContentApi): MonsterAbility[] {
  const VenomPool = makeVenomPool(api);
  const VilemawBuff = makeVilemawBuff(api);

  return [
    {
      name: WEB.name,
      cooldownMs: WEB.cooldownMs,
      range: WEB.range,
      cast(monster, target) {
        // A displacement applied *by someone else*, so it constructs a `Dash`
        // directly rather than asking `Dash.CanDash` — that gate is about a
        // unit dashing under its own power, and being yanked is not that.
        // Grounding still blocks it, through `Dash`'s own backstop.
        const from = monster.position;
        const to = target.position;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.hypot(dx, dy) || 1;
        const landing = createVector(
          from.x + (dx / distance) * WEB.landing,
          from.y + (dy / distance) * WEB.landing
        );

        const pull = new api.buffs.Dash(1_200, monster, target);
        pull.dashDestination = landing;
        pull.dashSpeed = WEB.dashSpeed;
        target.addBuff(pull);
        target.takeDamage(WEB.damage, monster);
      },
    },
    {
      name: VENOM.name,
      cooldownMs: VENOM.cooldownMs,
      range: VENOM.range,
      cast(monster, target) {
        const game = monster.game;
        if (!game?.objectManager?.addObject) return;
        game.objectManager.addObject(
          new VenomPool(monster, { x: target.position.x, y: target.position.y })
        );
      },
    },
    blessing(VILEMAW.blessingName, killer => {
      const champion: ChampionInstance | null = beneficiary(api, killer);
      if (!champion) return;
      for (const ally of teamOf(api, champion)) {
        ally.addBuff(new VilemawBuff(VILEMAW.durationMs, champion, ally));
      }
    }),
  ];
}
