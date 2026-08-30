import { api } from '../packApi';
import { secs } from '../text';

const Airborne = api.buffs.Airborne;
const Charm = api.buffs.Charm;
const Fear = api.buffs.Fear;
const Root = api.buffs.Root;
const Silence = api.buffs.Silence;
const Slow = api.buffs.Slow;
const Stun = api.buffs.Stun;
const CROWD_CONTROL = [Stun, Root, Slow, Silence, Fear, Charm, Airborne];
const Spell = api.Spell;
const AoePulse = api.AoePulse;
const StatAmp = api.buffs.StatAmp;

export const DURATION = 7000;

export const BONUS_DAMAGE = 10;


/** Every buff Ragnarok tears off. Anything that takes Olaf's turn away from him. */



/**
 * Ragnarok: not a stat line but an escape. It strips the crowd control already
 * on Olaf the instant it is pressed — the point of the ultimate is being the
 * one champion a stun does not stop, so it has to *undo* one.
 */
export default class Olaf_R extends Spell {
  targetingMode = 'SELF' as const;
  image = api.asset('spell_olaf_r');
  name = 'Tận Thế Ragnarok (Olaf_R)';
  description =
    `Gỡ bỏ <span class="buff">mọi hiệu ứng khống chế</span> đang dính, và trong` +
    ` <span class="time">${secs(DURATION)} giây</span> nhận <span class="buff">+${BONUS_DAMAGE} sát thương đánh thường</span>` +
    ` cùng <span class="buff">+25% tốc chạy</span>`;
  coolDown = 10000;
  manaCost = 50;

  onSpellCast() {
    for (const buff of this.owner.buffs) {
      if (CROWD_CONTROL.some(kind => buff instanceof kind)) buff.deactivateBuff();
    }

    const amp = new StatAmp(DURATION, this.owner, this.owner);
    amp.stackId = 'olaf_r';
    amp.image = this.image;
    amp.name = 'Ragnarok';
    amp.bonuses = {
      attackDamage: { baseBonus: BONUS_DAMAGE },
      speed: { percentBaseBonus: 0.25 },
    };
    this.owner.addBuff(amp);

    const burst = new AoePulse(this.owner);
    burst.radius = 120;
    burst.lifeTime = 500;
    burst.color = [255, 120, 60];
    burst.style = 'shards';
    burst.spokes = 12;
    this.game.objectManager.addObject(burst);
  }
}
