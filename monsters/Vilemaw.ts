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
  /**
   * The spray, before anything moves.
   *
   * The ability used to be one frame: a `Dash` and a damage number applied
   * inside `cast`, with **no drawing of any kind**. A champion at the far end
   * of a 520px reach was simply somewhere else, and the boss that did it had
   * not appeared to do anything — which reads as the game skipping rather than
   * as being caught. So the strands go out first, fan wide enough to be seen
   * crossing the ground, and only when they land does the pull start.
   *
   * Half a second, which is longer than the drag itself and is the point: the
   * expensive half of this ability is the moment you can see it coming and are
   * already too far in to matter.
   */
  sprayMs: 480,
  /** How wide the fan of strands opens, in radians either side of the line. */
  sprayFan: 0.5,
  /** Strands drawn. Odd, so one of them runs straight down the middle. */
  strands: 7,
  /** How long the taut strands stay on screen once the drag is over. */
  holdMs: 260,
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
 * The web: sprayed, then reeled.
 *
 * ## Why it is an object at all
 *
 * `cast` used to apply the `Dash` and the damage on the frame it ran, and draw
 * nothing whatsoever. Everything about the ability that a player could
 * perceive was the destination — you were at the edge of the pit, then you
 * were in it, and the creature that did it never moved. An effect drawn *from*
 * the boss would not have fixed it either: `ObjectManager.draw` skips a unit
 * outside the camera, and a 520px reach very much leaves the body behind
 * (`Baron.ts`'s header records the same trap costing Lux her ultimate).
 *
 * ## Three phases, and the damage lands on the second
 *
 * Strands fan out over `sprayMs`, reaching further each frame. When they
 * arrive the pull starts and the bite lands — one instant, not two, so a
 * champion who dies to the pull dies at the moment the web takes hold rather
 * than half a second before. Then the strands stay taut, following the target
 * all the way in, and hang for `holdMs` after it stops.
 *
 * The target is re-checked at the catch, and so is the boss. Half a second is
 * long enough for either to die in. Core already refuses to move a corpse, so
 * the victim half of that check is belt and braces — the boss half is not:
 * nothing else stops a web thrown by something that no longer exists.
 */
function makeWebPull(api: ContentApi) {
  return class WebPull extends api.SpellObject {
    age = 0;
    caught = false;
    target: AttackableUnitInstance | null = null;
    /** Where the strands were aimed, kept so a dead target still leaves a miss. */
    aim = createVector(0, 0);

    update(): void {
      this.age += deltaTime;
      const owner = this.owner as AttackableUnitInstance;
      this.position.set(owner.position.x, owner.position.y);

      if (!this.caught && this.age >= WEB.sprayMs) {
        this.caught = true;
        this.reel();
      }
      if (this.age >= WEB.sprayMs + 1_200 + WEB.holdMs) this.toRemove = true;
    }

    private reel(): void {
      const owner = this.owner as AttackableUnitInstance;
      const target = this.target;
      if (!target || target.isDead || owner.isDead) return;

      const from = owner.position;
      const dx = target.position.x - from.x;
      const dy = target.position.y - from.y;
      const distance = Math.hypot(dx, dy) || 1;
      const landing = createVector(
        from.x + (dx / distance) * WEB.landing,
        from.y + (dy / distance) * WEB.landing
      );

      // A displacement applied *by someone else*, so it constructs a `Dash`
      // directly rather than asking `Dash.CanDash` — that gate is about a unit
      // dashing under its own power, and being yanked is not that. Grounding
      // still blocks it, through `Dash`'s own backstop.
      const pull = new api.buffs.Dash(1_200, owner, target);
      pull.dashDestination = landing;
      pull.dashSpeed = WEB.dashSpeed;
      target.addBuff(pull);
      target.takeDamage(WEB.damage, owner);
    }

    /** Where the far end of the strands is right now. */
    private tip(): { x: number; y: number; reach: number } {
      const from = this.owner.position;
      const live = this.target && !this.target.isDead ? this.target.position : this.aim;
      const dx = live.x - from.x;
      const dy = live.y - from.y;
      const full = Math.hypot(dx, dy) || 1;
      const reach = this.caught ? full : full * Math.min(1, this.age / WEB.sprayMs);
      return { x: from.x + (dx / full) * reach, y: from.y + (dy / full) * reach, reach };
    }

    draw(): void {
      const from = this.owner.position;
      const { x, y, reach } = this.tip();
      const heading = Math.atan2(y - from.y, x - from.x);
      const thrown = Math.min(1, this.age / WEB.sprayMs);
      // The fan closes as the strands find their mark, so a spray that opened
      // across the ground ends as a single taut line to one champion.
      const fan = WEB.sprayFan * (this.caught ? 0.12 : 1 - 0.5 * thrown);
      const fade = this.caught
        ? 1 - Math.min(1, Math.max(0, this.age - WEB.sprayMs - 1_200) / WEB.holdMs)
        : 1;

      push();
      translate(from.x, from.y);
      rotate(heading);

      // the strands themselves, each one a little short of the last
      strokeCap(ROUND);
      for (let i = 0; i < WEB.strands; i++) {
        // -1 at one edge of the fan, +1 at the other, 0 down the middle.
        const spread = (i / (WEB.strands - 1)) * 2 - 1;
        const angle = spread * fan;
        const length = reach * (1 - 0.12 * Math.abs(spread));
        const middle = 1 - Math.abs(spread);
        stroke(235, 235, 245, (70 + 130 * middle) * fade);
        strokeWeight(1 + 2 * middle);
        line(0, 0, cos(angle) * length, sin(angle) * length);
      }

      // cross-threads, so the fan reads as a web rather than as a hand of lines
      noFill();
      stroke(225, 228, 240, 90 * fade);
      strokeWeight(1);
      for (let ring = 1; ring <= 3; ring++) {
        const r = reach * (ring / 3) * 0.94;
        arc(0, 0, r * 2, r * 2, -fan, fan);
      }

      // the mouth end: a knot that brightens as the strands go out
      noStroke();
      fill(240, 240, 250, 200 * fade);
      circle(0, 0, 10 + 10 * thrown);
      pop();

      // and the far end, once it has something to hold
      if (this.caught) {
        push();
        noStroke();
        fill(240, 240, 250, 190 * fade);
        circle(x, y, 16);
        fill(200, 200, 220, 90 * fade);
        circle(x, y, 30);
        pop();
      }
    }

    getDisplayBoundingBox() {
      return this.squareDisplayBoundingBox(WEB.range * 2.4);
    }
  };
}

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

    /**
     * Two flat discs is what this was, and at 190px across that is a decal —
     * a shape with no edge to read and nothing to say it is still alive. It
     * matters more here than for most ground effects, because the pool is
     * spat under a champion who has just been dragged somewhere they did not
     * choose to stand: the first thing they need to know is where it ends.
     *
     * So: a rim that is brighter than the fill, a body that fades from the
     * middle out, and bubbles rising on the pool's own clock rather than on
     * `frameCount`, so two pools laid a second apart are not in lockstep.
     * `Baron.ts`'s poison pool is drawn on the same reasoning.
     */
    draw(): void {
      const { x, y } = this.center;
      // Rises quickly and drains over the last half second, so the pool
      // appears and clears rather than blinking in and out.
      const alpha = Math.min(
        constrain(this.elapsedMs / 220, 0, 1),
        1 - constrain((this.elapsedMs - (VENOM.durationMs - 500)) / 500, 0, 1)
      );
      const [r, g, b] = VENOM_GREEN;

      push();
      translate(x, y);
      noStroke();
      fill(r * 0.35, g * 0.4, b * 0.3, 130 * alpha);
      circle(0, 0, this.radius * 2);
      fill(r, g, b, 55 * alpha);
      circle(0, 0, this.radius * 1.55);
      fill(r, g, b, 45 * alpha);
      circle(0, 0, this.radius * 0.9);

      // bubbles surfacing, on the pool's own clock
      fill(r, g, b, 150 * alpha);
      for (let i = 0; i < 8; i++) {
        const angle = (TWO_PI * i) / 8 + this.elapsedMs / 1_100;
        const reach = this.radius * (0.3 + 0.55 * ((i % 3) / 3));
        const size = 7 + 6 * sin(this.elapsedMs / 260 + i);
        circle(cos(angle) * reach, sin(angle) * reach, size);
      }

      // the edge, which is the only part anybody actually needs
      noFill();
      stroke(r, g, b, 190 * alpha);
      strokeWeight(2);
      circle(0, 0, this.radius * 2);
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
  const WebPull = makeWebPull(api);

  return [
    {
      name: WEB.name,
      cooldownMs: WEB.cooldownMs,
      range: WEB.range,
      cast(monster, target) {
        // Everything the ability does now lives in the object — see `WebPull`.
        // The cast's whole job is to put the strands in the air and name what
        // they are aimed at.
        const game = monster.game;
        if (!game?.objectManager?.addObject) return;
        const web = new WebPull(monster as never);
        web.target = target as never;
        web.aim = createVector(target.position.x, target.position.y);
        game.objectManager.addObject(web);
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
