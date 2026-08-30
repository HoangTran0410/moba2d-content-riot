import type { AttackableUnit, Dash, Slow } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { pct, secs } from '../text';

const Spell = api.Spell;
const MissileSpellObject = api.MissileSpellObject;
const DashBuff = api.buffs.Dash;
const SlowBuff = api.buffs.Slow;
const BuffAddType = api.enums.BuffAddType;
const VectorUtils = api.utils.VectorUtils;
const Rectangle = api.utils.Quadtree.Rectangle;
const AoePulse = api.AoePulse;

/** Physical, and small: Q is a hook first and a poke a long way second. */
export const Q_DAMAGE = 22;

export const Q_SLOW_PERCENT = 0.3;

export const Q_SLOW_MS = 1_000;

/** How far the harpoon flies before the rope runs out. */
export const HARPOON_RANGE = 420;

/** How long the body takes to arrive. Long enough to watch, short enough to trust. */
export const PULL_DURATION_MS = 300;

/**
 * The pull is spent in frames, because `Dash` steps once per frame — so the
 * duration above has to be converted at the rate the engine actually runs.
 * Exported so the test can state "230px of travel over the pull" rather than
 * re-deriving a speed nobody would recognise.
 */
export const PULL_FRAMES = Math.round(PULL_DURATION_MS / (1_000 / 60));

/** Where the victim ends up: inside a melee swing, not inside Pyke's body. */
export const PULL_STOP_DISTANCE = 70;

export const Q_COOLDOWN_MS = 8_000;

export const Q_MANA_COST = 30;

/** Its own slot, so nothing else's slow can evict this one or be evicted by it. */
export const Q_SLOW_STACK_ID = 'pyke_q_skewer_slow';

/** The player-facing half of the name — what the death recap groups by. */
const LABEL = 'Đâm Thấu Xương';

/**
 * Bone Skewer.
 *
 * The wiki's version is a charge: tap for a short stab, hold for the long
 * harpoon. Charge activations are a whole separate cast-spec shape and only one
 * spell in this pack uses one, so this ships as the held throw at its full
 * reach — the harpoon, not the stab. Everything that makes the ability what it
 * is survives that: one victim, dragged in, slowed on arrival.
 */
export default class Pyke_Q extends Spell {
  targetingMode = 'DIRECTION' as const;
  image = api.asset('spell_pyke_q');
  name = 'Đâm Thấu Xương (Pyke_Q)';
  description =
    `Phóng lao xương theo hướng chỉ định. Kẻ địch <span class="buff">đầu tiên</span> trúng lao nhận` +
    ` <span class="damage physical">${Q_DAMAGE} sát thương vật lý</span>, bị <span class="buff">Làm Chậm ${pct(Q_SLOW_PERCENT)}%</span> trong <span class="time">${secs(Q_SLOW_MS)} giây</span> và bị` +
    ` <span class="buff">kéo về phía Pyke</span> trong <span class="time">${secs(PULL_DURATION_MS)} giây</span>, dừng lại ngay trong tầm đánh của hắn`;
  coolDown = Q_COOLDOWN_MS;
  manaCost = Q_MANA_COST;

  range = HARPOON_RANGE;

  onSpellCast(): void {
    const { to } = VectorUtils.getVectorWithRange(this.owner.position, this.aimPoint, this.range);

    const harpoon = new Pyke_Q_Harpoon(this.owner);
    harpoon.destination = to;
    harpoon.icon = this.image;
    this.game.objectManager.addObject(harpoon);
  }
}

/**
 * Where a body being hauled in should come to rest: `PULL_STOP_DISTANCE` from
 * Pyke along the line it is already on. Shared by the hit (which sets the pull
 * up) and by every frame after it (which keeps the pull aimed at Pyke as he
 * walks), so the two can never disagree about where "in" is.
 */
const restingPointFor = (puller: AttackableUnit, victim: AttackableUnit): p5.Vector => {
  const outward = p5.Vector.sub(victim.position, puller.position);
  if (outward.mag() <= PULL_STOP_DISTANCE) return victim.position.copy();
  return p5.Vector.add(puller.position, outward.setMag(PULL_STOP_DISTANCE));
};

/**
 * The harpoon itself, and then the rope.
 *
 * It survives its own hit (`removeOnMaxHit = false`) for one reason, and it is
 * the VFX standard's fifth rule: the pull has to be *drawn* coming inward. A
 * spear that vanished on contact while the body slid toward Pyke reads as the
 * body being shoved by nothing. So on impact the spear turns around, its
 * destination becomes Pyke, and it reels home beside the victim at the same
 * speed they travel — one motion, two objects, no argument about direction.
 *
 * The `Dash` is the only thing that moves the victim. Writing `position`
 * directly would answer to nothing — not to a cleanse, not to a spell shield —
 * which is the bug this pack's other hook already paid for once.
 */
export class Pyke_Q_Harpoon extends MissileSpellObject {
  speed = 13;
  size = 30;

  /** One victim. The spear stops on the first thing it touches. */
  maxHitCount = 1;
  removeOnMaxHit = false;

  /** Pyke's own icon, for the buffs this thing applies. */
  icon: ReturnType<typeof api.asset> | null = null;

  victim: AttackableUnit | null = null;
  drag: Dash | null = null;

  /** Flips on impact; everything the draw does differently hangs off it. */
  reeling = false;

  /** Rope slack, seeded once so the chain does not boil frame to frame. */
  _slack: number[] = [];

  onAdded(): void {
    super.onAdded();
    for (let i = 0; i < 9; i++) this._slack.push(random(-1, 1));
  }

  onHit(enemy: AttackableUnit): void {
    enemy.takeDamage(Q_DAMAGE, this.owner, 'PHYSICAL', LABEL);

    const chill = new SlowBuff(Q_SLOW_MS, this.owner, enemy) as Slow;
    chill.percent = Q_SLOW_PERCENT;
    // Renewed, never stacked: two hooks landing back to back must read as one
    // 30% slow, not as 60%.
    chill.buffAddType = BuffAddType.RENEW_EXISTING;
    chill.stackId = Q_SLOW_STACK_ID;
    if (this.icon) chill.image = this.icon;
    enemy.addBuff(chill);

    const barb = new AoePulse(this.owner);
    barb.position = enemy.position.copy();
    barb.radius = 34;
    barb.lifeTime = 260;
    barb.color = [235, 214, 168];
    barb.fillAlpha = 30;
    this.game.objectManager.addObject(barb);

    this.reeling = true;
    // Inward, from this frame on — the rope, the spear and the body all travel
    // the same way.
    this.destination = this.owner.position;
    // And the spear stops dying on arrival, because it gets home *first* on a
    // close hook: the retract covers the whole distance while the body only
    // covers what is left over `PULL_STOP_DISTANCE`. Removing it there would
    // take `onRemoved` with it and cut the pull off partway. It now lives
    // exactly as long as the rope is taut — see `update`.
    this.removeOnArrive = false;

    const rest = restingPointFor(this.owner, enemy);
    const travel = enemy.position.dist(rest);
    if (travel <= 0) return;

    const haul = new DashBuff(PULL_DURATION_MS + 400, this.owner, enemy) as Dash;
    haul.showTrail = false;
    haul.cancelable = false;
    haul.dashSpeed = travel / PULL_FRAMES;
    haul.dashDestination = rest;
    if (this.icon) haul.image = this.icon;
    enemy.addBuff(haul);

    this.victim = enemy;
    this.drag = haul;
  }

  update(): void {
    super.update();
    if (!this.reeling) return;

    // The rope outlives the spear's own journey home and ends with the pull.
    if (!this.victim || !this.drag || this.drag.toRemove || this.victim.isDead) {
      this.toRemove = true;
      return;
    }

    // The pull tracks Pyke: he is free to keep walking while the rope is taut,
    // and the body should still arrive beside him rather than beside where he
    // used to be.
    this.drag.dashDestination = restingPointFor(this.owner, this.victim);
  }

  onRemoved(): void {
    this.drag?.deactivateBuff?.();
  }

  draw(): void {
    const anchor = this.owner.position;
    const dx = this.position.x - anchor.x;
    const dy = this.position.y - anchor.y;
    const heading = Math.atan2(dy, dx);
    const span = Math.hypot(dx, dy);

    push();

    // The rope. Slack on the way out, snapped straight and bright on the way
    // back — the single clearest read on "this one is caught".
    const sag = this.reeling ? 0 : 7;
    noFill();
    stroke(24, 58, 62, 200);
    strokeWeight(this.reeling ? 5 : 3);
    beginShape();
    for (let i = 0; i <= 8; i++) {
      const along = i / 8;
      const bow = Math.sin(along * PI) * sag * this._slack[i];
      vertex(anchor.x + dx * along - dy * (bow / (span || 1)), anchor.y + dy * along + dx * (bow / (span || 1)));
    }
    endShape();

    if (this.reeling) {
      // Barbs sliding down the rope toward Pyke: the motion states the pull.
      noStroke();
      for (let i = 0; i < 4; i++) {
        const along = ((frameCount / 22 + i * 0.25) % 1);
        const back = 1 - along;
        fill(178, 236, 226, 150 * back + 40);
        circle(anchor.x + dx * back, anchor.y + dy * back, 7);
      }
    }

    // The spear head. Point-first outbound, and turned around while reeling so
    // it comes home barb-first, the way a hook actually returns.
    push();
    translate(this.position.x, this.position.y);
    rotate(this.reeling ? heading : heading + PI);
    noStroke();
    fill(232, 224, 196);
    triangle(-18, 0, 9, -8, 9, 8);
    fill(196, 182, 148);
    triangle(-18, 0, 2, -4, 2, 4);
    // two barbs swept back from the point
    stroke(214, 204, 172);
    strokeWeight(3);
    line(-6, -3, 6, -11);
    line(-6, 3, 6, 11);
    pop();

    pop();
  }

  /** The rope spans from Pyke to the spear, so the box has to hold both ends. */
  getDisplayBoundingBox() {
    const pad = this.size;
    return new Rectangle({
      x: Math.min(this.position.x, this.owner.position.x) - pad,
      y: Math.min(this.position.y, this.owner.position.y) - pad,
      w: Math.abs(this.position.x - this.owner.position.x) + pad * 2,
      h: Math.abs(this.position.y - this.owner.position.y) + pad * 2,
      data: this,
    });
  }
}
