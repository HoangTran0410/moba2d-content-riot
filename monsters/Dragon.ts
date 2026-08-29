import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type { MonsterAbility } from '@moba2d/core/content/types';
import { beneficiary, blessing, drawBlessingRing, hostilesIn, teamOf } from './JungleBuffs';

/**
 * Rồng nguyên tố — one pit, four elements, and a buff that **replaces**.
 *
 * ## The buff never stacks, and that is a design decision with teeth
 *
 * `BuffAddType.REPLACE_EXISTING` plus one shared `stackId` for all four
 * elements. Taking a Cloud dragon therefore *removes* your Infernal buff.
 *
 * The alternative — a slot per element — is the source game's, and it turns
 * the pit into accumulation: take every drake, hold every bonus, and the
 * team that won the first fight wins the rest by arithmetic. One slot makes
 * each drake a *choice*: the one currently up is the buff currently on offer,
 * and it costs you the one you already have.
 *
 * **`stackId` is stated explicitly on every element, and has to be.**
 * `Buff.stackId` defaults to `new.target` — the class itself — so four
 * classes would land in four separate slots and quietly stack after all,
 * which is exactly the outcome this file exists to avoid and exactly the sort
 * of thing that looks correct in review. If the "replace" flavour ever plays
 * badly, one string here (`'dragon:' + element`) turns it into four slots.
 *
 * ## The pit is a different fight every rotation
 *
 * The element used to decide only the *reward*. It decides the fight too now:
 * one shared `MonsterAbility` reads `elementFor(monster.camp)` and branches,
 * so scouting which drake is up is a real decision rather than trivia you
 * learn at the moment you kill it. That is also why the pit wears a ring in
 * its element's colour — a rotation nobody can see before engaging is not a
 * choice, it is a surprise, and the ring is what makes `elementFor` legible
 * from across the map.
 *
 * Beside it sits one thing every drake does: a wingbeat that throws everything
 * out of the pit. It reads as the boss noticing you because it fires on the
 * first frame of the fight for free — `Monster._abilityCooldowns` starts at
 * zero and `castAbility` runs before the reach check — and then recurs, which
 * a once-per-life trigger would not. It **pushes** rather than knocking up on
 * purpose: `monsters/Baron.ts`'s `SLAM` already owns airborne, and two bosses
 * with the same verb are one fight wearing two skins. Being shoved out of the
 * pit costs you the walk back, which is a different price than being pinned.
 *
 * ## Duration against respawn
 *
 * 180s of buff against a 60s respawn. The pairing is deliberate: a team that
 * takes every dragon holds one continuously, which is a reward for winning
 * the pit rather than a permanent stat grant — stop taking them and it runs
 * out. A duration much longer than the respawn would be a permanent buff
 * wearing a timer, which is the thing that was asked not to be built.
 */

export const DRAGON = {
  name: 'Rồng Nguyên Tố',
  /** ms the blessing lasts. See the header for why it is read against respawn. */
  durationMs: 180_000,
  /**
   * One slot for every element. Never let this become a template string per
   * element unless four independent buffs is what you mean.
   */
  stackId: 'dragon-blessing',
} as const;

/**
 * The four drakes. Each is one `StatAmp`'s worth of bonus, sized so that any
 * single one is worth fighting for and none of them decides a match on its
 * own — a champion pool is ~100 health, so +8 attack damage is a real swing.
 */
export const ELEMENTS = [
  {
    id: 'infernal',
    name: 'Rồng Lửa',
    glow: [255, 130, 60] as [number, number, number],
    bonuses: { attackDamage: { flatBonus: 8 }, abilityPower: { flatBonus: 0.12 } },
  },
  {
    id: 'ocean',
    name: 'Rồng Nước',
    glow: [70, 190, 235] as [number, number, number],
    bonuses: { healthRegen: { flatBonus: 0.06 }, manaRegen: { flatBonus: 0.05 } },
  },
  {
    id: 'cloud',
    name: 'Rồng Gió',
    glow: [190, 210, 255] as [number, number, number],
    bonuses: { speed: { percentBonus: 0.12 } },
  },
  {
    id: 'mountain',
    name: 'Rồng Đất',
    glow: [200, 170, 110] as [number, number, number],
    bonuses: { armor: { flatBonus: 10 }, maxHealth: { flatBonus: 12 } },
  },
] as const;

export type DragonElement = (typeof ELEMENTS)[number];

/** Instances, without a value import the pack-core boundary forbids here. */
type AttackableUnitInstance = InstanceType<ContentApi['units']['AttackableUnit']>;
type MonsterInstance = InstanceType<ContentApi['units']['Monster']>;

/**
 * The beat that clears the pit. Damage is deliberately small — the point is
 * the displacement, and a wingbeat that also nuked would make the fight about
 * surviving it rather than about getting back in.
 */
export const WINGBEAT = {
  name: 'Vỗ Cánh',
  cooldownMs: 9_000,
  /** Everything inside this, measured from the pit, is thrown out. */
  radius: 240,
  /**
   * Where it lands them, also measured from the pit — and **inside the
   * dragon's own reach**, which is `attackRange` plus both bodies' radii, so
   * about 390 against a default-sized champion.
   *
   * It used to be 560. The dragon is rooted, so that threw every target past
   * the only range it has and left the boss standing in an empty pit until
   * they chose to walk back: a signature ability whose whole effect was to
   * end its own fight. Landing short of the reach keeps the breath on you all
   * the way back in, so the beat costs *you* the tempo — melee out of range,
   * out of the pit, walking — rather than costing the dragon its turn.
   *
   * Larger than `radius` on purpose: everyone caught is thrown outward, never
   * dragged in.
   */
  landing: 380,
  damage: 10,
  dashSpeed: 24,
  /** The rear-up you get to read before the beat lands. */
  telegraphMs: 500,
  /** How long the shockwave stays on screen after it. */
  burstMs: 320,
} as const;

/**
 * One ability, four fights. Each rhymes with the blessing its drake pays, so
 * the thing you fight tells you what you are fighting for: the fire drake
 * burns, the water drake heals itself, the wind drake blows you around, the
 * earth drake hardens.
 *
 * The two that deal no damage at all (`ocean`, `mountain`) are the point of
 * doing this as four fights rather than four damage numbers — a heal turns
 * the pit into a damage check and a shield turns it into a burst check,
 * neither of which any other camp in this pack asks for.
 */
export const RITE = {
  name: 'Nghi Thức Nguyên Tố',
  cooldownMs: 7_000,
  range: 340,
  /** How long the elemental burst is drawn for. */
  burstMs: 460,
  infernal: { damagePerTick: 3, tickMs: 600, durationMs: 3_000 },
  /** A fraction of its own maximum health, per cast. */
  ocean: { healFraction: 0.07 },
  cloud: { damage: 8, slowPercent: 0.4, durationMs: 2_500 },
  mountain: { shield: 140, durationMs: 6_000 },
} as const;

/**
 * Which element the next kill pays, per camp.
 *
 * Keyed by the camp object rather than held in one closure variable, because
 * `contentRegistry().abilitiesFor(id)` hands the *same* ability array to every
 * body of every slot the monster fills. One counter would make two dragon pits
 * on a two-pit map take turns with each other's rotation instead of each
 * running its own. A `WeakMap` also means a camp that goes away takes its
 * counter with it.
 */
const rotation = new WeakMap<object, number>();

/** The drake currently in the pit, and the one after it. */
export function elementFor(camp: object): DragonElement {
  return ELEMENTS[(rotation.get(camp) ?? 0) % ELEMENTS.length];
}

function advance(camp: object): void {
  rotation.set(camp, ((rotation.get(camp) ?? 0) + 1) % ELEMENTS.length);
}

/** Test seam: put a camp's rotation back where it starts. */
export function resetDragonRotation(camp: object): void {
  rotation.delete(camp);
}

type StatAmpBonuses = InstanceType<ContentApi['buffs']['StatAmp']>['bonuses'];

function makeDragonBuff(api: ContentApi, element: DragonElement) {
  return class DragonBuff extends api.buffs.StatAmp {
    name = element.name;
    // See the header. Not `new.target`, not per element.
    stackId = DRAGON.stackId;
    image = api.asset('monster_Elemental_Dragon');
    buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
    bonuses: StatAmpBonuses = element.bonuses;

    draw(): void {
      drawBlessingRing(this.targetUnit, element.glow, 4);
    }
  };
}

/**
 * The pit's own ring, in whatever element is currently up.
 *
 * A ground decal that outlives the dragon on purpose: the rotation advances
 * on death, so the sixty seconds the pit stands empty are exactly when a team
 * decides whether to contest the next drake. A ring tied to the body would go
 * dark for precisely that window.
 *
 * It reads `elementFor` every frame rather than caching a colour, which is
 * what keeps it honest across a kill without needing to be told about one.
 */
function makeDragonPitRing(api: ContentApi) {
  return class DragonPitRing extends api.SpellObject {
    // `Z_INDEX_MAP` is keyed by exact constructor, so a subclass that names no
    // layer resolves *above* champions — ground art has to say so itself.
    zIndex = api.layers.GROUND_Z_INDEX;
    camp: { x: number; y: number; r: number };

    constructor(owner: AttackableUnitInstance, camp: { x: number; y: number; r: number }) {
      super(owner);
      this.camp = camp;
      this.position.set(camp.x, camp.y);
    }

    /** Permanent. The pit does not expire, and neither does what it says. */
    update(): void {}

    draw(): void {
      const [r, g, b] = elementFor(this.camp).glow;
      const spin = frameCount / 120;
      const radius = this.camp.r;

      push();
      noFill();
      stroke(r, g, b, 70);
      strokeWeight(3);
      circle(this.camp.x, this.camp.y, radius * 2);
      stroke(r, g, b, 150);
      strokeWeight(5);
      for (let i = 0; i < 4; i++) {
        const start = spin + (TWO_PI * i) / 4;
        arc(this.camp.x, this.camp.y, radius * 2, radius * 2, start, start + 0.5);
      }
      pop();
    }

    getDisplayBoundingBox() {
      return this.squareDisplayBoundingBox((this.camp.r + 40) * 2);
    }
  };
}

/**
 * The shockwave: a ring that reads the wingbeat out, then throws.
 *
 * The telegraph is readability, not counterplay — nothing walks 330px in half
 * a second — and it is worth having anyway: a shove that arrives with no
 * warning reads as the game glitching rather than as the boss doing something.
 */
function makeWingbeat(api: ContentApi) {
  return class Wingbeat extends api.SpellObject {
    age = 0;
    struck = false;
    glow: [number, number, number] = [220, 235, 255];

    update(): void {
      this.age += deltaTime;
      this.position.set(this.owner.position.x, this.owner.position.y);

      if (!this.struck && this.age >= WINGBEAT.telegraphMs) {
        this.struck = true;
        this.throwEveryone();
      }
      if (this.age >= WINGBEAT.telegraphMs + WINGBEAT.burstMs) this.toRemove = true;
    }

    throwEveryone(): void {
      const owner = this.owner as AttackableUnitInstance;
      if (owner.isDead) return;
      const pit = owner.position;

      for (const victim of hostilesIn(api, owner, pit, WINGBEAT.radius)) {
        const dx = victim.position.x - pit.x;
        const dy = victim.position.y - pit.y;
        // A direction is never allowed to be (0, 0): a champion standing on
        // the dragon's exact centre would otherwise be dashed to NaN.
        const distance = Math.hypot(dx, dy);
        const ux = distance === 0 ? 1 : dx / distance;
        const uy = distance === 0 ? 0 : dy / distance;

        // Built directly rather than through `Dash.CanDash`: that gate asks
        // whether a unit may dash under its own power, and being thrown is
        // not that. Grounding still stops it, through `Dash`'s own backstop.
        const shove = new api.buffs.Dash(1_000, owner, victim);
        shove.dashDestination = createVector(pit.x + ux * WINGBEAT.landing, pit.y + uy * WINGBEAT.landing);
        shove.dashSpeed = WINGBEAT.dashSpeed;
        victim.addBuff(shove);
        victim.takeDamage(WINGBEAT.damage, owner, 'MAGIC');
      }
    }

    draw(): void {
      const [r, g, b] = this.glow;
      const pos = this.owner.position;

      push();
      noFill();
      if (this.age < WINGBEAT.telegraphMs) {
        // rearing up: a ring closing inward on the pit
        const charge = this.age / WINGBEAT.telegraphMs;
        stroke(r, g, b, 60 + 140 * charge);
        strokeWeight(2 + 3 * charge);
        circle(pos.x, pos.y, WINGBEAT.radius * 2 * (1.35 - 0.35 * charge));
      } else {
        // the beat: a ring racing out, fading as it goes
        const swept = constrain((this.age - WINGBEAT.telegraphMs) / WINGBEAT.burstMs, 0, 1);
        stroke(r, g, b, 220 * (1 - swept));
        strokeWeight(9 * (1 - swept) + 2);
        circle(pos.x, pos.y, WINGBEAT.radius * 2 * (0.3 + 0.9 * swept));
      }
      pop();
    }

    getDisplayBoundingBox() {
      return this.squareDisplayBoundingBox(WINGBEAT.radius * 3);
    }
  };
}

/**
 * The burst drawn when a rite fires — one shape, tinted by whichever element
 * cast it, so all four read as the same creature doing four different things.
 */
function makeRiteBurst(api: ContentApi) {
  return class RiteBurst extends api.SpellObject {
    age = 0;
    glow: [number, number, number] = [255, 255, 255];

    update(): void {
      this.age += deltaTime;
      this.position.set(this.owner.position.x, this.owner.position.y);
      if (this.age >= RITE.burstMs) this.toRemove = true;
    }

    draw(): void {
      const [r, g, b] = this.glow;
      const pos = this.owner.position;
      const swept = constrain(this.age / RITE.burstMs, 0, 1);
      const size = this.owner.stats.size.value;

      push();
      noFill();
      stroke(r, g, b, 230 * (1 - swept));
      strokeWeight(6 * (1 - swept) + 1);
      circle(pos.x, pos.y, size * (1 + 1.6 * swept));
      stroke(r, g, b, 140 * (1 - swept));
      strokeWeight(3);
      circle(pos.x, pos.y, size * (1 + 2.4 * swept));
      pop();
    }

    getDisplayBoundingBox() {
      return this.squareDisplayBoundingBox(this.owner.stats.size.value * 4);
    }
  };
}

/**
 * The fire drake's brand. A `DamageOverTime` subclass rather than a bare one
 * for the reason `monsters/JungleBuffs.ts`'s red brand records: core's own
 * tick calls `takeDamage` with no type and no label, so a champion killed by
 * it reads "Không rõ" in the death recap.
 */
function makeDragonBurn(api: ContentApi) {
  return class DragonBurn extends api.buffs.DamageOverTime {
    name = ELEMENTS[0].name;
    stackId = 'dragon-burn';
    damagePerTick = RITE.infernal.damagePerTick;
    tickInterval = RITE.infernal.tickMs;
    image = api.asset('monster_Elemental_Dragon');
  };
}

export default function makeDragonAbilities(api: ContentApi): MonsterAbility[] {
  const buffs = new Map<string, ReturnType<typeof makeDragonBuff>>();
  for (const element of ELEMENTS) buffs.set(element.id, makeDragonBuff(api, element));

  const DragonPitRing = makeDragonPitRing(api);
  const Wingbeat = makeWingbeat(api);
  const RiteBurst = makeRiteBurst(api);
  const DragonBurn = makeDragonBurn(api);

  /** Pits already wearing a ring — see `rotation` for why this is per camp. */
  const ringed = new WeakSet<object>();

  const spawnAt = (monster: MonsterInstance, object: object): void => {
    monster.game?.objectManager?.addObject?.(object as never);
  };

  return [
    {
      name: WINGBEAT.name,
      cooldownMs: WINGBEAT.cooldownMs,
      // Its own reach, not the camp's: the beat clears the pit, so what
      // matters is whether anyone is *in* the pit, not whether the one body
      // it has locked is inside breath range.
      range: WINGBEAT.radius,
      cast(monster) {
        spawnAt(monster, new Wingbeat(monster as never));
      },
      /**
       * The pit's ring, made once per camp and never again.
       *
       * `onSpawn` fires on every life, and the ring outlives the body, so
       * without the guard a pit would grow one more ring every sixty seconds
       * for the whole match.
       */
      onSpawn(monster) {
        if (ringed.has(monster.camp)) return;
        ringed.add(monster.camp);
        spawnAt(monster, new DragonPitRing(monster as never, monster.camp));
      },
    },
    {
      name: RITE.name,
      cooldownMs: RITE.cooldownMs,
      range: RITE.range,
      cast(monster, target) {
        const element = elementFor(monster.camp);
        const burst = new RiteBurst(monster as never);
        burst.glow = [...element.glow] as [number, number, number];
        spawnAt(monster, burst);

        switch (element.id) {
          case 'infernal': {
            const burn = new DragonBurn(RITE.infernal.durationMs, monster as never, target as never);
            target.addBuff(burn as never);
            return;
          }
          case 'ocean': {
            // Its own maximum, so the drake heals for the same share of itself
            // however a map has scaled the pit (`MapTuning.monsters.healthMult`).
            monster.takeHeal(monster.stats.maxHealth.value * RITE.ocean.healFraction, monster);
            return;
          }
          case 'cloud': {
            for (const victim of hostilesIn(api, monster as never, monster.position, RITE.range)) {
              const slow = new api.buffs.Slow(RITE.cloud.durationMs, monster as never, victim);
              slow.percent = RITE.cloud.slowPercent;
              victim.addBuff(slow);
              victim.takeDamage(RITE.cloud.damage, monster as never, 'MAGIC');
            }
            return;
          }
          default: {
            const shell = new api.buffs.Shield(
              RITE.mountain.durationMs,
              monster as never,
              monster as never
            );
            shell.amount = RITE.mountain.shield;
            monster.addBuff(shell);
          }
        }
      },
    },
    blessing(DRAGON.name, (killer, monster) => {
      // The element is read *before* the rotation advances, so the blessing
      // paid is the drake that was actually standing in the pit — not the one
      // that will be there next time.
      const element = elementFor(monster.camp);
      advance(monster.camp);

      const champion = beneficiary(api, killer);
      if (!champion) return;

      const DragonBuff = buffs.get(element.id);
      if (!DragonBuff) return;
      for (const ally of teamOf(api, champion)) {
        ally.addBuff(new DragonBuff(DRAGON.durationMs, champion, ally));
      }
    }),
  ];
}
