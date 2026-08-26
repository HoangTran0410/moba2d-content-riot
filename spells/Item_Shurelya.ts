import type { AttackableUnit, CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const Speedup = api.buffs.Speedup;
const SpellObject = api.SpellObject;
const Champion = api.units.Champion;
const PredefinedFilters = api.combat.PredefinedFilters;

/**
 * Khúc Ca Shurelya's active: everyone runs.
 *
 * The other half of Vòng Sắt Mặt Trời's idea — one is bought to survive a
 * fight you are already in, this one is bought to start one or to leave one.
 * Both reach the same set of people, and `alliedChampionsAround` below is that
 * set, stated once and imported by the other file, because two buttons that
 * both mean "and everyone with me" must not disagree about who that is.
 */

export const SHURELYA_SPEED_PERCENT = 0.35;

export const SHURELYA_DURATION_MS = 3_000;

export const SHURELYA_RADIUS = 300;

/** Off the ability ceiling on purpose — see `Item_Ghostblade.ts`'s own note. */
export const SHURELYA_COOLDOWN_MS = 55_000;

export const SHURELYA_STACK_ID = 'item_shurelya_haste';

/** How long the banner's sweep stays on screen. */
export const BANNER_MS = 620;

// A cool green: this is movement, not damage, and it must not read as a heal
// (which is the one green the combat text already owns) — so it is drawn as
// chevrons rather than as a bloom, and never floats a number.
const BATTLESONG: [number, number, number] = [120, 235, 175];

/**
 * Allied **champions** within `radius` of `unit`, excluding `unit` itself.
 *
 * Champions rather than every allied body: a wave of minions is not who either
 * of these buttons is for, and shielding six of them would spend the whole
 * effect on things that die anyway. Not vision-gated — an ally standing in
 * your own bush is exactly who you are pressing it for, and vision gates
 * acquisition of *enemies*, never a friendly buff.
 */
export function alliedChampionsAround(unit: AttackableUnit, radius: number): AttackableUnit[] {
  const found = unit.game.objectManager.queryObjects({
    area: new api.utils.Quadtree.Circle({ x: unit.position.x, y: unit.position.y, r: radius }),
    filters: [
      PredefinedFilters.type(Champion),
      PredefinedFilters.teamId(unit.teamId),
      PredefinedFilters.excludeDead,
    ],
  }) as AttackableUnit[];

  const out: AttackableUnit[] = [];
  for (const ally of found) {
    if (ally === unit || ally.toRemove) continue;
    out.push(ally);
  }
  return out;
}

export default class Item_Shurelya extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_shurelyas_battlesong');
  name = 'Khúc Ca Shurelya (Item_Shurelya)';
  description =
    `Kích hoạt: <span class="buff">tăng ${SHURELYA_SPEED_PERCENT * 100}% tốc chạy</span> cho bản` +
    ` thân và các đồng minh xung quanh trong` +
    ` <span class="time">${SHURELYA_DURATION_MS / 1000} giây</span>`;
  coolDown = SHURELYA_COOLDOWN_MS;
  manaCost = 0;

  get castSpec(): CastSpec {
    return {
      activation: 'PRESS',
      targeting: 'SELF',
      castTimeMs: 0,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'start', durationMs: this.coolDown },
    };
  }

  onSpellCast() {
    const marching: AttackableUnit[] = [
      this.owner,
      ...alliedChampionsAround(this.owner, SHURELYA_RADIUS),
    ];

    for (const ally of marching) {
      const haste = new Speedup(SHURELYA_DURATION_MS, this.owner, ally);
      haste.name = 'Khúc Ca Shurelya';
      // Its own slot: Kiếm Ma Youmuu is the other item in this shop that
      // hastes, and one evicting the other would make buying both a downgrade.
      haste.stackId = SHURELYA_STACK_ID;
      haste.percent = SHURELYA_SPEED_PERCENT;
      haste.image = this.image;
      ally.addBuff(haste);
    }

    this.game.objectManager.addObject(new Item_Shurelya_Banner(this.owner, marching));
  }
}

/**
 * The sweep: a ring at the radius that was actually reached, and a forward
 * chevron on each body that got it.
 *
 * The chevrons point the way the champion is facing rather than outward from
 * the presser — the buff is "you may now run", and art that fans out from a
 * centre would be telling the player about a shockwave that did not happen.
 */
export class Item_Shurelya_Banner extends SpellObject {
  age = 0;
  marching: AttackableUnit[];

  constructor(owner: AttackableUnit, marching: AttackableUnit[]) {
    super(owner);
    this.marching = marching;
    this.position = owner.position.copy();
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= BANNER_MS) this.toRemove = true;
    this.position.set(this.owner.position.x, this.owner.position.y);
  }

  draw(): void {
    const t = constrain(this.age / BANNER_MS, 0, 1);
    const grown = 1 - (1 - t) * (1 - t);
    const fade = 1 - t * t;
    const [r, g, b] = BATTLESONG;

    push();
    noFill();
    stroke(r, g, b, 190 * fade);
    strokeWeight(3);
    circle(this.position.x, this.position.y, SHURELYA_RADIUS * 2 * grown);

    for (const ally of this.marching) {
      const heading = Math.atan2(
        ally.destination.y - ally.position.y,
        ally.destination.x - ally.position.x
      );
      const reach = ally.animatedValues.displaySize / 2 + 10;
      push();
      translate(ally.position.x, ally.position.y);
      rotate(heading);
      stroke(r, g, b, 235 * fade);
      strokeWeight(3);
      for (let i = 0; i < 2; i++) {
        const forward = reach + i * 9;
        line(forward - 9, -8, forward, 0);
        line(forward - 9, 8, forward, 0);
      }
      pop();
    }
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox((SHURELYA_RADIUS + 60) * 2);
  }
}
