import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Circle = api.utils.Quadtree.Circle;
const effectiveRange = api.combat.Reach.effectiveRange;
const PredefinedFilters = api.combat.PredefinedFilters;
const Spell = api.Spell;
const Speedup = api.buffs.Speedup;
const SpellObject = api.SpellObject;
const PredefinedParticleSystems = api.helpers.PredefinedParticleSystems;

const SPEEDUP_TIME = 3000;

const SPEEDUP_PERCENT = 0.5;

/** A share of each ally's *own* pool, so it is worth the same to all of them. */
export const HEAL_PERCENT = 0.3;

/**
 * How far the blessing reaches.
 *
 * Heal was self-only, which is not what the summoner spell is: the League
 * version picks up an ally as well, and the thing it is *for* is the moment a
 * team is being collapsed on together. Self-only made it a worse Barrier with
 * a longer cooldown, and made the one summoner spell whose whole point is
 * grouping into the one that rewarded standing apart.
 *
 * A radius rather than League's single named ally, because this game has no
 * ally-targeting mode and inventing one for a summoner spell would be a much
 * larger change than the ability is worth. It also reads better in a 2D top-down
 * fight, where "everyone in the circle" is something a player can see.
 */
export const HEAL_RADIUS = 500;


export default class Heal extends Spell {
  targetingMode = 'SELF' as const;
  name = 'Hồi Máu (Heal)';
  image = api.asset('spell_heal');
  description =
    `<span class="buff">Hồi máu</span> cho <b>mọi đồng minh</b> trong bán kính` +
    ` <span>${HEAL_RADIUS}px</span> (kể cả bản thân) một lượng bằng` +
    ` <span class="heal">${pct(HEAL_PERCENT)}% máu tối đa của chính họ</span>, và cho tất cả` +
    ` <span class="buff">Tăng Tốc ${pct(SPEEDUP_PERCENT)}%</span> trong` +
    ` <span class="time">${secs(SPEEDUP_TIME)} giây</span>`;
  coolDown = 10000;
  manaCost = 100;

  range = HEAL_RADIUS;

  onSpellCast() {
    for (const ally of this.alliesInRange()) this.bless(ally);
  }

  /**
   * Everyone it reaches, the caster included.
   *
   * `queryObjects` answers with what the quadtree holds, and the caster is in
   * it — but a self-cast standing alone in a corner is the one case that has to
   * work no matter what the tree says, so the caster is added by hand and
   * de-duplicated rather than trusted to be found.
   */
  private alliesInRange(): AttackableUnit[] {
    const found = this.game.objectManager.queryObjects({
      area: new Circle({
        x: this.owner.position.x,
        y: this.owner.position.y,
        r: effectiveRange(this.range, this.owner),
      }),
      filters: [
        PredefinedFilters.type(api.units.AttackableUnit),
        PredefinedFilters.teamId(this.owner.teamId),
        PredefinedFilters.excludeDead,
      ],
    }) as AttackableUnit[];

    const blessed = new Set<AttackableUnit>(found);
    if (!this.owner.isDead) blessed.add(this.owner);
    return [...blessed];
  }

  private bless(ally: AttackableUnit): void {
    // A share of *their* maximum, not of Lee Sin's or of the caster's: the
    // point of a percentage heal is that it is worth the same to the tank and
    // to the carry.
    ally.takeHeal(ally.stats.maxHealth.value * HEAL_PERCENT, this.owner);

    const speedBuff = new Speedup(SPEEDUP_TIME, this.owner, ally);
    speedBuff.image = this.image;
    speedBuff.percent = SPEEDUP_PERCENT;
    speedBuff.stackId = 'summoner_heal_speed';
    ally.addBuff(speedBuff);

    const healObject = new Heal_Object(this.owner);
    healObject.follow = ally;
    healObject.attachTo(ally);
    healObject.position = ally.position.copy();
    this.game.objectManager.addObject(healObject);
  }

  drawPreview() {
    super.drawPreview(effectiveRange(this.range, this.owner));
  }
}


export class Heal_Object extends SpellObject {
  age = 0;
  lifeTime = 1000;
  /** Whoever this bloom is riding — one per blessed ally, not one per cast. */
  follow: AttackableUnit | null = null;

  particleSystem = PredefinedParticleSystems.heal();

  onAdded() {
    this.game.objectManager.addObject(this.particleSystem);
  }

  update() {
    if (this.dropIfAttachmentLost()) return;

    this.age += deltaTime;
    if (this.age > this.lifeTime) this.toRemove = true;

    const host = this.follow ?? this.owner;
    this.position.set(host.position.x, host.position.y);

    if (random() < 0.15) {
      let size = host.stats.size.value / 2;
      this.particleSystem.addParticle({
        x: host.position.x + random(-size, size),
        y: host.position.y + random(-size, size),
      } as any);
    }
  }
}
