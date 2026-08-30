import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type { MonsterAbility, OnHitEvent, Vec2 } from '@moba2d/core/content/types';

/**
 * The three camps whose meaning is what killing them grants — bùa xanh, bùa
 * đỏ, bùa Baron.
 *
 * Until core grew `MonsterAbility.onKilled` these camps paid gold and nothing
 * else: a 300-health wall with a three-second respawn, worth exactly as much
 * as a wolf and rather more annoying. The blessing is the whole reason the
 * jungle has a route through it, so it belongs where the camp's own behaviour
 * belongs — beside the kit it casts while alive, in the pack's code half,
 * keyed by local monster id in `code.ts`. `Baron.ts` is the model for the
 * shape; this file is the model for the *reward* half of it.
 *
 * ## Why the reward is its own ability entry with a negative range
 *
 * `Monster.castAbility` walks `abilities` every frame and picks the first
 * entry that is off cooldown and within `range ?? attackRange`; the reward is
 * not something a camp *does*, so it must never be picked. The test it has to
 * fail is `dist > range`, and a distance is never negative — so `range: -1`
 * is the one value that is guaranteed to skip on every frame, for every
 * target, for ever (`range: 0` is not: a champion standing exactly on the
 * camp's own centre makes `0 > 0` false and casts it). The alternative was
 * hanging `onKilled` off an ability the camp really has, which works for
 * Baron and is impossible for the two buff camps, which have no kit at all.
 * One shape for all three is worth a documented sentinel.
 *
 * ## Who gets it
 *
 * The killer, if the killer is a champion — a minion or a turret that steals
 * the last hit gets the gold and no blessing, which is the rule everyone
 * already expects from the source game. A **pet's** kill pays its owner: a
 * clone or a summon is its master's hand, and `Pet extends Champion` means
 * the naive check would otherwise bless a body that expires in eight
 * seconds.
 */

/** An `AttackableUnit` instance, without a value import core forbids here. */
type AttackableUnitInstance = InstanceType<ContentApi['units']['AttackableUnit']>;
type MonsterInstance = InstanceType<ContentApi['units']['Monster']>;
type ChampionInstance = InstanceType<ContentApi['units']['Champion']>;

/**
 * **There is no cooldown-reduction stat in this engine**, and that is the one
 * place bùa xanh had to be redesigned rather than transcribed. `Stats` carries
 * nineteen modifiable stats and none of them is CDR; the only cooldown lever
 * core has is `MatchRules.cooldownMultiplier`, which is a *match* rule (the URF
 * slider) applied to everybody at once and read live by `Spell.reducedCooldown`
 * — a buff cannot express "this champion's cooldowns, and only this
 * champion's".
 *
 * So the haste is spent where a cooldown actually lives: the blessing burns an
 * extra share of each of the wearer's spell countdowns every frame, on top of
 * the countdown the runtime is already running. `cooldownHaste: 0.2` means a
 * ten-second ability comes back in a bit over eight. That is a genuine,
 * per-champion cooldown reduction rather than a stand-in for one — and it is
 * the same `currentCooldown` seam Katarina's daggers and Olaf's axe already
 * refund through, so it is not a new reach into core either.
 */
export const BLUE_BUFF = {
  name: 'Bùa Xanh',
  stackId: 'jungle_blue_buff',
  durationMs: 90_000,
  /**
   * Added to `manaRegen`, which `Stats.update` applies **per frame** — base is
   * 0.1, so +0.15 is two and a half times the regeneration a champion has for
   * free (about 15 mana a second at 60fps against a 500 pool).
   */
  manaRegenBonus: 0.15,
  /** Handed back the instant the camp falls, as a share of the wearer's pool. */
  instantManaPercent: 0.25,
  /** Extra share of every ability countdown burned per frame. */
  cooldownHaste: 0.2,
} as const;

/**
 * The brand. Core's `Buff.onHit` runs on landed **basic attacks only**
 * (`combat/OnHit.ts` is walked from `landBasicAttack`), which is exactly the
 * rule bùa đỏ wants — an on-hit that also fired off every ability tick would
 * turn a mage into a permanent burn aura.
 */
export const RED_BUFF = {
  name: 'Bùa Đỏ',
  stackId: 'jungle_red_buff',
  burnStackId: 'jungle_red_burn',
  slowStackId: 'jungle_red_slow',
  durationMs: 90_000,
  /** What one brand adds over its whole life, against a 100-point pool. */
  burnTotal: 9,
  burnDurationMs: 3_000,
  burnTickMs: 500,
  /** A fraction, like every other `Slow.percent`: 0.25 is 25%. */
  slowPercent: 0.25,
  /** Short on purpose — this is a sticky brand, not a root. */
  slowDurationMs: 1_200,
} as const;

/**
 * Baron's hand, on the whole team. `attackDamage` is the fighter's half;
 * `maxMana` is the caster's — this engine has no ability power, so a deeper
 * pool (and the regeneration to refill it) is the honest way to say "your
 * spells hurt more for the next two minutes", because it is the thing that
 * decides how many of them you get to cast in a fight.
 */
export const BARON_BUFF = {
  name: 'Bàn Tay Của Baron',
  stackId: 'jungle_baron_buff',
  durationMs: 120_000,
  attackDamage: 8,
  maxMana: 80,
  /** Per frame, like `manaRegenBonus` above. */
  manaRegenBonus: 0.06,
  /** Per frame; base is 0.06, so this doubles it. */
  healthRegenBonus: 0.06,
} as const;

const BLUE_GLOW: [number, number, number] = [110, 200, 255];
const RED_GLOW: [number, number, number] = [255, 130, 60];
const BARON_GLOW: [number, number, number] = [190, 130, 255];

/**
 * A thin ring worn on the body, in the blessing's own colour, with a slow
 * orbit riding it.
 *
 * One layer and a stroke rather than a fill, per the VFX standard's worn-state
 * rule: a blessing lasts ninety seconds, so anything heavier would sit on top
 * of every fight the wearer takes for a minute and a half. The ring reads at
 * minimum zoom as "that champion has something", and the buff row says which.
 */
export function drawBlessingRing(
  unit: AttackableUnitInstance,
  color: [number, number, number],
  spokes: number
): void {
  const radius = unit.animatedValues.displaySize / 2 + 9;
  const [r, g, b] = color;
  const spin = frameCount / 55;

  push();
  noFill();
  stroke(r, g, b, 150);
  strokeWeight(2);
  circle(unit.position.x, unit.position.y, radius * 2);
  stroke(r, g, b, 230);
  strokeWeight(3);
  for (let i = 0; i < spokes; i++) {
    const start = spin + (TWO_PI * i) / spokes;
    arc(unit.position.x, unit.position.y, radius * 2, radius * 2, start, start + 0.45);
  }
  pop();
}

/**
 * Bùa Xanh: mana regeneration as a stat, plus the cooldown burn `Stats` has
 * no key for.
 */
export function makeBlueBuff(api: ContentApi) {
  return class BlueBuff extends api.buffs.StatAmp {
    name = BLUE_BUFF.name;
    stackId = BLUE_BUFF.stackId;
    // A camp's own portrait is the most legible icon this pack can put on the
    // buff row: it is the thing the player just killed.
    image = api.asset('monster_Blue_Sentinel');
    // Re-clearing the camp rewinds the clock rather than being refused, which
    // is what `STACKS_AND_CONTINUE` with `maxStacks: 1` would do.
    buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
    bonuses = { manaRegen: { flatBonus: BLUE_BUFF.manaRegenBonus } };
    // Written rather than left to `StatAmp`'s own list, which would name the
    // mana regeneration and nothing else — and the regeneration is not why
    // anyone takes this camp. The cooldown burn is an `onUpdate` loop over the
    // wearer's spells, and no stat exists for it to appear as.
    description =
      `Hồi <span class="heal">${Math.round(BLUE_BUFF.instantManaPercent * 100)}% năng lượng tối đa</span> ngay lập tức. ` +
      `Tăng <span class="buff">${Math.round(BLUE_BUFF.manaRegenBonus * 60)}/giây</span> hồi năng lượng và ` +
      `rút ngắn mọi thời gian hồi chiêu <span class="buff">${Math.round(BLUE_BUFF.cooldownHaste * 100)}%</span>.`;

    onUpdate(): void {
      const wearer = this.targetUnit;
      if (!(wearer instanceof api.units.Champion)) return;

      const burn = deltaTime * BLUE_BUFF.cooldownHaste;
      for (const spell of wearer.spells) {
        if (!spell || spell.currentCooldown <= 0) continue;
        spell.currentCooldown = Math.max(0, spell.currentCooldown - burn);
      }
    }

    draw(): void {
      drawBlessingRing(this.targetUnit, BLUE_GLOW, 2);
    }
  };
}

/**
 * The burn bùa đỏ leaves behind. A `DamageOverTime` subclass rather than a
 * bare one for a single reason: core's own tick calls `takeDamage` with no
 * damage type and no source label, so a player killed by the brand would read
 * "Không rõ" in the death recap. This states both — true damage, under the
 * blessing's own name — and hands the flame column back to the base class,
 * which already draws it.
 */
export function makeRedBurn(api: ContentApi) {
  return class RedBrandBurn extends api.buffs.DamageOverTime {
    name = RED_BUFF.name;
    stackId = RED_BUFF.burnStackId;
    image = api.asset('monster_Red_Brambleback');
    damagePerTick = RED_BUFF.burnTotal / (RED_BUFF.burnDurationMs / RED_BUFF.burnTickMs);
    tickInterval = RED_BUFF.burnTickMs;
    flameColor: [number, number, number] = [255, 200, 120];
    emberColor: [number, number, number] = [190, 40, 20];

    onUpdate(): void {
      if (this.targetUnit.isDead) {
        this.deactivateBuff();
        return;
      }

      this._timeSinceLastTick += deltaTime;
      if (this._timeSinceLastTick >= this.tickInterval) {
        this._timeSinceLastTick -= this.tickInterval;
        this.targetUnit.takeDamage(this.damagePerTick, this.sourceUnit, 'TRUE', RED_BUFF.name);
      }

      this._updateFlames();
    }
  };
}

/** Bùa Đỏ: the on-hit brand itself. Carries no stats — it is the `onHit`. */
export function makeRedBuff(api: ContentApi) {
  const RedBrandBurn = makeRedBurn(api);

  return class RedBuff extends api.buffs.Buff {
    name = RED_BUFF.name;
    stackId = RED_BUFF.stackId;
    image = api.asset('monster_Red_Brambleback');
    buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
    // This buff carries no stats and sets no status flags — it is an `onHit`
    // and nothing else — so there is nothing for core to derive a sentence
    // from. Without this the row would hover as a name and a countdown, which
    // is the state every buff in this pack was in.
    description =
      `Đòn đánh thường thiêu đốt mục tiêu: <span class="damage true">${RED_BUFF.burnTotal} sát thương chuẩn</span> ` +
      `trong <span class="time">${RED_BUFF.burnDurationMs / 1000} giây</span> và ` +
      `<span class="buff">Làm Chậm ${Math.round(RED_BUFF.slowPercent * 100)}%</span> trong ` +
      `<span class="time">${RED_BUFF.slowDurationMs / 1000} giây</span>.`;

    onHit(hit: OnHitEvent): void {
      // The brand belongs to the swing, not to every application the swing
      // fans out into: a Runaan bolt or a phantom hit re-applying it would
      // triple the burn off one attack.
      if (hit.echo) return;

      const burn = new RedBrandBurn(RED_BUFF.burnDurationMs, this.targetUnit, hit.victim);
      hit.victim.addBuff(burn);

      // RENEW_EXISTING, the aura pattern (Ekko Q, Anivia R, Singed W): a
      // brand re-applied on every swing of a 1.65-attacks-a-second marksman
      // would otherwise stack ten deep inside four seconds and read as a root.
      const slow = new api.buffs.Slow(RED_BUFF.slowDurationMs, this.targetUnit, hit.victim);
      slow.name = RED_BUFF.name;
      slow.stackId = RED_BUFF.slowStackId;
      slow.description = `Bị Bùa Đỏ thiêu đốt — giảm <span class="buff">${Math.round(RED_BUFF.slowPercent * 100)}%</span> tốc chạy.`;
      slow.percent = RED_BUFF.slowPercent;
      slow.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      hit.victim.addBuff(slow);
    }

    draw(): void {
      drawBlessingRing(this.targetUnit, RED_GLOW, 3);
    }
  };
}

/** Bùa Baron: one `StatAmp`, worn by everyone still standing on the team. */
export function makeBaronBuff(api: ContentApi) {
  return class BaronBuff extends api.buffs.StatAmp {
    name = BARON_BUFF.name;
    stackId = BARON_BUFF.stackId;
    image = api.asset('monster_Baron_Nashor');
    buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
    bonuses = {
      attackDamage: { flatBonus: BARON_BUFF.attackDamage },
      maxMana: { flatBonus: BARON_BUFF.maxMana },
      manaRegen: { flatBonus: BARON_BUFF.manaRegenBonus },
      healthRegen: { flatBonus: BARON_BUFF.healthRegenBonus },
    };

    draw(): void {
      drawBlessingRing(this.targetUnit, BARON_GLOW, 4);
    }
  };
}

/**
 * Whose blessing a kill actually is: the killer when it is a champion, its
 * owner when it is a pet, nobody otherwise.
 */
export function beneficiary(
  api: ContentApi,
  killer: AttackableUnitInstance
): ChampionInstance | null {
  // `Pet extends Champion`, so this order matters: a clone would otherwise
  // pass the champion test and wear a ninety-second blessing for the eight
  // seconds it has left.
  const unit = killer instanceof api.units.Pet ? killer.ownerUnit : killer;
  if (!(unit instanceof api.units.Champion)) return null;
  if (unit.isDead || unit.toRemove) return null;
  return unit;
}

/**
 * The reward-only ability shape. See this file's header for why the range is
 * negative rather than zero.
 */
/**
 * Everything hostile to `owner` inside a circle.
 *
 * Lived privately in `monsters/Baron.ts` until a second camp wanted it. One
 * home rather than two copies: a filter list is exactly the kind of thing
 * that gets fixed in one file and left wrong in the other.
 */
export function hostilesIn(
  api: ContentApi,
  owner: AttackableUnitInstance,
  center: Vec2,
  radius: number
): AttackableUnitInstance[] {
  return owner.game.objectManager.queryObjects({
    area: new api.utils.Quadtree.Circle({ x: center.x, y: center.y, r: radius }),
    filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(owner.teamId)],
  }) as AttackableUnitInstance[];
}

export function blessing(
  name: string,
  grant: (killer: AttackableUnitInstance, monster: MonsterInstance) => void
): MonsterAbility {
  return {
    name,
    cooldownMs: 0,
    range: -1,
    cast() {},
    // The camp itself is handed over as well as the killer: a reward that
    // depends on *which* camp paid it — Dragon's element rotation is keyed by
    // `monster.camp` — cannot be written without it, and the three blessings
    // here simply ignore the second argument.
    onKilled: (monster, killer) => grant(killer, monster),
  };
}

export function makeBlueSentinelAbilities(api: ContentApi): MonsterAbility[] {
  const BlueBuff = makeBlueBuff(api);

  return [
    blessing(BLUE_BUFF.name, killer => {
      const champion = beneficiary(api, killer);
      if (!champion) return;

      champion.addBuff(new BlueBuff(BLUE_BUFF.durationMs, champion, champion));
      // `restoreMana`, never `stats.mana` — granting is not billing, and the
      // seam that bans the second exists so URF's `manaFree` cannot zero a
      // refill (see `AttackableUnit.restoreMana`'s own doc comment).
      champion.restoreMana(champion.stats.maxMana.value * BLUE_BUFF.instantManaPercent);
    }),
  ];
}

export function makeRedBramblebackAbilities(api: ContentApi): MonsterAbility[] {
  const RedBuff = makeRedBuff(api);

  return [
    blessing(RED_BUFF.name, killer => {
      const champion = beneficiary(api, killer);
      if (!champion) return;
      champion.addBuff(new RedBuff(RED_BUFF.durationMs, champion, champion));
    }),
  ];
}

/**
 * Baron's, and the only one that is not the killer's alone: the whole team
 * gets it, which is what makes the pit worth five people walking into.
 *
 * Exported as a single ability rather than a list, because `code.ts` appends
 * it to the kit `Baron.ts` already returns instead of replacing it.
 */
/**
 * Everyone alive on `champion`'s team, the killer always included.
 *
 * Exported because Dragon and Vilemaw pay the same way Baron does, and the
 * subtlety below is exactly the kind that gets lost in a second copy: the
 * killer is prepended unconditionally, because a champion standing outside
 * the quadtree's own bounds — or simply not indexed yet on the frame the camp
 * died — must not be the one person on the team the blessing misses.
 */
export function teamOf(api: ContentApi, champion: ChampionInstance): ChampionInstance[] {
  const { game } = champion;
  const everyone = game.objectManager.queryObjects({
    area: new api.utils.Quadtree.Circle({
      x: game.mapSize / 2,
      y: game.mapSize / 2,
      r: game.mapSize,
    }),
    filters: [
      api.combat.PredefinedFilters.type(api.units.Champion),
      api.combat.PredefinedFilters.excludeType(api.units.Pet),
      api.combat.PredefinedFilters.teamId(champion.teamId),
      api.combat.PredefinedFilters.excludeDead,
    ],
  }) as ChampionInstance[];

  return everyone.includes(champion) ? everyone : [champion, ...everyone];
}

export function makeBaronBlessing(api: ContentApi): MonsterAbility {
  const BaronBuff = makeBaronBuff(api);

  return blessing(BARON_BUFF.name, killer => {
    const champion = beneficiary(api, killer);
    if (!champion) return;
    for (const ally of teamOf(api, champion)) {
      ally.addBuff(new BaronBuff(BARON_BUFF.durationMs, champion, ally));
    }
  });
}
