import type { AttackableUnit, CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { alliedChampionsAround } from './Item_Shurelya';
import { pct, secs } from '../text';

const Spell = api.Spell;
const Shield = api.buffs.Shield;
const SpellObject = api.SpellObject;

/**
 * Vòng Sắt Mặt Trời's active — the shop's first button that does something for
 * **other people**.
 *
 * Every active in this pack before it is selfish by construction: Zhonya
 * freezes its own holder, Youmuu hastes its own holder, Khăn Giải Thuật
 * cleanses its own holder. This one is bought to be pressed at the moment a
 * teammate is about to die, and the whole design question is therefore *who it
 * reaches* — so it draws its radius honestly and puts a visible flare on every
 * body it actually covered, rather than a pretty bloom centred on the presser.
 *
 * The ally scan is shared with Khúc Ca Shurelya (`alliedChampionsAround`),
 * because two buttons that mean "and everyone standing with me" must not
 * disagree about who that is.
 */

/**
 * Each cover, as a share of that RECIPIENT's own maximum health — the tank
 * who walked in front gets a bigger wall than the mage behind, and the
 * button does not rot once late-game bars triple. ~30 on a mid-game body
 * (~165 máu), which is the flat number it replaced.
 */
export const LOCKET_SHIELD_PERCENT = 0.18;

export const LOCKET_SHIELD_MS = 2_500;

export const LOCKET_RADIUS = 260;

/** Down from 60s — see `Item_Ghostblade.ts`'s note on the practice room's 20s ceiling. */
export const LOCKET_COOLDOWN_MS = 15_000;

export const LOCKET_STACK_ID = 'item_locket_shield';

/** How long the dome stays up after the press. Purely the telegraph. */
export const DOME_MS = 520;

// Solari gold. A protective effect, so it reads warm and low-saturation —
// bright enough to find at minimum zoom, dim enough not to hide the fight it
// was pressed in the middle of.
const SOLARI: [number, number, number] = [255, 205, 120];

export default class Item_Locket extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_locket_of_the_iron_solari');
  name = 'Vòng Sắt Mặt Trời (Item_Locket)';
  description =
    `Kích hoạt: tạo <span class="buff">khiên bằng ${pct(LOCKET_SHIELD_PERCENT)}% máu tối đa</span> cho bản thân và các đồng` +
    ` minh xung quanh trong <span class="time">${secs(LOCKET_SHIELD_MS)} giây</span>`;
  coolDown = LOCKET_COOLDOWN_MS;
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
    const covered: AttackableUnit[] = [
      this.owner,
      ...alliedChampionsAround(this.owner, LOCKET_RADIUS),
    ];

    for (const ally of covered) {
      const shield = new Shield(LOCKET_SHIELD_MS, this.owner, ally);
      shield.name = 'Vòng Sắt Mặt Trời';
      shield.stackId = LOCKET_STACK_ID;
      shield.amount = ally.stats.maxHealth.value * LOCKET_SHIELD_PERCENT;
      shield.color = [...SOLARI];
      shield.image = this.image;
      ally.addBuff(shield);
    }

    this.game.objectManager.addObject(new Item_Locket_Dome(this.owner, covered));
  }
}

/**
 * The dome: one ring that grows to exactly `LOCKET_RADIUS` — the radius the
 * shield really used — plus a short flare on each body it covered.
 *
 * Two layers and each carries a different fact: the ring says *how far it
 * reached*, the flares say *who got it*. A player deciding whether to step in
 * needs the first; a player wondering why they died with the item on cooldown
 * needs the second.
 */
export class Item_Locket_Dome extends SpellObject {
  age = 0;
  covered: AttackableUnit[];

  constructor(owner: AttackableUnit, covered: AttackableUnit[]) {
    super(owner);
    this.covered = covered;
    this.position = owner.position.copy();
  }

  update(): void {
    this.age += deltaTime;
    if (this.age >= DOME_MS) this.toRemove = true;
    this.position.set(this.owner.position.x, this.owner.position.y);
  }

  draw(): void {
    const t = constrain(this.age / DOME_MS, 0, 1);
    // Snap out, then hold: the ring has to reach its true radius early enough
    // to be read, not arrive at the last frame.
    const grown = 1 - (1 - t) * (1 - t);
    const fade = 1 - t * t;
    const [r, g, b] = SOLARI;

    push();
    noFill();
    stroke(r, g, b, 200 * fade);
    strokeWeight(3);
    circle(this.position.x, this.position.y, LOCKET_RADIUS * 2 * grown);
    stroke(r, g, b, 90 * fade);
    strokeWeight(9);
    circle(this.position.x, this.position.y, LOCKET_RADIUS * 2 * grown);

    for (const ally of this.covered) {
      const size = ally.animatedValues.displaySize + 18 * grown;
      stroke(255, 240, 210, 230 * fade);
      strokeWeight(2.5);
      circle(ally.position.x, ally.position.y, size);
    }
    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox((LOCKET_RADIUS + 60) * 2);
  }
}
