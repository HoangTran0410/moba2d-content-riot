import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { secs } from '../text';

const Spell = api.Spell;
const Disarm = api.buffs.Disarm;
const AreaSpellObject = api.AreaSpellObject;
const AoePulse = api.AoePulse;
const BuffAddType = api.enums.BuffAddType;
const GROUND_Z_INDEX = api.layers.GROUND_Z_INDEX;

/**
 * Bảo Hộ Linh Hồn — the refuge, mapped honestly onto what this
 * engine actually has.
 *
 * The source ability *nullifies* enemy basic attacks aimed at anyone standing
 * in the zone. There is no attack-nullifying primitive here and inventing one
 * for a single spell would be a new combat rule nothing else in the pack obeys.
 * `Disarm` is the same outcome stated from the other end: the attacks simply do
 * not happen. It is the one substitution in Shen's kit that changes *whose*
 * state carries the effect — the victim's, not the protected ally's — and the
 * one place it is visible is a zone full of enemies who cannot swing at anyone
 * at all, rather than only at people inside. That is a strictly smaller shelter
 * than the wiki's for the ally standing on the edge of it, and a strictly
 * cleaner rule for everyone reading the fight.
 *
 * The zone re-applies the disarm every tick with a short tail rather than
 * handing out one long one, which is what makes "for as long as they stand in
 * it" true without a subscription: walk out, and the last application runs down
 * on its own. `RENEW_EXISTING` plus a `stackId` of its own is not optional
 * there — the default `REPLACE_EXISTING` would churn a fresh buff instance
 * twenty times a second.
 */

export const COOLDOWN_MS = 9_000;

export const MANA_COST = 40;

/** What the zone covers, and — see `draw` — exactly what it paints. */
export const ZONE_RADIUS = 170;

export const ZONE_DURATION_MS = 2_200;

/**
 * How long the disarm outlives the zone for a unit that leaves it. Short on
 * purpose: it is the grace of a re-application interval, not a debuff to kite
 * with.
 */
export const DISARM_TAIL_MS = 400;

/** Its own slot, so nothing else applying `Disarm` fights this for it. */
export const DISARM_STACK_ID = 'shen_w_disarm';

/** Fast enough that the tail is never visible as a gap. */
const TICK_EVERY_MS = 100;


export default class Shen_W extends Spell {
  // Auto-locks its own centre: the refuge is always Shen's own ground.
  targetingMode = 'SELF' as const;
  image = api.asset('spell_shen_w');
  name = 'Bảo Hộ Linh Hồn (Shen_W)';
  description =
    `Shen dựng một vùng linh hồn quanh mình trong` +
    ` <span class="buff">${secs(ZONE_DURATION_MS)} giây</span>, bán kính` +
    ` <span class="buff">${ZONE_RADIUS}</span>:` +
    ` <span class="debuff">kẻ địch đứng trong vùng không thể đánh thường</span>,` +
    ` và chỉ cầm lại được vũ khí <span class="buff">${secs(DISARM_TAIL_MS)} giây</span>` +
    ` sau khi rời khỏi vùng. Chúng vẫn đi lại và dùng chiêu thức bình thường —` +
    ` đây là chỗ trú, không phải là trói.`;
  coolDown = COOLDOWN_MS;
  manaCost = MANA_COST;

  range = ZONE_RADIUS;

  onSpellCast(): void {
    this.game.objectManager.addObject(new Shen_W_Zone(this.owner));
  }
}


/** Only living enemies; allies walk through the refuge untouched, as they should. */
const isRefugeEnemy = (owner: AttackableUnit, target: AttackableUnit): boolean =>
  target.teamId !== owner.teamId && target.targetable && !target.toRemove && !target.isDead;

/**
 * Renewed rather than replaced: the zone calls this ten times a second, and the
 * default `REPLACE_EXISTING` would deactivate and rebuild a buff instance on
 * every one of those frames.
 */
const holdWeapon = (owner: AttackableUnit, target: AttackableUnit): void => {
  const cuffs = new Disarm(DISARM_TAIL_MS, owner, target);
  cuffs.stackId = DISARM_STACK_ID;
  cuffs.buffAddType = BuffAddType.RENEW_EXISTING;
  target.addBuff(cuffs);
};

const pulseOn = (
  owner: AttackableUnit,
  target: AttackableUnit,
  radius: number,
  color: [number, number, number]
): void => {
  const ping = new AoePulse(owner);
  ping.position = target.position.copy();
  ping.radius = radius;
  ping.lifeTime = 260;
  ping.color = color;
  ping.fillAlpha = 26;
  owner.game.objectManager.addObject(ping);
};


export class Shen_W_Zone extends AreaSpellObject {
  // Ground art: it is a floor the fight stands on, not an effect over it.
  zIndex = GROUND_Z_INDEX;

  constructor(owner: AttackableUnit) {
    super(owner, owner.position.copy(), ZONE_RADIUS, {
      durationMs: ZONE_DURATION_MS,
      tickEveryMs: TICK_EVERY_MS,
      candidateFilter: target => isRefugeEnemy(owner, target),
      // Entering is the moment worth showing: a tight ring closing on the
      // newcomer, in the refuge's own cool blue.
      onEnter: target => {
        holdWeapon(owner, target);
        pulseOn(owner, target, 30, [150, 195, 245]);
      },
      onTick: target => holdWeapon(owner, target),
      // Leaving is the other moment worth showing, and it is not the same one:
      // a wider warm ring says the weapon is on its way back, which the
      // disarm's own struck-through ring — still up for the tail — does not.
      onExit: target => pulseOn(owner, target, 46, [235, 165, 95]),
    });
  }

  /**
   * A ward floor: a filled disc, its rim drawn at exactly `this.radius` — the
   * radius the disarm really uses — and four brackets turning slowly inward, so
   * the zone reads as a shelter facing its own centre rather than as a blast
   * pushing out of it. It grows in over the first fifth of its life rather than
   * appearing at full size, and dims as it runs down, so "how long is left" is
   * legible without a number.
   */
  draw(): void {
    const life = constrain(this.elapsedMs / ZONE_DURATION_MS, 0, 1);
    const opened = constrain(this.elapsedMs / (ZONE_DURATION_MS * 0.18), 0, 1);
    const grown = this.radius * (1 - (1 - opened) * (1 - opened));
    const alpha = 210 * (1 - life * life);
    const spin = this.elapsedMs / 900;
    const cx = this.center.x;
    const cy = this.center.y;

    push();
    noStroke();
    fill(70, 95, 140, alpha * 0.16);
    circle(cx, cy, grown * 2);

    noFill();
    stroke(160, 200, 245, alpha);
    strokeWeight(2.5);
    circle(cx, cy, grown * 2);

    stroke(220, 238, 255, alpha);
    strokeWeight(3.5);
    for (let i = 0; i < 4; i++) {
      const angle = spin + i * HALF_PI;
      arc(cx, cy, grown * 1.72, grown * 1.72, angle - 0.22, angle + 0.22);
    }
    pop();
  }
}
