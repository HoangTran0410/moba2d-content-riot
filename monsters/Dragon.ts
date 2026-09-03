import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type { MonsterAbility } from '@moba2d/core/content/types';
import { beneficiary, blessing, drawBlessingRing, hostilesIn, teamOf } from './JungleBuffs';

/**
 * Rồng nguyên tố — one pit, seven creatures, and a buff that **replaces**.
 *
 * ## The buff never stacks, and that is a design decision with teeth
 *
 * `BuffAddType.REPLACE_EXISTING` plus one shared `stackId` for every drake.
 * Taking a Cloud dragon therefore *removes* your Infernal buff.
 *
 * The alternative — a slot per element — is the source game's, and it turns
 * the pit into accumulation: take every drake, hold every bonus, and the
 * team that won the first fight wins the rest by arithmetic. One slot makes
 * each drake a *choice*: the one currently up is the buff currently on offer,
 * and it costs you the one you already have.
 *
 * **`stackId` is stated explicitly on every element, and has to be.**
 * `Buff.stackId` defaults to `new.target` — the class itself — so N classes
 * would land in N separate slots and quietly stack after all, which is
 * exactly the outcome this file exists to avoid and exactly the sort of thing
 * that looks correct in review. If the "replace" flavour ever plays badly,
 * one string here (`'dragon:' + element`) turns it into N slots.
 *
 * ## The pit is a different fight every rotation
 *
 * The element used to decide only the *reward*. It decides the whole creature
 * now: `dressFor` writes the body's own art, name, swing style, swing colour
 * and swing rate on every spawn, and one shared `MonsterAbility` reads
 * `elementFor(monster.camp)` and branches. Scouting which drake is up is a
 * real decision rather than trivia you learn at the moment you kill it — which
 * is also why the pit wears a ring in its element's colour.
 *
 * **Every one of those differences is the wiki's own.** Each drake's page
 * states how it fights in one line, and those lines are the design here rather
 * than six inventions: Infernal *"can damage multiple champions"* (a cone),
 * Ocean *"attacks slow the target"*, Cloud *"moves and attacks quickly"*,
 * Mountain *"a slow but durable ranged attacker… attacks very slowly"*,
 * Hextech *"every 4th attack chains to up to 3 of the closest nearby targets
 * and slows all targets struck"*, Chemtech *"becomes stronger the lower its
 * health gets"*. The **numbers** are none of Riot's — a champion here has a
 * 100-point health pool — but the shapes are.
 *
 * Beside that sits one thing every drake does: a wingbeat that throws
 * everything out of the pit. It reads as the boss noticing you because it
 * fires on the first frame of the fight for free — `Monster._abilityCooldowns`
 * starts at zero and `castAbility` runs before the reach check — and then
 * recurs, which a once-per-life trigger would not. It **pushes** rather than
 * knocking up on purpose: `monsters/Baron.ts`'s `SLAM` already owns airborne,
 * and two bosses with the same verb are one fight wearing two skins.
 *
 * ## The seventh
 *
 * `ELDER` is not an elemental drake and is not in `ELEMENTS`. It is what the
 * pit spawns once all six have been taken — the rotation's own counter is
 * already the number of kills, so "a full cycle" is a fact the file has rather
 * than state it has to keep. It is tougher than the six (a `StatAmp` written
 * on spawn), and its blessing is the burn everyone knows: every basic attack
 * the winning team lands carries extra damage, for a much shorter time than an
 * elemental buff lasts.
 *
 * Folding it into `ELEMENTS` as a seventh element would have been fewer lines
 * and the wrong shape: soul-and-Elder is a *reward for having taken the pit
 * repeatedly*, and an entry in a list that comes round every seven kills like
 * any other is exactly what it must not read as.
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
   * One slot for every drake, Elder included. Never let this become a template
   * string per element unless N independent buffs is what you mean.
   */
  stackId: 'dragon-blessing',
  /**
   * How much bigger a blessing is for having been taken later.
   *
   * ## What this fixes
   *
   * The bonuses below were sized against a champion's ~100 health pool, where
   * +8 attack damage is a real swing. They stayed that size for the whole
   * match while the shop did not: by the time a build is four items deep, a
   * single one of them sells more attack damage than the pit pays, and a team
   * that fought for a drake had bought better with the gold it cost them.
   * Reported as "chỉ số cộng thêm ngon đầu trận, càng cuối trận càng đuối,
   * kiểu mua đồ còn nhiều chỉ số hơn đi ăn rồng".
   *
   * ## Why the scale is read once, when it is taken
   *
   * A blessing lasts 180s against a 60s respawn, and a new drake *replaces*
   * the held one (`stackId`, `REPLACE_EXISTING`), so nobody is ever carrying a
   * stale grant: whatever is on you now was earned inside the last three
   * minutes. Growing an already-granted buff would be re-applying a stat
   * modifier every few seconds to move a number nobody could be holding from
   * long enough ago to notice.
   *
   * Doubling at fifteen minutes and capping at triple keeps the early pit
   * exactly as it is — which is the half that was said to be right — and lands
   * a late one near one good item, for a buff that is temporary, contested,
   * and has to be won again in three minutes.
   */
  scaling: {
    perMinute: 1 / 15,
    max: 3,
  },
} as const;

/**
 * The blessing a team earns for taking the pit *at this point in the match*.
 *
 * **`percentBonus` is deliberately left alone**, and it is the one slot that
 * must be: it is a share of what the wearer already has
 * (`(… + flatBonus) * (1 + percentBonus)`), so it grows with the build by
 * construction and never went stale in the first place. Scaling it would
 * treble the wind drake's move speed, which is not a bigger reward but a
 * different game.
 *
 * Every other slot is a fixed quantity — points, or a share of an *unbuilt*
 * base — and a fixed quantity is exactly what a shop out-grows.
 */
export function scaledBonuses(bonuses: StatAmpBonuses, matchTimeMs: number): StatAmpBonuses {
  const minutes = Math.max(0, matchTimeMs) / 60_000;
  const scale = Math.min(DRAGON.scaling.max, 1 + minutes * DRAGON.scaling.perMinute);
  if (scale === 1) return bonuses;

  const scaled: Record<string, Record<string, number>> = {};
  for (const [stat, slots] of Object.entries(bonuses as Record<string, Record<string, number>>)) {
    const next: Record<string, number> = {};
    for (const [slot, amount] of Object.entries(slots)) {
      next[slot] = slot === 'percentBonus' ? amount : amount * scale;
    }
    scaled[stat] = next;
  }
  return scaled as StatAmpBonuses;
}

/** `[r, g, b]`, the shape both the ring and the blessing glow want. */
type Glow = [number, number, number];

/**
 * What the body *is* while a given drake is up — art, name and how it swings.
 *
 * Written onto the monster by `dressFor` at every spawn, which is legal
 * because all five are ordinary mutable fields on `Monster` and none of them
 * is read before the first `update()`. It is also the only way to do it: a
 * `MonsterBody` is one row in `data.ts` and cannot describe seven creatures.
 */
export interface DrakeLook {
  name: string;
  avatar: string;
  glow: Glow;
  attackStyle: 'melee' | 'ranged' | 'breath';
  attackColor: number[];
  /** ms between swings. The wiki's own spread: Cloud is fast, Mountain is not. */
  attackInterval: number;
}

export interface Drake extends DrakeLook {
  id: string;
  /** What killing it pays the team, as one `StatAmp`'s worth. */
  bonuses: StatAmpBonuses;
}

type StatAmpBonuses = InstanceType<ContentApi['buffs']['StatAmp']>['bonuses'];

/**
 * The six elemental drakes.
 *
 * Each is one `StatAmp`'s worth of bonus, sized so that any single one is
 * worth fighting for and none of them decides a match on its own — a champion
 * pool is ~100 health, so +8 attack damage is a real swing.
 *
 * The bonus each pays is the wiki's own Dragon Slayer stack, translated into
 * a stat this engine has: Infernal Might is attack damage and ability power,
 * Oceanic Will is sustain, Cloudbringer's Grace is movement, Mountainous Vigor
 * is armour and magic resistance, Hextech Prowess is ability haste and attack
 * speed. **Chemtech Blight is the one that could not be translated** — it
 * grants tenacity and heal-and-shield power, and this engine has neither
 * stat — so it pays omnivamp instead: sustain drawn from damage dealt, which
 * is the nearest thing in the stat block to a chem-baron's idea of a bonus,
 * and an axis no other drake grants.
 */
export const ELEMENTS: readonly Drake[] = [
  {
    id: 'infernal',
    name: 'Rồng Lửa',
    avatar: 'monster_Infernal_Drake',
    glow: [255, 130, 60],
    // "A ranged attacker. It can damage multiple champions." — the cone.
    attackStyle: 'breath',
    attackColor: [255, 138, 58],
    attackInterval: 1_600,
    bonuses: { attackDamage: { flatBonus: 8 }, abilityPower: { flatBonus: 0.12 } },
  },
  {
    id: 'ocean',
    name: 'Rồng Nước',
    avatar: 'monster_Ocean_Drake',
    glow: [70, 190, 235],
    // "A ranged attacker that slows its target. It can only damage a single
    // champion." — a spat bolt, and the slow arrives with its rite.
    attackStyle: 'ranged',
    attackColor: [90, 200, 240],
    attackInterval: 1_600,
    bonuses: { healthRegen: { flatBonus: 0.06 }, manaRegen: { flatBonus: 0.05 } },
  },
  {
    id: 'cloud',
    name: 'Rồng Gió',
    avatar: 'monster_Cloud_Drake',
    glow: [190, 210, 255],
    // "A mobile and fast ranged attacker." Nothing else in the pit swings
    // this often, and it is the whole of what makes this rotation feel light.
    attackStyle: 'ranged',
    attackColor: [205, 220, 255],
    attackInterval: 1_050,
    bonuses: { speed: { percentBonus: 0.12 } },
  },
  {
    id: 'mountain',
    name: 'Rồng Đất',
    avatar: 'monster_Mountain_Drake',
    glow: [200, 170, 110],
    // "A slow but durable ranged attacker… attacks very slowly. It can damage
    // multiple champions." Same cone as the fire drake, half the rate.
    attackStyle: 'breath',
    attackColor: [214, 184, 120],
    attackInterval: 2_400,
    bonuses: { armor: { flatBonus: 10 }, magicResist: { flatBonus: 10 } },
  },
  {
    id: 'hextech',
    name: 'Rồng Công Nghệ',
    avatar: 'monster_Hextech_Drake',
    glow: [130, 235, 220],
    attackStyle: 'ranged',
    attackColor: [150, 245, 230],
    attackInterval: 1_400,
    bonuses: { abilityHaste: { flatBonus: 15 }, attackSpeed: { percentBaseBonus: 0.15 } },
  },
  {
    id: 'chemtech',
    name: 'Rồng Hoá Học',
    avatar: 'monster_Chemtech_Drake',
    glow: [150, 220, 90],
    attackStyle: 'ranged',
    attackColor: [170, 230, 100],
    attackInterval: 1_800,
    bonuses: { omnivamp: { flatBonus: 0.12 } },
  },
];

/**
 * The Elder, and what makes it worth clearing the pit six times for.
 *
 * `onHitDamage` rather than a bigger stat line, because the Elder buff is not
 * a stat in the source game either — it is a burn every hit carries, and this
 * engine already has one flat number that means exactly that. Short, and
 * shorter than any elemental buff: it is meant to be a window a team wins a
 * game inside, not a phase of the match.
 */
export const ELDER: Drake & { readonly durationMs: number; readonly body: StatAmpBonuses } = {
  id: 'elder',
  name: 'Rồng Cổ Đại',
  avatar: 'monster_Elder_Dragon',
  glow: [235, 240, 255],
  attackStyle: 'breath',
  attackColor: [230, 245, 255],
  attackInterval: 1_500,
  bonuses: { onHitDamage: { flatBonus: 7 } },
  durationMs: 90_000,
  /**
   * What it wears on top of the body `data.ts` describes. Health is
   * deliberately **not** on this list: raising `maxHealth` does not raise
   * `health`, so the Elder would arrive already wounded and then visibly
   * regenerate for two seconds. Resistances and damage make it the harder
   * fight without that.
   */
  body: {
    attackDamage: { flatBonus: 10 },
    armor: { flatBonus: 25 },
    magicResist: { flatBonus: 25 },
  },
};

/** Everything the pit can hold, in the order it holds them. */
export const ROTATION: readonly Drake[] = [...ELEMENTS, ELDER];

export type DragonElement = Drake;

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
   * It used to be 560. That threw every target past the only range it has and
   * left the boss standing in an empty pit until they chose to walk back: a
   * signature ability whose whole effect was to end its own fight. Landing
   * short of the reach keeps the breath on you all the way back in, so the
   * beat costs *you* the tempo — melee out of range, out of the pit, walking —
   * rather than costing the dragon its turn.
   *
   * Larger than `radius` on purpose: everyone caught is thrown outward, never
   * dragged in.
   */
  landing: 380,
  damage: 10,
  dashSpeed: 24,
  /**
   * The leap, in three parts, and the reason the ability reads at all.
   *
   * It used to be a five-hundred-millisecond ring closing on the pit and then
   * a shove: a telegraph that said "something is about to happen here" and
   * nothing about *what*. Every hostile in 240px was thrown outward by a
   * creature that had visibly not moved, which is the shape of a bug rather
   * than of an attack.
   *
   * So the dragon takes off, hangs, and comes down on the pit, and the
   * shockwave is what the landing makes. The three legs are the arc a player
   * can read the ability out of: `rise` is fast and eases *out* so the take-off
   * is a shove of its own, `hang` is the beat that makes the top of the arc a
   * moment rather than a corner, and `slam` is short and accelerates, because
   * a fall that is not faster than the rise does not read as a fall.
   *
   * 760ms of wind-up against the old 500 is deliberate: this is a boss's
   * signature and the whole point is that it is coming and you can see it. The
   * ground marker is up for all of it.
   */
  riseMs: 380,
  hangMs: 180,
  slamMs: 200,
  /**
   * How far the body appears to leave the ground.
   *
   * `Stats.height` is the engine's own airborne channel — `AttackableUnit`
   * draws a unit at `size + height`, which is what `buffs/Airborne` uses to
   * lift the things this very ability throws. Seventy against a drake's own
   * size is roughly a body and a half: unmistakably off the ground, and short
   * of the size where the sprite stops reading as the same creature.
   */
  liftHeight: 70,
  /** How long the shockwave stays on screen after it. */
  burstMs: 320,
} as const;

/**
 * When the body reaches the ground again, and therefore when everything the
 * ability actually *does* happens. Exported because it is the one instant the
 * suite has to name, and deriving it in the test would be the test agreeing
 * with a copy of the sum rather than with the sum.
 */
export const WINGBEAT_LANDS_AT = WINGBEAT.riseMs + WINGBEAT.hangMs + WINGBEAT.slamMs;

/**
 * One ability, seven fights. Each rhymes with the blessing its drake pays, so
 * the thing you fight tells you what you are fighting for: the fire drake
 * burns, the water drake heals itself and drags you down, the wind drake blows
 * you around, the earth drake hardens, the hextech drake chains, the chemtech
 * drake gasses the pit and gets faster as it dies.
 *
 * The one that deals no damage at all (`mountain`) is the point of doing this
 * as seven fights rather than seven damage numbers — a shield turns the pit
 * into a burst check, which no other camp in this pack asks for.
 */
export const RITE = {
  name: 'Nghi Thức Nguyên Tố',
  cooldownMs: 7_000,
  range: 340,
  /** How long the elemental burst is drawn for. */
  burstMs: 460,
  infernal: { damagePerTick: 3, tickMs: 600, durationMs: 3_000 },
  /** A fraction of its own maximum health, per cast, plus the wiki's own slow. */
  ocean: { healFraction: 0.07, slowPercent: 0.3, slowDurationMs: 2_000 },
  cloud: { damage: 8, slowPercent: 0.4, durationMs: 2_500 },
  mountain: { shield: 140, durationMs: 6_000 },
  /** "chains to up to 3 of the closest nearby targets and slows all struck". */
  hextech: { damage: 9, arcs: 3, slowPercent: 0.4, durationMs: 2_000 },
  /** The gas, and the frenzy the wiki describes as scaling with missing health. */
  chemtech: {
    damagePerTick: 4,
    tickMs: 700,
    durationMs: 3_500,
    attackSpeedBonus: 0.5,
    frenzyMs: 5_000,
  },
  elder: { damagePerTick: 6, tickMs: 500, durationMs: 4_000 },
} as const;

/**
 * Which drake the next kill pays, per camp.
 *
 * Keyed by the camp object rather than held in one closure variable, because
 * `contentRegistry().abilitiesFor(id)` hands the *same* ability array to every
 * body of every slot the monster fills. One counter would make two dragon pits
 * on a two-pit map take turns with each other's rotation instead of each
 * running its own. A `WeakMap` also means a camp that goes away takes its
 * counter with it.
 */
const rotation = new WeakMap<object, number>();

/** The order each pit runs, drawn once. See `cycleFor`. */
const cycle = new WeakMap<object, readonly Drake[]>();

/**
 * Draws the order this pit will run its six elementals in, once per match.
 *
 * Fire first was hardcoded, so every match opened the same way and scouting the
 * pit told you nothing you did not already know. It is shuffled now — but from
 * `Game.matchSeed`, never `Math.random()`, and that distinction is the whole
 * design. A LAN client *builds* the jungle rather than receiving it, so a local
 * draw gives the host an infernal and the client an ocean, each paying a
 * different buff for the same kill, with nothing in the protocol able to notice.
 * That is not hypothetical: it shipped once and was reverted for it.
 *
 * The shuffle itself comes off `api.utils` rather than being written here.
 * A pack cannot value-import anything from core at runtime — the bundle marks
 * core `external`, so a surviving import is a bare specifier nothing resolves
 * in the browser — so `api` is the only way to share a function at all, and a
 * second copy of a seeded shuffle is one copy away from two packs disagreeing
 * about what a seed means.
 *
 * The pit's own coordinates are mixed in so a two-pit map does not run one
 * order twice. They come from the map data both sides loaded, so they are as
 * shared as the seed is.
 *
 * **The Elder is not shuffled.** It is the seventh drake, not one of the six —
 * what it is *for* is that the cycle has been all the way round.
 */
function seedCycle(api: ContentApi, camp: object, seed?: number): void {
  if (cycle.has(camp) || seed === undefined) return;

  const pit = camp as { x?: number; y?: number };
  const mixed =
    (seed ^
      Math.imul(Math.round(pit.x ?? 0), 0x4665_1e5d) ^
      Math.imul(Math.round(pit.y ?? 0), 0x1276_3f1f)) >>>
    0;
  cycle.set(camp, [...api.utils.seededShuffle(ELEMENTS, mixed), ELDER]);
}

/**
 * The order this pit runs, or the written one for a pit nothing has spawned
 * into yet — the pit ring is created inside `onSpawn`, so in a running match
 * there is no such moment.
 */
function cycleFor(camp: object): readonly Drake[] {
  return cycle.get(camp) ?? ROTATION;
}

/**
 * The order this pit is running, once something has spawned into it.
 *
 * Exported because "which drake is up" stopped being answerable from the
 * source the moment it became per-match: a test, and any future scouting HUD,
 * has to be able to ask the pit rather than read `ROTATION` and assume.
 */
export function dragonCycle(camp: object): readonly Drake[] {
  return cycleFor(camp);
}

/**
 * The drake currently in the pit. The last index of the cycle is the Elder.
 *
 * Reads whatever order `onSpawn` drew for this pit, and falls back to the
 * canonical one for a pit nothing has spawned into yet — the pit ring is
 * created inside `onSpawn`, so in a running match there is no such moment.
 */
export function elementFor(camp: object): Drake {
  const order = cycleFor(camp);
  return order[(rotation.get(camp) ?? 0) % order.length];
}

function advance(camp: object): void {
  const order = cycleFor(camp);
  rotation.set(camp, ((rotation.get(camp) ?? 0) + 1) % order.length);
}

/** Test seam: put a camp's rotation *and* its drawn order back to the start. */
export function resetDragonRotation(camp: object): void {
  rotation.delete(camp);
  cycle.delete(camp);
}

function makeDragonBuff(api: ContentApi, drake: Drake) {
  return class DragonBuff extends api.buffs.StatAmp {
    name = drake.name;
    // See the header. Not `new.target`, not per element.
    stackId = DRAGON.stackId;
    image = api.asset(drake.avatar as never);
    buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
    /**
     * Read per instance, not per class: field initialisers run after
     * `super()`, so `this.game` is already here, and `StatAmp.onCreate` reads
     * this once when the buff is added. See `scaledBonuses`.
     */
    bonuses: StatAmpBonuses = scaledBonuses(drake.bonuses, this.game?.matchTimeMs ?? 0);

    draw(): void {
      drawBlessingRing(this.targetUnit, drake.glow, 4);
    }
  };
}

/**
 * The pit's own ring, in whatever drake is currently up.
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
      const drake = elementFor(this.camp);
      const [r, g, b] = drake.glow;
      const spin = frameCount / 120;
      const radius = this.camp.r;
      // The Elder gets a second, counter-turning ring rather than a different
      // colour: "something else is in the pit" has to be readable from the
      // minimap distance, and a pale ring alone is not.
      const elder = drake.id === ELDER.id;

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
      if (elder) {
        stroke(r, g, b, 190);
        strokeWeight(4);
        for (let i = 0; i < 6; i++) {
          const start = -spin * 1.6 + (TWO_PI * i) / 6;
          arc(
            this.camp.x,
            this.camp.y,
            radius * 2.5,
            radius * 2.5,
            start,
            start + 0.35
          );
        }
      }
      pop();
    }

    getDisplayBoundingBox() {
      return this.squareDisplayBoundingBox((this.camp.r + 80) * 2);
    }
  };
}

/**
 * The leap: up, hang, down — and the shockwave is what the landing makes.
 *
 * ## The lift is driven per frame rather than by a buff
 *
 * `buffs/Airborne` is the obvious tool and is the wrong one here. It is a
 * *step*: one `height` bonus on and, later, off. `AttackableUnit` smooths what
 * it draws with a fixed `lerp(..., 0.3)`, so a step of any size becomes the
 * same ~150ms pop whatever duration the buff was given — which is precisely
 * what a leap must not be, since the whole ability is the shape of the arc.
 * Writing `height` each frame keeps the curve here, where the three timings
 * that define it also live, and the renderer's lerp then reads as weight
 * rather than as the animation.
 *
 * `onRemoved` puts the height back, and so does landing. Both are needed: a
 * drake killed at the top of its own leap would otherwise stay drawn at a body
 * and a half forever, on a corpse.
 *
 * ## The telegraph is readability, not counterplay
 *
 * Nothing walks 330px in three quarters of a second, and that was true of the
 * old half-second ring too. What the leap adds is *what*: a shove that arrives
 * from a creature which has not moved reads as the game glitching, and one
 * that arrives from a creature landing on the pit reads as the boss doing
 * something.
 */
function makeWingbeat(api: ContentApi) {
  return class Wingbeat extends api.SpellObject {
    age = 0;
    struck = false;
    glow: Glow = [220, 235, 255];
    /** Whatever the body's own height was, restored on landing and on removal. */
    private groundHeight = 0;
    private lifted = false;

    update(): void {
      this.age += deltaTime;
      this.position.set(this.owner.position.x, this.owner.position.y);

      // Landing is checked *before* the lift, so the frame the body arrives is
      // never also a frame that writes a height onto it. Written the other way
      // round the arc happens to end at zero anyway and `drop` looks
      // redundant — right up to a long frame that steps over the landing, or a
      // drake whose body carries a height of its own.
      if (!this.struck && this.age >= WINGBEAT_LANDS_AT) {
        this.struck = true;
        this.drop();
        this.throwEveryone();
      } else if (!this.struck) {
        this.lift();
      }
      if (this.age >= WINGBEAT_LANDS_AT + WINGBEAT.burstMs) this.toRemove = true;
    }

    /** Where the body is in its arc, 0 on the ground and 1 at the top. */
    private arc(): number {
      const { riseMs, hangMs, slamMs } = WINGBEAT;
      if (this.age < riseMs) {
        // eased out: most of the height is bought in the first half, so the
        // take-off is a shove and the top of the arc is a drift
        const t = this.age / riseMs;
        return 1 - (1 - t) * (1 - t);
      }
      if (this.age < riseMs + hangMs) return 1;
      // eased in: a fall has to be faster than the rise or it is a descent
      const t = constrain((this.age - riseMs - hangMs) / slamMs, 0, 1);
      return 1 - t * t;
    }

    private lift(): void {
      const stats = (this.owner as AttackableUnitInstance).stats;
      if (!this.lifted) {
        this.groundHeight = stats.height.baseValue;
        this.lifted = true;
      }
      stats.height.baseValue = this.groundHeight + WINGBEAT.liftHeight * this.arc();
    }

    private drop(): void {
      if (!this.lifted) return;
      (this.owner as AttackableUnitInstance).stats.height.baseValue = this.groundHeight;
      this.lifted = false;
    }

    onRemoved(): void {
      this.drop();
      super.onRemoved();
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
        shove.dashDestination = createVector(
          pit.x + ux * WINGBEAT.landing,
          pit.y + uy * WINGBEAT.landing
        );
        shove.dashSpeed = WINGBEAT.dashSpeed;
        victim.addBuff(shove);
        victim.takeDamage(WINGBEAT.damage, owner, 'MAGIC');
      }
    }

    draw(): void {
      const [r, g, b] = this.glow;
      const pos = this.owner.position;

      push();
      translate(pos.x, pos.y);

      if (!this.struck) {
        const height = this.arc();
        // The ground marker: where the landing will reach, up for the whole
        // leap. The edge you read is the edge that throws you.
        noFill();
        stroke(r, g, b, 70 + 70 * height);
        strokeWeight(2);
        circle(0, 0, WINGBEAT.radius * 2);

        // The shadow, which is the only thing on the ground while the body is
        // in the air — it shrinks and sharpens as the drake climbs, then races
        // back out under it on the way down.
        noStroke();
        fill(8, 10, 16, 90 + 90 * height);
        const shadow = this.owner.stats.size.value * (1.05 - 0.45 * height);
        ellipse(0, 0, shadow, shadow * 0.55);

        // and the air it is pushing down, three arcs tightening under it
        noFill();
        stroke(r, g, b, 40 + 120 * height);
        for (let ring = 0; ring < 3; ring++) {
          const spread = 0.35 + 0.28 * ring - 0.2 * height;
          strokeWeight(1.5);
          circle(0, 0, WINGBEAT.radius * 2 * spread);
        }
      } else {
        const swept = constrain((this.age - WINGBEAT_LANDS_AT) / WINGBEAT.burstMs, 0, 1);
        const fade = 1 - swept;

        // the impact: a hard flash on the pit that dies fast, so the eye is
        // pulled to the point the shockwave leaves from
        noStroke();
        fill(255, 255, 255, 200 * fade * fade);
        circle(0, 0, WINGBEAT.radius * 0.8 * (0.2 + 0.4 * swept));

        // the shockwave itself, racing out and thinning
        noFill();
        stroke(r, g, b, 230 * fade);
        strokeWeight(10 * fade + 2);
        circle(0, 0, WINGBEAT.radius * 2 * (0.25 + 0.95 * swept));
        // a second, faster edge just ahead of it, so the wave has a front
        stroke(255, 255, 255, 150 * fade);
        strokeWeight(2);
        circle(0, 0, WINGBEAT.radius * 2 * (0.35 + 1.05 * swept));

        // dust thrown outward along eight spokes
        stroke(r, g, b, 140 * fade);
        strokeWeight(3 * fade + 1);
        for (let spoke = 0; spoke < 8; spoke++) {
          const angle = (spoke / 8) * TWO_PI;
          const inner = WINGBEAT.radius * (0.25 + 0.7 * swept);
          const outer = inner + WINGBEAT.radius * 0.22 * fade;
          line(cos(angle) * inner, sin(angle) * inner, cos(angle) * outer, sin(angle) * outer);
        }
      }
      pop();
    }

    getDisplayBoundingBox() {
      return this.squareDisplayBoundingBox(WINGBEAT.radius * 3);
    }
  };
}

/**
 * The burst drawn when a rite fires — one shape, tinted by whichever drake
 * cast it, so all seven read as the same creature doing seven different things.
 */
function makeRiteBurst(api: ContentApi) {
  return class RiteBurst extends api.SpellObject {
    age = 0;
    glow: Glow = [255, 255, 255];

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
 * The arc the hextech drake throws, drawn from the pit to each thing it hit.
 *
 * Its own object rather than lines drawn from the dragon, for the reason
 * `CLAUDE.md` states plainly: an effect that reaches past its caster's body
 * must outlive the frame and survive its caster being culled.
 */
function makeHextechArc(api: ContentApi) {
  return class HextechArc extends api.SpellObject {
    age = 0;
    ends: { x: number; y: number }[] = [];
    from = { x: 0, y: 0 };
    lifeMs = 260;

    update(): void {
      this.age += deltaTime;
      if (this.age >= this.lifeMs) this.toRemove = true;
    }

    draw(): void {
      const left = 1 - constrain(this.age / this.lifeMs, 0, 1);
      push();
      stroke(150, 245, 230, 240 * left);
      strokeWeight(3 + 2 * left);
      for (const end of this.ends) {
        // A kink at the midpoint, offset by the arc's own age, so it reads as
        // an electric arc rather than as a laser sight.
        const midX = (this.from.x + end.x) / 2 + Math.sin(this.age / 18) * 14;
        const midY = (this.from.y + end.y) / 2 + Math.cos(this.age / 15) * 14;
        line(this.from.x, this.from.y, midX, midY);
        line(midX, midY, end.x, end.y);
      }
      pop();
    }

    getDisplayBoundingBox() {
      return this.squareDisplayBoundingBox(RITE.range * 2.5);
    }
  };
}

/**
 * A brand that names itself.
 *
 * A `DamageOverTime` subclass rather than a bare one for the reason
 * `monsters/JungleBuffs.ts`'s red brand records: core's own tick calls
 * `takeDamage` with no type and no label, so a champion killed by it reads
 * "Không rõ" in the death recap.
 */
function makeDrakeBurn(api: ContentApi, id: string, label: string, avatar: string) {
  return class DrakeBurn extends api.buffs.DamageOverTime {
    name = label;
    stackId = `dragon-burn-${id}`;
    image = api.asset(avatar as never);
  };
}

export default function makeDragonAbilities(api: ContentApi): MonsterAbility[] {
  const buffs = new Map<string, ReturnType<typeof makeDragonBuff>>();
  for (const drake of ROTATION) buffs.set(drake.id, makeDragonBuff(api, drake));

  const DragonPitRing = makeDragonPitRing(api);
  const Wingbeat = makeWingbeat(api);
  const RiteBurst = makeRiteBurst(api);
  const HextechArc = makeHextechArc(api);

  const InfernalBurn = makeDrakeBurn(api, 'infernal', ELEMENTS[0].name, ELEMENTS[0].avatar);
  const ChemtechGas = makeDrakeBurn(api, 'chemtech', ELEMENTS[5].name, ELEMENTS[5].avatar);
  const ElderBurn = makeDrakeBurn(api, 'elder', ELDER.name, ELDER.avatar);

  /** Pits already wearing a ring — see `rotation` for why this is per camp. */
  const ringed = new WeakSet<object>();

  const spawnAt = (monster: MonsterInstance, object: object): void => {
    monster.game?.objectManager?.addObject?.(object as never);
  };

  /**
   * Makes the body *be* the drake currently up.
   *
   * Every field written here is one core reads fresh each frame or each swing
   * — `avatar` at draw, `attackStyle`/`attackColor` when `launchAttack` builds
   * the swing, `attackInterval` when it reloads — so writing them on spawn is
   * enough and there is nothing to undo on death.
   */
  const dressFor = (monster: MonsterInstance, drake: Drake): void => {
    monster.name = drake.name;
    monster.avatar = api.asset(drake.avatar as never);
    monster.attackStyle = drake.attackStyle;
    monster.attackColor = [...drake.attackColor];
    monster.attackInterval = drake.attackInterval;
  };

  /** The Elder's extra hide, as a buff on the body rather than a second preset. */
  const hardenElder = (monster: MonsterInstance): void => {
    const amp = new api.buffs.StatAmp(Infinity, monster as never, monster as never);
    amp.stackId = 'elder-body';
    amp.bonuses = ELDER.body;
    monster.addBuff(amp as never);
  };

  const slow = (
    monster: MonsterInstance,
    victim: AttackableUnitInstance,
    percent: number,
    durationMs: number
  ): void => {
    const chill = new api.buffs.Slow(durationMs, monster as never, victim);
    chill.percent = percent;
    victim.addBuff(chill);
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
       * Everything that has to be true before anyone touches this pit.
       *
       * Two jobs with two different lifetimes, which is why the guard covers
       * only one of them. The **ring** is made once per camp and never again —
       * `onSpawn` fires on every life and the ring outlives the body, so
       * without the guard a pit would grow one more ring every sixty seconds
       * for the whole match. The **dressing** is the opposite: it has to run
       * on every spawn, because the whole point is that the next body in this
       * pit is a different creature from the last one.
       */
      onSpawn(monster) {
        // First thing, and the only place with a `game` in hand: the order this
        // pit will run is drawn here, from the match seed, once. Everything
        // below reads it back through `elementFor`.
        seedCycle(api, monster.camp, monster.game?.matchSeed);
        const drake = elementFor(monster.camp);
        dressFor(monster as never, drake);
        if (drake.id === ELDER.id) hardenElder(monster as never);

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
        const drake = elementFor(monster.camp);
        const burst = new RiteBurst(monster as never);
        burst.glow = [...drake.glow] as Glow;
        spawnAt(monster, burst);

        switch (drake.id) {
          case 'infernal': {
            const burn = new InfernalBurn(
              RITE.infernal.durationMs,
              monster as never,
              target as never
            );
            burn.damagePerTick = RITE.infernal.damagePerTick;
            burn.tickInterval = RITE.infernal.tickMs;
            target.addBuff(burn as never);
            return;
          }
          case 'ocean': {
            // Its own maximum, so the drake heals for the same share of itself
            // however a map has scaled the pit (`MapTuning.monsters.healthMult`).
            monster.takeHeal(monster.stats.maxHealth.value * RITE.ocean.healFraction, monster);
            slow(monster, target as never, RITE.ocean.slowPercent, RITE.ocean.slowDurationMs);
            return;
          }
          case 'cloud': {
            for (const victim of hostilesIn(api, monster as never, monster.position, RITE.range)) {
              slow(monster, victim, RITE.cloud.slowPercent, RITE.cloud.durationMs);
              victim.takeDamage(RITE.cloud.damage, monster as never, 'MAGIC');
            }
            return;
          }
          case 'hextech': {
            // The nearest few rather than everyone in range: the wiki's own
            // "up to 3 of the closest nearby targets", and it is what makes
            // this different from the wind drake's blanket gust.
            const pit = monster.position;
            const struck = hostilesIn(api, monster as never, pit, RITE.range)
              .map(victim => ({
                victim,
                distance: Math.hypot(victim.position.x - pit.x, victim.position.y - pit.y),
              }))
              .sort((left, right) => left.distance - right.distance)
              .slice(0, RITE.hextech.arcs);

            const arc = new HextechArc(monster as never);
            arc.from = { x: pit.x, y: pit.y };
            arc.ends = struck.map(({ victim }) => ({ x: victim.position.x, y: victim.position.y }));
            spawnAt(monster, arc);

            for (const { victim } of struck) {
              slow(monster, victim, RITE.hextech.slowPercent, RITE.hextech.durationMs);
              victim.takeDamage(RITE.hextech.damage, monster as never, 'MAGIC');
            }
            return;
          }
          case 'chemtech': {
            // The gas on everyone in the pit, and the frenzy on itself — the
            // wiki's drake gets faster as its health falls, and a buff it puts
            // on when it casts is the version of that this engine can express
            // without a per-frame hook nothing else needs.
            for (const victim of hostilesIn(api, monster as never, monster.position, RITE.range)) {
              const gas = new ChemtechGas(RITE.chemtech.durationMs, monster as never, victim);
              gas.damagePerTick = RITE.chemtech.damagePerTick;
              gas.tickInterval = RITE.chemtech.tickMs;
              victim.addBuff(gas as never);
            }
            const frenzy = new api.buffs.StatAmp(
              RITE.chemtech.frenzyMs,
              monster as never,
              monster as never
            );
            frenzy.stackId = 'chemtech-frenzy';
            // Points, not a share: a monster's swing rhythm is
            // `attackInterval` and its `stats.attackSpeed` base is 0, so a
            // percentage of it would be a frenzy that does nothing. The
            // *blessings* above land on champions and are shares.
            frenzy.bonuses = { attackSpeed: { flatBonus: RITE.chemtech.attackSpeedBonus } };
            monster.addBuff(frenzy as never);
            return;
          }
          case 'elder': {
            for (const victim of hostilesIn(api, monster as never, monster.position, RITE.range)) {
              const burn = new ElderBurn(RITE.elder.durationMs, monster as never, victim);
              burn.damagePerTick = RITE.elder.damagePerTick;
              burn.tickInterval = RITE.elder.tickMs;
              victim.addBuff(burn as never);
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
      // The drake is read *before* the rotation advances, so the blessing
      // paid is the one that was actually standing in the pit — not the one
      // that will be there next time.
      const drake = elementFor(monster.camp);
      advance(monster.camp);

      const champion = beneficiary(api, killer);
      if (!champion) return;

      const DragonBuff = buffs.get(drake.id);
      if (!DragonBuff) return;
      const durationMs = drake.id === ELDER.id ? ELDER.durationMs : DRAGON.durationMs;
      for (const ally of teamOf(api, champion)) {
        ally.addBuff(new DragonBuff(durationMs, champion, ally));
      }
    }),
  ];
}
