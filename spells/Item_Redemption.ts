import type { AttackableUnit, CastSpec } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { alliedChampionsAround } from './Item_Shurelya';
import { pct, secs } from '../text';

const Spell = api.Spell;
const AoePulse = api.AoePulse;

/**
 * Dây Chuyền Chuộc Tội's active — the third team button, and the missing
 * verb: Vòng Sắt shields, Khúc Ca hastens, this one *heals*.
 *
 * The ally sweep is Khúc Ca Shurelya's own (`alliedChampionsAround`), for the
 * same reason Vòng Sắt borrows it: three buttons that mean "and everyone
 * standing with me" must agree about who that is. The heal goes through
 * `takeHeal`, never a raw health write — that is the door Vết Thương Sâu and
 * `healingReceived` both watch, so a wounded ally is healed for less and a
 * Mikael-blessed one for more, exactly as every other heal in the game.
 */

/**
 * The heal, as a share of each RECIPIENT's own maximum health — the tank in
 * the scrum is mended for more points than the mage on its edge, and the
 * button keeps mattering on late-game health bars. ~20 on a mid-game body
 * (~165 máu), which is the flat number it replaced.
 */
export const REDEMPTION_HEAL_PERCENT = 0.12;

/** Same reach as the other two team buttons. */
export const REDEMPTION_RADIUS = 260;

/** Inside the actives' 10-18s band; the practice room's ceiling is 20s. */
export const REDEMPTION_COOLDOWN_MS = 15_000;

/** The burst ring and per-ally flare, Locket's two-layer honesty in warm light. */
export const REDEMPTION_RING_MS = 500;
export const REDEMPTION_FLARE_RADIUS = 36;
export const REDEMPTION_FLARE_MS = 320;

// Dawn white-gold, a shade paler than the Solari dome so the two team
// buttons read apart when both land in one scrum.
const DAWN: [number, number, number] = [255, 235, 180];

export default class Item_Redemption extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('item_redemption');
  name = 'Dây Chuyền Chuộc Tội (Item_Redemption)';
  description =
    `Kích hoạt: hồi ${pct(REDEMPTION_HEAL_PERCENT)}% máu tối đa cho bản thân và các đồng minh xung quanh` +
    ` (hồi lại sau ${secs(REDEMPTION_COOLDOWN_MS)} giây)`;
  coolDown = REDEMPTION_COOLDOWN_MS;
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
      ...alliedChampionsAround(this.owner, REDEMPTION_RADIUS),
    ];

    for (const ally of covered) {
      if (ally.isDead || ally.toRemove) continue;
      ally.takeHeal(ally.stats.maxHealth.value * REDEMPTION_HEAL_PERCENT, this.owner);

      const flare = new AoePulse(this.owner);
      flare.position = ally.position.copy();
      flare.radius = REDEMPTION_FLARE_RADIUS;
      flare.lifeTime = REDEMPTION_FLARE_MS;
      flare.color = [...DAWN];
      flare.fillAlpha = 55;
      this.game.objectManager.addObject(flare);
    }

    const ring = new AoePulse(this.owner);
    ring.position = this.owner.position.copy();
    ring.radius = REDEMPTION_RADIUS;
    ring.lifeTime = REDEMPTION_RING_MS;
    ring.color = [...DAWN];
    ring.fillAlpha = 26;
    this.game.objectManager.addObject(ring);
  }
}
