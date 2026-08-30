import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const SpellObject = api.SpellObject;
const DashBuff = api.buffs.Dash;
const StunBuff = api.buffs.Stun;
const VectorUtils = api.utils.VectorUtils;
const Circle = api.utils.Quadtree.Circle;
const PredefinedFilters = api.combat.PredefinedFilters;
const sweepToWall = api.terrain.sweepToWall;
const AoePulse = api.AoePulse;

/** Small on purpose: E is a stun with a reposition attached, not a damage button. */
export const E_DAMAGE = 16;

export const E_STUN_MS = 900;

/** Fixed. The aim point picks the direction; it never picks the distance. */
export const PHANTOM_DASH_DISTANCE = 300;

/** How long the phantom stands where he left it before it comes after him. */
export const PHANTOM_DELAY_MS = 500;

/** Px per frame on the way back — faster than the dash out, so it catches him. */
export const PHANTOM_SPEED = 16;

/** How wide a body it drags under. */
export const PHANTOM_RADIUS = 55;

/** Px per frame Pyke himself travels. */
export const E_DASH_SPEED = 22;

export const E_COOLDOWN_MS = 9_000;

export const E_MANA_COST = 35;

const LABEL = 'Dòng Nước Ma Quái';

/**
 * Phantom Undertow.
 *
 * Two moving things, one after the other: Pyke goes out, and what he leaves
 * behind comes back for him. The stun is on the *return*, so the ability is
 * only ever as good as the ground Pyke chooses to stand on while it travels —
 * dash past someone and they are on the line; dash away from them and nothing
 * happens at all.
 */
export default class Pyke_E extends Spell {
  targetingMode = 'DIRECTION' as const;
  image = api.asset('spell_pyke_e');
  name = 'Dòng Nước Ma Quái (Pyke_E)';
  description =
    `Pyke lướt <span class="buff">${PHANTOM_DASH_DISTANCE}px</span> theo hướng chỉ định, để lại một bóng ma tại chỗ cũ.` +
    ` Sau <span class="time">${PHANTOM_DELAY_MS / 1000} giây</span>, bóng ma lao ngược về phía Pyke,` +
    ` <span class="buff">Làm Choáng</span> mọi kẻ địch nó đi xuyên qua trong` +
    ` <span class="time">${E_STUN_MS / 1000} giây</span> và gây <span class="damage physical">${E_DAMAGE} sát thương vật lý</span>`;
  coolDown = E_COOLDOWN_MS;
  manaCost = E_MANA_COST;

  range = PHANTOM_DASH_DISTANCE;

  checkCastCondition(): boolean {
    return DashBuff.CanDash(this.owner);
  }

  onSpellCast(): void {
    const origin = this.owner.position.copy();
    const { to: aimed } = VectorUtils.getVectorWithRange(origin, this.aimPoint, this.range);

    // Stops the body against the surface rather than inside it — the map's own
    // walls and the ones spells are holding up, both at once.
    const contact = sweepToWall(
      this.game,
      origin.x,
      origin.y,
      aimed.x,
      aimed.y,
      this.owner.terrainRadius
    );
    const landing = contact
      ? VectorUtils.getVectorWithRange(origin, aimed, contact.travelled).to
      : aimed;

    const surge = new DashBuff(1_500, this.owner, this.owner);
    surge.dashDestination = landing;
    surge.dashSpeed = E_DASH_SPEED;
    surge.image = this.image;
    this.owner.addBuff(surge);

    const phantom = new Pyke_E_Phantom(this.owner);
    phantom.position = origin;
    phantom.icon = this.image;
    this.game.objectManager.addObject(phantom);
  }
}

/**
 * The thing he left behind.
 *
 * It stands still for `PHANTOM_DELAY_MS` — that pause is the ability's windup
 * and the whole of the counterplay, because it is the window an enemy has to
 * step off the line — and then homes on wherever Pyke has actually got to,
 * which is why it reads as *his* drowned self coming back rather than as a
 * projectile aimed at a point.
 *
 * A `Set` of everyone already caught, because a sweep passing over a body for
 * a dozen frames must stun it once.
 */
export class Pyke_E_Phantom extends SpellObject {
  age = 0;
  returning = false;
  speed = PHANTOM_SPEED;
  radius = PHANTOM_RADIUS;

  icon: ReturnType<typeof api.asset> | null = null;

  /** One stun per body per cast. */
  caught = new Set<AttackableUnit>();

  /** The ragged edge of the silhouette, seeded once so it does not boil. */
  _fray: number[] = [];

  onAdded(): void {
    for (let i = 0; i < 10; i++) this._fray.push(random(0.75, 1.25));
  }

  update(): void {
    if (this.toRemove) return;
    this.age += deltaTime;

    if (!this.returning) {
      if (this.age < PHANTOM_DELAY_MS) return;
      this.returning = true;
    }

    const home = this.owner.position;
    VectorUtils.moveVectorToVector(this.position, home, this.speed);
    this.sweep();

    if (this.position.dist(home) < this.speed) this.toRemove = true;
  }

  /** Everything the body passed over this frame, each one exactly once. */
  private sweep(): void {
    const swept = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: this.radius }),
      filters: [PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const victim of swept) {
      if (this.caught.has(victim)) continue;
      this.caught.add(victim);

      victim.takeDamage(E_DAMAGE, this.owner, 'PHYSICAL', LABEL);

      const daze = new StunBuff(E_STUN_MS, this.owner, victim);
      if (this.icon) daze.image = this.icon;
      victim.addBuff(daze);

      const undertow = new AoePulse(this.owner);
      undertow.position = victim.position.copy();
      undertow.radius = 40;
      undertow.lifeTime = 300;
      undertow.color = [96, 190, 190];
      undertow.fillAlpha = 34;
      this.game.objectManager.addObject(undertow);
    }
  }

  draw(): void {
    const toward = p5.Vector.sub(this.owner.position, this.position);
    const heading = Math.atan2(toward.y, toward.x);
    // The pause is a wind-in; the return snaps out. Both read off one clock.
    const waiting = constrain(this.age / PHANTOM_DELAY_MS, 0, 1);

    push();
    translate(this.position.x, this.position.y);

    if (!this.returning) {
      // Standing: a ring tightening under its feet, counting the delay down.
      noFill();
      stroke(80, 170, 168, 90 + 90 * waiting);
      strokeWeight(2);
      ellipse(0, 0, this.radius * 2 * (1.4 - 0.5 * waiting), this.radius * 1.2 * (1.4 - 0.5 * waiting));
    } else {
      // Returning: streaks laid down *behind* it, so the shape reads as
      // travelling toward Pyke rather than away from him.
      push();
      rotate(heading);
      stroke(70, 150, 152, 120);
      strokeWeight(3);
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * 9;
        line(-this.radius * 1.4 * this._fray[i], off, -8, off * 0.5);
      }
      pop();
    }

    // The drowned silhouette: a hunched, hooded body, deliberately not a disc.
    push();
    rotate(heading);
    noStroke();
    fill(16, 48, 54, 210);
    beginShape();
    for (let i = 0; i < this._fray.length; i++) {
      const around = (i / this._fray.length) * TWO_PI;
      const reach = this.radius * 0.55 * this._fray[i] * (1 + 0.25 * Math.cos(around));
      vertex(Math.cos(around) * reach, Math.sin(around) * reach * 0.8);
    }
    endShape(CLOSE);

    // Two pale eyes, facing the way it is going.
    fill(176, 240, 232, 220);
    circle(this.radius * 0.22, -7, 6);
    circle(this.radius * 0.22, 7, 6);
    pop();

    pop();
  }

  getDisplayBoundingBox() {
    return this.squareDisplayBoundingBox(this.radius * 3);
  }
}
