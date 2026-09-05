import { api } from '../packApi';
import { secs } from '../text';

const heal = api.text.heal;

const Circle = api.utils.Quadtree.Circle;
const PredefinedFilters = api.combat.PredefinedFilters;
const Spell = api.Spell;
const AoePulse = api.AoePulse;
const Fear = api.buffs.Fear;
const Shield = api.buffs.Shield;

export const RADIUS = 300;

export const SHIELD_AMOUNT = 60;

export const SHIELD_DURATION = 2500;

export const FEAR_DURATION = 1200;


/** Primal Howl: brace, then scatter everything standing too close. */
export default class Warwick_E extends Spell {
  /**
   * Told: a real shield *and* a fear on everyone nearby. The shield half is
   * honest and declared; the fear is what inference could never have seen.
   */
  static aiRoles = api.enums.SpellRole.Shield | api.enums.SpellRole.Cc;

  targetingMode = 'SELF' as const;
  image = api.asset('spell_warwick_e');
  name = 'Gầm Thét (Warwick_E)';
  description =
    `Nhận Khiên ${heal(SHIELD_AMOUNT)} trong <span class="time">${secs(SHIELD_DURATION)} giây</span>` +
    ` và <span class="buff">Khiếp Sợ</span> mọi kẻ địch trong <span>${RADIUS}px</span> trong` +
    ` <span class="time">${secs(FEAR_DURATION)} giây</span>`;
  coolDown = 10000;
  manaCost = 40;

  onSpellCast() {
    const shield = new Shield(SHIELD_DURATION, this.owner, this.owner);
    shield.stackId = 'warwick_e';
    shield.image = this.image;
    shield.amount = SHIELD_AMOUNT;
    shield.color = [255, 160, 140];
    this.owner.addBuff(shield);

    const enemies = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.owner.position.x, y: this.owner.position.y, r: RADIUS }),
      filters: [PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    });
    enemies.forEach((enemy: any) => {
      const fear = new Fear(FEAR_DURATION, this.owner, enemy);
      fear.sourcePosition = this.owner.position.copy();
      enemy.addBuff(fear);
    });

    const howl = new AoePulse(this.owner);
    howl.radius = RADIUS;
    howl.lifeTime = 520;
    howl.color = [255, 150, 130];
    howl.rings = 4;
    this.game.objectManager.addObject(howl);
  }

  drawPreview() {
    super.drawPreview(RADIUS);
  }
}
