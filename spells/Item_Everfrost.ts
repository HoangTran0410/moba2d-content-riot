import type { AttackableUnit, CastContext, CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const Root = api.buffs.Root;
const SpellObject = api.SpellObject;
const PredefinedFilters = api.combat.PredefinedFilters;

/**
 * Vĩnh Sương's active: the shop's first button that is a **skillshot**.
 *
 * Zhonya, Youmuu, Khăn Giải Thuật, Vòng Sắt Mặt Trời and Khúc Ca Shurelya all
 * fire at whoever pressed them and cannot miss. This one is aimed, it can
 * whiff, and what it buys when it lands is the one thing gold has never been
 * able to buy in this shop before: hard crowd control. A mage with no lockdown
 * in their kit can now buy some.
 *
 * The nova is a cone rather than a circle on purpose. A circle around the
 * presser would be strictly better than aiming and would need no skill to use;
 * the cone is what makes it a decision, and the art draws exactly the wedge the
 * root really uses so that decision is readable.
 */

export const EVERFROST_DAMAGE = 30;

export const EVERFROST_ROOT_MS = 1_200;

export const EVERFROST_RANGE = 380;

/** Half the cone's opening, in radians — about 40 degrees each side. */
export const EVERFROST_HALF_ANGLE = 0.7;

/** Off the ability ceiling on purpose — see `Item_Ghostblade.ts`'s own note. */
export const EVERFROST_COOLDOWN_MS = 40_000;

export const EVERFROST_STACK_ID = 'item_everfrost_root';

/** How long the wedge takes to sweep out to its full reach. */
export const NOVA_SWEEP_MS = 220;

/** And how long the frozen ground it leaves stays on screen. */
export const NOVA_LINGER_MS = 380;

// Deep arctic blue on a magic proc — cool hue, and the violet damage number
// beside it states the type.
const FROST_DEEP: [number, number, number] = [70, 140, 220];
const FROST_RIME: [number, number, number] = [200, 240, 255];

export default class Item_Everfrost extends Spell {
  image = api.asset('item_everfrost');
  name = 'Vĩnh Sương (Item_Everfrost)';
  description =
    `Kích hoạt: bắn ra một luồng băng gây` +
    ` <span class="damage magic">${EVERFROST_DAMAGE} sát thương phép</span> và` +
    ` <span class="buff">trói ${EVERFROST_ROOT_MS / 1000} giây</span> mọi kẻ địch trúng đòn`;
  coolDown = EVERFROST_COOLDOWN_MS;
  manaCost = 0;
  range = EVERFROST_RANGE;

  get castSpec(): CastSpec {
    return {
      activation: 'PRESS',
      targeting: 'DIRECTION',
      castTimeMs: 0,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'start', durationMs: this.coolDown },
    };
  }

  onSpellCast(context: CastContext) {
    // `aimPoint` rather than a raw cursor read: it is the convention every
    // aimed spell in this pack shares, and it is never (0,0).
    const { to } = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      this.range
    );
    const dx = to.x - this.owner.position.x;
    const dy = to.y - this.owner.position.y;
    const heading =
      dx === 0 && dy === 0 ? Math.atan2(context.direction.y, context.direction.x) : Math.atan2(dy, dx);

    this.game.objectManager.addObject(new Item_Everfrost_Nova(this.owner, heading));
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}

/**
 * The nova: a wedge that sweeps out from the caster to `EVERFROST_RANGE` and
 * then freezes the ground it covered.
 *
 * It detonates once, on the frame it is added, rather than damaging whoever
 * wanders into the wedge while the art plays — a root that landed half a
 * second after the flash would be a button that lies about when it hit. The
 * sweep is the *dissipation* of an instant effect, not the effect.
 */
export class Item_Everfrost_Nova extends SpellObject {
  age = 0;
  heading: number;
  /** Seeded once in `onAdded`; re-rolling per frame flickers instead of animating. */
  _shards: { along: number; across: number; size: number }[] = [];

  constructor(owner: AttackableUnit, heading: number) {
    super(owner);
    this.heading = heading;
    this.position = owner.position.copy();
    // **In the constructor, not `onAdded`.** The nova is instantaneous: the
    // frame the button is pressed is the frame it hits, and `onAdded` does not
    // run until `ObjectManager` promotes the object out of `_objectToBeAdd` on
    // its next tick — a whole frame later, during which the victim could have
    // walked out of a wedge the flash had already claimed them from.
    this.detonate();
  }

  onAdded(): void {
    for (let i = 0; i < 14; i++) {
      this._shards.push({
        along: random(0.2, 1),
        across: random(-1, 1),
        size: random(7, 17),
      });
    }
  }

  private detonate(): void {
    const origin = this.owner.position;
    const caught = this.owner.game.objectManager.queryObjects({
      area: new api.utils.Quadtree.Circle({ x: origin.x, y: origin.y, r: EVERFROST_RANGE }),
      filters: [PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const enemy of caught) {
      const offset = Math.atan2(enemy.position.y - origin.y, enemy.position.x - origin.x);
      // Wrapped into (-PI, PI] so a wedge straddling the -x axis is not a
      // wedge that silently covers everything except itself.
      let turn = offset - this.heading;
      while (turn > Math.PI) turn -= TWO_PI;
      while (turn < -Math.PI) turn += TWO_PI;
      if (Math.abs(turn) > EVERFROST_HALF_ANGLE) continue;

      enemy.takeDamage(EVERFROST_DAMAGE, this.owner, 'MAGIC');
      const root = new Root(EVERFROST_ROOT_MS, this.owner, enemy);
      root.name = 'Vĩnh Sương';
      root.stackId = EVERFROST_STACK_ID;
      enemy.addBuff(root);
    }
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= NOVA_SWEEP_MS + NOVA_LINGER_MS) this.toRemove = true;
  }

  draw(): void {
    const sweep = constrain(this.age / NOVA_SWEEP_MS, 0, 1);
    // Snap out: the wedge has to reach its true edge early enough to be read.
    const reach = EVERFROST_RANGE * (1 - (1 - sweep) * (1 - sweep));
    const fade =
      this.age <= NOVA_SWEEP_MS
        ? 1
        : 1 - constrain((this.age - NOVA_SWEEP_MS) / NOVA_LINGER_MS, 0, 1);

    push();
    translate(this.position.x, this.position.y);
    rotate(this.heading);

    // The wedge itself, drawn at exactly the angle and reach the root used —
    // the only layer that carries information, so it is the loudest.
    noStroke();
    fill(FROST_DEEP[0], FROST_DEEP[1], FROST_DEEP[2], 70 * fade);
    arc(0, 0, reach * 2, reach * 2, -EVERFROST_HALF_ANGLE, EVERFROST_HALF_ANGLE, PIE);
    noFill();
    stroke(FROST_RIME[0], FROST_RIME[1], FROST_RIME[2], 220 * fade);
    strokeWeight(3);
    arc(0, 0, reach * 2, reach * 2, -EVERFROST_HALF_ANGLE, EVERFROST_HALF_ANGLE);
    line(0, 0, cos(-EVERFROST_HALF_ANGLE) * reach, sin(-EVERFROST_HALF_ANGLE) * reach);
    line(0, 0, cos(EVERFROST_HALF_ANGLE) * reach, sin(EVERFROST_HALF_ANGLE) * reach);

    // Spikes thrown up out of the ground, in the wedge's own frame.
    stroke(FROST_RIME[0], FROST_RIME[1], FROST_RIME[2], 200 * fade);
    strokeWeight(2);
    for (const shard of this._shards) {
      const along = shard.along * reach;
      const across = shard.across * EVERFROST_HALF_ANGLE;
      const x = cos(across) * along;
      const y = sin(across) * along;
      line(x, y, x + shard.size * 0.4, y - shard.size);
    }
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox((EVERFROST_RANGE + 60) * 2);
  }
}
