import type { DamageOverTime } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Circle = api.utils.Quadtree.Circle;
const PredefinedFilters = api.combat.PredefinedFilters;
const Spell = api.Spell;
const AoePulse = api.AoePulse;


export const RANGE = 500;

export const DAMAGE = 26;


export default class Twitch_E extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('spell_twitch_e');
  name = 'Nhiễm Khuẩn (Twitch_E)';
  description =
    `Kích nổ chất độc: mọi kẻ địch <span class="damage">đang nhiễm độc</span> trong <span>${RANGE}px</span>` +
    ` nhận <span class="damage physical">${DAMAGE} sát thương vật lý</span> và mất hiệu ứng độc`;
  coolDown = 10000;
  manaCost = 35;

  range = RANGE;

  checkCastCondition() {
    return this._poisonedEnemies().length > 0;
  }

  onSpellCast() {
    for (const enemy of this._poisonedEnemies()) {
      enemy.takeDamage(DAMAGE, this.owner, 'PHYSICAL');
      // Consumed, not merely expired: the poison is what paid for the burst.
      for (const buff of enemy.buffs) {
        if (buff.stackId === 'twitch_poison') buff.deactivateBuff();
      }

      const pop = new AoePulse(this.owner);
      pop.position = enemy.position.copy();
      pop.radius = 70;
      pop.lifeTime = 320;
      pop.color = [150, 230, 90];
      pop.style = 'shards';
      pop.spokes = 8;
      this.game.objectManager.addObject(pop);
    }
  }

  _poisonedEnemies() {
    const enemies = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.owner.position.x, y: this.owner.position.y, r: this.range }),
      filters: [PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    });
    return enemies.filter((enemy: any) =>
      enemy.buffs.some((buff: DamageOverTime) => buff.stackId === 'twitch_poison' && !buff.toRemove)
    );
  }

  drawPreview() {
    super.drawPreview(this.range);
  }
}
