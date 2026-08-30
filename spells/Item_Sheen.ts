import type { CastSpec, OnHitEvent } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const AoePulse = api.AoePulse;
const EventType = api.enums.EventType;

/**
 * Thủy Kiếm — the spellblade component, and the *base class* of the whole
 * spellblade family (Tam Hợp Kiếm, Búa Rìu Sát Thần, Lưỡi Hái Linh Hồn,
 * Kiếm Tai Ương all subclass `SpellbladeBuff` below).
 *
 * The mechanic, stated once: **casting an ability charges the blade; the next
 * basic attack inside the charge window spends it**, with an internal cooldown
 * so an attack-speed build cannot turn one Q into three procs. "Casting an
 * ability" is core's own `Spell.countsAsAbilityCast` — the basic attack, Hồi
 * Thành, an item's own passive arming and an item active all report false, so
 * none of them can charge the blade (an item powering itself was the bug that
 * flag exists to close).
 *
 * The charge and the spend both live on ONE permanent buff rather than a
 * separate "charged" buff instance, so there is nothing to desync: the buff
 * listens for casts, stamps a timestamp, and its `onHit` consumes it. Echoed
 * applications (a phantom hit, a Runaan bolt) never consume the charge —
 * spellblade empowers *the* next attack, not every application that attack
 * fans out into.
 */

/** ms the charge stays spendable after the cast. */
export const SPELLBLADE_WINDOW_MS = 10_000;

/** ms between procs, however many abilities were cast. */
export const SPELLBLADE_ICD_MS = 1_500;

/** Thủy Kiếm's own proc: this share of the wearer's base attack damage. */
export const SHEEN_BASE_AD_RATIO = 0.5;

/** The proc flash: radius and life, shared by the family so it reads as one mechanic. */
export const PROC_FLASH_RADIUS = 42;
export const PROC_FLASH_MS = 220;

// A cool blue on a physical proc — the VFX standard's named identity
// exception: the blue-white flash IS this item across the whole genre, and
// the amber damage number beside it is what states the type.
const SHEEN_GLOW: [number, number, number] = [140, 190, 255];

/**
 * The family's engine. A subclass overrides `payload()` (what the empowered
 * hit does) and `flashColor` (so each item's proc is tellable at a glance),
 * and nothing else.
 */
export class SpellbladeBuff extends Buff {
  name = 'Thủy Kiếm';
  description =
    `Sau khi dùng một chiêu thức, đòn đánh kế tiếp gây thêm ` +
    `<span class="damage physical">${Math.round(SHEEN_BASE_AD_RATIO * 100)}% sát thương công vật lý</span>. ` +
    `Hồi lại sau <span class="time">${SPELLBLADE_ICD_MS / 1000} giây</span>.`;
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;

  /** When the charge was armed, or null while unarmed. */
  chargedAtMs: number | null = null;
  /** When the last proc fired, for the internal cooldown. */
  lastProcAtMs = -Infinity;
  /** The wearer's own clock; ms, monotonic while the match runs. */
  private nowMs = 0;
  private stopWatchingCasts: (() => void) | null = null;

  flashColor: [number, number, number] = SHEEN_GLOW;

  onActivate(): void {
    this.stopWatchingCasts = this.game.eventManager.on(
      EventType.ON_POST_CAST_SPELL,
      (spell: { owner?: unknown; countsAsAbilityCast?: boolean }) => {
        if (spell.owner !== this.targetUnit) return;
        if (spell.countsAsAbilityCast === false) return;
        this.chargedAtMs = this.nowMs;
      }
    );
  }

  onDeactivate(): void {
    this.stopWatchingCasts?.();
    this.stopWatchingCasts = null;
  }

  onUpdate(): void {
    this.nowMs += deltaTime;
  }

  onHit(hit: OnHitEvent): void {
    // The empowerment is one attack's, not every application that attack fans
    // out into — and a phantom hit must never spend a charge the real swing
    // did not.
    if (hit.echo) return;
    if (this.chargedAtMs === null) return;
    if (this.nowMs - this.chargedAtMs > SPELLBLADE_WINDOW_MS) {
      this.chargedAtMs = null;
      return;
    }
    if (this.nowMs - this.lastProcAtMs < SPELLBLADE_ICD_MS) return;

    this.chargedAtMs = null;
    this.lastProcAtMs = this.nowMs;
    this.payload(hit);
    this.showProcFlash(hit);
  }

  /** Whether the very next swing would spend the charge — what `draw` shows. */
  protected chargeReady(): boolean {
    return (
      this.chargedAtMs !== null &&
      this.nowMs - this.chargedAtMs <= SPELLBLADE_WINDOW_MS &&
      this.nowMs - this.lastProcAtMs >= SPELLBLADE_ICD_MS
    );
  }

  /**
   * The loaded state, worn on the body: two short arcs of the item's own
   * colour orbiting the wearer's rim while — and only while — the next swing
   * would actually proc. Riot's guide calls this the tooltip half of a proc
   * item: the *flash* says it happened, but the player decides whether to
   * weave a spell first, and a decision needs the state visible before the
   * swing, not after. Honest by construction: `chargeReady()` is the same
   * predicate `onHit` spends against, so the shimmer can never promise a proc
   * the internal cooldown is still holding. One thin layer, inside the item
   * noise budget — an orbit reads as "armed" without covering the champion or
   * competing with any ability's own art.
   */
  draw(): void {
    if (!this.chargeReady()) return;
    const pos = this.targetUnit.position;
    const radius = this.targetUnit.animatedValues.displaySize / 2 + 5;
    const [r, g, b] = this.flashColor;
    const spin = frameCount / 14;

    push();
    noFill();
    stroke(r, g, b, 205 + 35 * Math.sin(frameCount / 6));
    strokeWeight(3);
    for (let i = 0; i < 2; i++) {
      const start = spin + i * PI;
      arc(pos.x, pos.y, radius * 2, radius * 2, start, start + 0.9);
    }
    pop();
  }

  /** What the empowered hit does. Thủy Kiếm's own: a share of base AD, physical. */
  protected payload(hit: OnHitEvent): void {
    const base = this.targetUnit.stats.attackDamage.baseValue;
    hit.victim.takeDamage(base * SHEEN_BASE_AD_RATIO, this.targetUnit, 'PHYSICAL', 'Thủy Kiếm');
  }

  /**
   * One small ring on the victim, in the item's own colour. The proc is a
   * number the player has to be able to see land — rule 3 of the VFX
   * standard — and a ring this size under the damage text is the whole of it.
   */
  private showProcFlash(hit: OnHitEvent): void {
    const flash = new AoePulse(this.targetUnit);
    flash.position = hit.victim.position.copy();
    flash.radius = PROC_FLASH_RADIUS;
    flash.lifeTime = PROC_FLASH_MS;
    flash.color = [...this.flashColor];
    flash.fillAlpha = 40;
    this.game.objectManager.addObject(flash);
  }
}

export default class Item_Sheen extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_sheen');
  name = 'Thủy Kiếm (Item_Sheen)';
  description =
    `Nội tại: sau khi dùng chiêu, đòn đánh kế tiếp gây thêm sát thương vật lý bằng` +
    ` ${SHEEN_BASE_AD_RATIO * 100}% công cơ bản (hồi ${SPELLBLADE_ICD_MS / 1000} giây)`;
  coolDown = 0;
  manaCost = 0;

  get castSpec(): CastSpec {
    return {
      activation: 'PRESS',
      targeting: 'SELF',
      castTimeMs: 0,
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'start', durationMs: 0 },
    };
  }

  onSpellCast() {
    const blade = new SpellbladeBuff(0, this.owner, this.owner);
    blade.stackId = 'item_spellblade';
    blade.image = this.image;
    // Tied to the item, not the life: selling Thủy Kiếm takes the proc with it.
    blade.sourceSpell = this;
    this.owner.addBuff(blade);
  }
}
