import type { AttackableUnit, CastSpec, DamageType } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { secs } from '../text';

const Spell = api.Spell;
const Buff = api.buffs.Buff;
const AoePulse = api.AoePulse;

/**
 * Dây Chuyền Chữ Thập — the mage's own kháng phép, and the shop's one
 * *counter to a single number* rather than to a stream of them.
 *
 * The veil eats the next instance of magic damage whole, however large: the
 * assassination combo's opener, the one ultimate a fight turns on. Against a
 * poke mage it is nearly worthless — any 1-damage tick pops it — which is the
 * classic trade and the reason it is priced as a stat item with a garnish
 * rather than the other way round.
 *
 * Unlike the watcher items beside it this one genuinely belongs in the
 * mitigation chain: `modifyIncomingDamage` is handed the type and *returns a
 * different number*, which is the hook's stated job. The two rules that make
 * a one-shot chain link honest: consume only when there is something to
 * consume (`damage > 0`, or a fully-shielded hit would spend the veil on
 * nothing), and never trigger on a teammate's or the map's damage.
 */

/** How long after breaking before the veil re-forms. */
export const BANSHEE_REARM_MS = 12_000;

export const BANSHEE_STACK_ID = 'item_banshees_veil';

// Pale spirit-violet, kept faint: the armed state is a whisper on the rim,
// not a second shield graphic fighting the real ones.
const VEIL: [number, number, number] = [200, 170, 255];

/** The break flash: the moment a whole spell vanished should be visible. */
export const VEIL_BREAK_RADIUS = 46;
export const VEIL_BREAK_MS = 260;

export class Item_Banshee_Veil extends Buff {
  name = 'Dây Chuyền Chữ Thập';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  // Permanently-armed bookkeeping: the inventory slot is the icon, so no
  // buff-bar row (the `buffDescriptions` exemption, stated in the class).
  hudVisible = false;

  armed = true;
  private nowMs = 0;
  private brokeAtMs = -Infinity;

  onUpdate(): void {
    this.nowMs += deltaTime;
    if (!this.armed && this.nowMs - this.brokeAtMs >= BANSHEE_REARM_MS) this.armed = true;
    // The slot's countdown — see core Buff.rearmMsLeft.
    this.rearmTotalMs = BANSHEE_REARM_MS;
    this.rearmMsLeft = this.armed ? 0 : Math.max(0, BANSHEE_REARM_MS - (this.nowMs - this.brokeAtMs));
  }

  modifyIncomingDamage(damage: number, attacker?: AttackableUnit, type?: DamageType): number {
    if (!this.armed) return damage;
    if (type !== 'MAGIC' || damage <= 0) return damage;
    if (!attacker || attacker.teamId === this.targetUnit.teamId) return damage;

    this.armed = false;
    this.brokeAtMs = this.nowMs;

    const burst = new AoePulse(this.targetUnit);
    burst.position = this.targetUnit.position.copy();
    burst.radius = VEIL_BREAK_RADIUS;
    burst.lifeTime = VEIL_BREAK_MS;
    burst.color = [...VEIL];
    burst.fillAlpha = 50;
    this.game.objectManager.addObject(burst);

    return 0;
  }

  /** The armed state, worn on the rim — same contract as the spellblade shimmer. */
  draw(): void {
    if (!this.armed || this.targetUnit.isDead) return;
    const pos = this.targetUnit.position;
    const radius = this.targetUnit.animatedValues.displaySize / 2 + 7;
    const [r, g, b] = VEIL;

    push();
    noFill();
    stroke(r, g, b, 90 + 25 * Math.sin(frameCount / 9));
    strokeWeight(2);
    circle(pos.x, pos.y, radius * 2);
    pop();
  }
}

export default class Item_Banshee extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_banshees_veil');
  name = 'Dây Chuyền Chữ Thập (Item_Banshee)';
  description =
    `Nội tại: chặn hoàn toàn một lần sát thương phép; hồi lại sau ${secs(BANSHEE_REARM_MS)} giây`;
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
    const veil = new Item_Banshee_Veil(0, this.owner, this.owner);
    veil.stackId = BANSHEE_STACK_ID;
    veil.image = this.image;
    veil.sourceSpell = this;
    this.owner.addBuff(veil);
  }
}
