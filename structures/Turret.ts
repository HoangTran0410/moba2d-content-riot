import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type { TurretPassive } from '@moba2d/core/content/types';

/**
 * What a tower is built carrying.
 *
 * The source game's turrets are not a health bar with a gun. They have named
 * passives — an armour-piercing ramp that punishes standing under one, a floor
 * that makes diving without a wave pointless, and true sight over the lane —
 * and this pack writes all three as **real buffs on the turret** rather than as
 * branches inside core's `Turret` class. That is the whole point of the
 * `turretPassives` slot: a pack that wants a plain tower declares none, and
 * this pack's idea of a tower is this pack's.
 *
 * What is *not* here, deliberately: which body a turret shoots first, and how
 * far it will answer for an ally under attack. Those are rules about how the
 * engine picks a target — `Turret.LADDER` and `TURRET_DEFEND_RANGE_RATIO` in
 * core — not passives, and a pack that could redefine them would be a pack
 * that changes what "a turret" means for everybody who plays against it.
 *
 * ## Ranges are ratios, never the wiki's numbers
 *
 * The source game's turret reaches 775 units and defends an ally to 1400.
 * This canvas is pixels and its towers reach 430. So every radius below is
 * written as *its share of the turret's own reach*, which is scale-free and
 * survives a map that widens `attackRange` — a copied 775 would be a tower
 * that watches three screens on one map and half a lane on another.
 */

/**
 * The eye sees exactly as far as the tower shoots.
 *
 * The wiki's ring is wider than the reach (1100 against 775), and that is the
 * one number here deliberately not carried over: vision the tower cannot
 * punish is vision it hands to whoever walks the edge of it, and on a canvas
 * this size the wider ring reached most of the way to the next tower. Revealing
 * only what it can shoot keeps the passive readable — if you are lit up, you
 * are already being hit.
 */
const WARDENS_EYE_RATIO = 1;
/** Wiki: minions within roughly a wave's standing distance switch the floor off. */
const REINFORCED_MINION_RATIO = 1;

/** Ohmwrecker: 30% armour penetration, and the ramp against champions. */
export const TURRET_ARMOR_PENETRATION = 0.3;
export const WARMING_UP_PER_STACK = 0.5;
export const WARMING_UP_MAX_STACKS = 3;
export const WARMING_UP_RESET_MS = 5_000;

/** Reinforced Armor: what is left of a hit while the lane is empty. */
export const REINFORCED_ARMOR_TAKEN = 0.2;
export const REINFORCED_REARM_MS = 3_000;

/** How often the eye sweeps for anything hiding. Not every frame; nothing moves that fast. */
const EYE_SWEEP_MS = 250;

/**
 * The half of a turret these passives read.
 *
 * `Buff.targetUnit` is an `AttackableUnit` — the base every buff is written
 * against — and `attackRange` is a turret's own. Named once here rather than
 * cast twice inline, so the two radius calculations below cannot drift into
 * asking different questions.
 */
type TurretBody = InstanceType<ContentApi['units']['AttackableUnit']> & { attackRange: number };

export default function makeTurretPassives(api: ContentApi): TurretPassive[] {
  const Buff = api.buffs.Buff;
  const StatAmp = api.buffs.StatAmp;
  const { AttackableUnit, Champion, Minion } = api.units;
  const filters = api.combat.PredefinedFilters;
  const Circle = api.utils.Quadtree.Circle;

  /**
   * Ohmwrecker — the tower gets angrier the longer you stand under it.
   *
   * The ramp is a separate `StatAmp` swapped out on each change rather than a
   * number mutated in place: `Stats` reads its modifiers when they are added
   * and removed, so editing a live bonus object is a change nothing recomputes.
   */
  class TurretWarmingUp extends Buff {
    name = 'Nòng Nóng Dần';
    description =
      'Mỗi đòn trúng tướng khiến trụ mạnh thêm <span class="buff">50%</span>, ' +
      'tối đa <span class="buff">150%</span>. Hết cộng dồn sau ' +
      '<span class="time">5 giây</span> không đánh trúng tướng nào.';
    hudVisible = false;

    private warmth = 0;
    private sinceHit = 0;
    private ramp: InstanceType<typeof StatAmp> | null = null;

    onDamageDealt(_swung: number, _landed: number, victim: unknown): void {
      if (!(victim instanceof Champion)) return;
      this.sinceHit = 0;
      if (this.warmth >= WARMING_UP_MAX_STACKS) return;
      this.warmth += 1;
      this.applyRamp();
    }

    onUpdate(): void {
      if (this.warmth === 0) return;
      this.sinceHit += deltaTime;
      if (this.sinceHit < WARMING_UP_RESET_MS) return;
      // All of it at once, the way the source game drops it: the tower cools
      // down, it does not step down.
      this.warmth = 0;
      this.applyRamp();
    }

    private applyRamp(): void {
      // `deactivateBuff`, not `toRemove`: the flag only marks a buff for the
      // sweep, while `onDeactivate` is what takes the modifier back off the
      // stats. Setting the flag alone left the ramp applied for ever.
      if (this.ramp) this.ramp.deactivateBuff();
      this.ramp = null;
      if (this.warmth === 0) return;
      const ramp = new StatAmp(0, this.targetUnit, this.targetUnit);
      ramp.name = 'Nòng Nóng Dần';
      ramp.stackId = 'lol_turret_warming_up_ramp';
      ramp.hudVisible = false;
      ramp.bonuses = { attackDamage: { percentBonus: WARMING_UP_PER_STACK * this.warmth } };
      this.targetUnit.addBuff(ramp);
      this.ramp = ramp;
    }
  }

  /**
   * Reinforced Armor — a tower alone in its lane is not a health bar you can
   * chew through, it is a wall. Bring a wave or bring nothing.
   *
   * The delay on the way *back* is what makes shoving a wave in worth doing:
   * the floor does not snap on the instant the last minion dies.
   */
  class TurretReinforcedArmor extends Buff {
    name = 'Giáp Cường Hóa';
    description =
      'Khi không có lính địch bên cạnh, trụ chỉ nhận ' +
      '<span class="buff">20%</span> sát thương. Bật lại sau ' +
      '<span class="time">3 giây</span> kể từ khi lính địch cuối cùng rời đi.';
    hudVisible = false;

    private rearmMs = 0;

    onUpdate(): void {
      if (this.enemyMinionsNear()) this.rearmMs = REINFORCED_REARM_MS;
      else if (this.rearmMs > 0) this.rearmMs -= deltaTime;
    }

    modifyIncomingDamage(damage: number): number {
      return this.rearmMs > 0 ? damage : damage * REINFORCED_ARMOR_TAKEN;
    }

    private enemyMinionsNear(): boolean {
      const turret = this.targetUnit as TurretBody;
      const game = turret.game;
      if (!game?.objectManager) return true; // no world to ask: never a free wall
      const found = game.objectManager.queryObjects({
        area: new Circle({
          x: turret.position.x,
          y: turret.position.y,
          r: turret.attackRange * REINFORCED_MINION_RATIO,
        }),
        filters: [
          filters.type(Minion),
          filters.excludeDead,
          (unit: { teamId?: string }) => unit.teamId !== turret.teamId,
        ],
      });
      return found.length > 0;
    }
  }

  /**
   * Warden's Eye — nothing hides in a lane a tower is watching.
   *
   * Swept rather than continuous: it re-reveals every quarter second, and each
   * reveal outlives the sweep, so a unit that steps out is dark again a beat
   * later rather than the frame after.
   */
  class TurretWardensEye extends Buff {
    name = 'Mắt Thần Canh Gác';
    description =
      'Trụ có <span class="buff">Mắt Thần</span> quanh mình — không gì ẩn mình ' +
      'được trong tầm của nó.';
    hudVisible = false;

    private sinceSweep = EYE_SWEEP_MS;

    onUpdate(): void {
      this.sinceSweep += deltaTime;
      if (this.sinceSweep < EYE_SWEEP_MS) return;
      this.sinceSweep = 0;

      const turret = this.targetUnit as TurretBody;
      const game = turret.game;
      if (!game?.objectManager) return;

      // Narrowed to bodies: `queryObjects` answers with `GameObject`s, and a
      // particle system has no `addBuff` to reveal it with.
      const hiding = game.objectManager.queryObjects({
        area: new Circle({
          x: turret.position.x,
          y: turret.position.y,
          r: turret.attackRange * WARDENS_EYE_RATIO,
        }),
        filters: [
          filters.type(AttackableUnit),
          filters.excludeDead,
          (unit: { teamId?: string; isStealthed?: boolean }) =>
            unit.teamId !== turret.teamId && unit.isStealthed === true,
        ],
      }) as TurretBody[];

      for (const unit of hiding) {
        unit.addBuff(
          api.buffs.createReveal({
            stackId: 'lol_turret_wardens_eye',
            durationMs: EYE_SWEEP_MS * 2,
            source: turret,
            target: unit,
          })
        );
      }
    }
  }

  return [
    {
      name: 'Ohmwrecker',
      onSpawn(turret) {
        const pierce = new StatAmp(0, turret, turret);
        pierce.name = 'Xuyên Giáp Trụ';
        pierce.stackId = 'lol_turret_armor_pen';
        pierce.hudVisible = false;
        pierce.bonuses = { armorPenetration: { baseBonus: TURRET_ARMOR_PENETRATION } };
        turret.addBuff(pierce);

        const warming = new TurretWarmingUp(0, turret, turret);
        warming.stackId = 'lol_turret_warming_up';
        turret.addBuff(warming);
      },
    },
    {
      name: 'Reinforced Armor',
      onSpawn(turret) {
        const wall = new TurretReinforcedArmor(0, turret, turret);
        wall.stackId = 'lol_turret_reinforced_armor';
        turret.addBuff(wall);
      },
    },
    {
      name: "Warden's Eye",
      onSpawn(turret) {
        const eye = new TurretWardensEye(0, turret, turret);
        eye.stackId = 'lol_turret_wardens_eye_aura';
        turret.addBuff(eye);
      },
    },
  ];
}
