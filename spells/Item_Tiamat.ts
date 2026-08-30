import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const AoePulse = api.AoePulse;
const AttackableUnit = api.units.AttackableUnit;
const { PredefinedFilters } = api.combat;
const Circle = api.utils.Quadtree.Circle;

/**
 * Rìu Tiamat — the cleave component, and the base class of both hydras.
 *
 * The mechanic, stated once: **every basic attack also carves everything
 * standing near the victim**, physical, at a fraction the subclass sets. The
 * splash is its own damage with its own type, never a re-application of
 * on-hit effects — LoL's rule too, and the difference matters here: Cuồng
 * Cung Runaan's bolts DO carry on-hits and are the propagator; a hydra is a
 * plain payload, so wearing both must not turn every cleave into a proc
 * storm. `hit.echo` applications still cleave (that is what being doubled by
 * a phantom hit means), which is safe for exactly that reason — a payload
 * cannot start a chain.
 */

/** How far past the victim the carve reaches. */
export const CLEAVE_RADIUS = 100;

/** Rìu Tiamat's own carve: this share of the wearer's attack damage. */
export const TIAMAT_AD_RATIO = 0.4;

const TIAMAT_STEEL: [number, number, number] = [225, 200, 150];

/** Structural: what the splash needs of a unit it hits. */
type SplashVictim = InstanceType<typeof AttackableUnit>;

/**
 * Both hydras subclass this and override `splashDamage()` — everything else
 * (the query, the friendly-fire rule, the sweep visual) is shared, so the two
 * items cannot drift into two different definitions of "near".
 */
export class CleaveBuff extends Buff {
  name = 'Rìu Tiamat';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // A permanent armed state: the inventory slot already shows the item, so
  // this stays off the HUD buff row and the overhead strip (Buff.hudVisible).
  hudVisible = false;

  sweepColor: [number, number, number] = TIAMAT_STEEL;

  onHit(hit: OnHitEvent): void {
    const wearer = this.targetUnit;
    const damage = this.splashDamage();
    if (damage <= 0) return;

    // Everything hostile and hittable around the victim, the victim itself
    // excluded — the swing already paid it. `canTakeDamageFromTeam` is the
    // same targetable-and-alive rule every spell's area damage uses, so a
    // stasis'd or untargetable body is passed over here exactly as it is
    // everywhere else.
    const near = this.game.objectManager.queryObjects({
      area: new Circle({
        x: hit.victim.position.x,
        y: hit.victim.position.y,
        r: CLEAVE_RADIUS,
      }),
      filters: [
        PredefinedFilters.canTakeDamageFromTeam(wearer.teamId),
        PredefinedFilters.excludeObjects([hit.victim, wearer]),
      ],
    }) as SplashVictim[];

    let carved = false;
    for (const unit of near) {
      unit.takeDamage(damage, wearer, 'PHYSICAL', 'Rìu Tiamat');
      carved = true;
    }
    // The ring says "this weapon carves an area" — but only when it carved
    // someone. An empty ring on every last-hit is noise the standard forbids.
    if (carved) this.showSweep(hit.victim);
  }

  /** What one carve is worth. Rìu Tiamat's own: a share of attack damage. */
  protected splashDamage(): number {
    return this.targetUnit.stats.attackDamage.value * TIAMAT_AD_RATIO;
  }

  private showSweep(center: { position: { copy(): unknown } }): void {
    const sweep = new AoePulse(this.targetUnit);
    sweep.position = center.position.copy() as typeof sweep.position;
    sweep.radius = CLEAVE_RADIUS;
    sweep.lifeTime = 240;
    sweep.color = [...this.sweepColor];
    sweep.fillAlpha = 26;
    this.game.objectManager.addObject(sweep);
  }
}

export default class Item_Tiamat extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_tiamat');
  name = 'Rìu Tiamat (Item_Tiamat)';
  description =
    `Nội tại: đòn đánh gây thêm sát thương vật lý bằng ${pct(TIAMAT_AD_RATIO)}% công` +
    ` lên các kẻ địch khác quanh mục tiêu`;
  coolDown = 0;
  manaCost = 0;

  get castSpec(): CastSpec {
    return {
      activation: 'PRESS',
      targeting: 'SELF',
      castTimeMs: 0,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'start', durationMs: 0 },
    };
  }

  onSpellCast() {
    const cleave = new CleaveBuff(0, this.owner, this.owner);
    cleave.stackId = 'item_cleave';
    cleave.image = this.image;
    cleave.sourceSpell = this;
    this.owner.addBuff(cleave);
  }
}
