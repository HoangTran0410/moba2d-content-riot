import type { ContentApi } from '@moba2d/core/content/ContentApi';
import type { MonsterAbility } from '@moba2d/core/content/types';
import { beneficiary, blessing, drawBlessingRing, teamOf } from './JungleBuffs';

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

export default function makeDragonAbilities(api: ContentApi): MonsterAbility[] {
  const buffs = new Map<string, ReturnType<typeof makeDragonBuff>>();
  for (const element of ELEMENTS) buffs.set(element.id, makeDragonBuff(api, element));

  return [
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
