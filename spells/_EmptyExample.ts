/**
 * Templates for new spells. Copy the one that matches the shape you need.
 *
 * A pack spell is a factory: it receives `api: ContentApi` and returns the
 * class, rather than importing `Spell`/`SpellObject`/a buff directly — see
 * `docs/ADDING_SPELLS.md` and `packs/reference/spells/Vera_Q.ts`. Everything
 * this file used to import from `@/game/gameObject/...` now comes off `api`
 * instead, and an icon comes from `api.asset(key)` rather than
 * `AssetManager.get`/`.placeholder` (a pack may not import `AssetManager` at
 * all — the `pack-core-boundary` seam enforces it).
 *
 * **A spell is an ordinary class.** It extends something off `api` — the engine
 * cannot be imported by a pack, only handed over (see `../packApi.ts`) — and
 * that is the whole of the ceremony:
 *
 *     import { api } from '../packApi';
 *     export default class SpellName extends api.Spell { ... }
 *
 * The module evaluates once, so this is one class for the life of the page,
 * which is what makes `instanceof` mean something between the registry, an
 * e2e script and a test. It used to be a factory per class plus a
 * `WeakMap<ContentApi, …>` memo to guarantee exactly that, 650 times across
 * this pack; an ES module already guarantees it.
 *
 * The one rule that comes with it: `api` must be set before this module
 * evaluates. Three callers do it — `code.ts` for the game, `vitest.setup.ts`
 * for tests, `catalog.config.mjs` for the generator — and each runs before
 * anything reaches a spell. Which is also why **the data half must never
 * statically import a spell**; `tests/dataHalf.test.ts` keeps that true.
 *
 * After creating the file, register it in two places or it will not show up:
 *   1. `spells/index.ts` — export it; the catalogue generator reads this file
 *   2. `data.ts`         — add its id to the champion's kit
 *
 * There is no third entry for the name, description, icon, cooldown or mana:
 * `npm run catalog:generate` constructs the class and reads them off it.
 */
import { api } from '../packApi';

export default class SpellName extends api.Spell {
  image = api.asset('spell_name');
  name = '';
  description = 'Spell description';
  coolDown = 1000;

  onSpellCast() {}
  onUpdate() {}
}

/**
 * A skillshot. `MissileSpellObject` already handles travelling to the
 * destination, hitting each enemy once, the trail, and the bounding box — so a
 * normal projectile is just tuning fields plus `onHit` and `draw`.
 *
 * It names `SpellName_Missile` directly. Two classes in one module see each
 * other, whatever order they are written in, because the reference is inside a
 * method that runs long after both are declared.
 */
export class SpellName_Skillshot extends api.Spell {
  image = api.asset('spell_name');
  name = '';
  description = '';
  coolDown = 5000;
  range = 400;

  onSpellCast() {
    const { to } = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      this.range
    );

    const obj = new SpellName_Missile(this.owner);
    obj.destination = to;
    this.game.objectManager.addObject(obj);
  }
}

export class SpellName_Missile extends api.MissileSpellObject {
  speed = 8;
  size = 25;
  damage = 20;

  // Infinity pierces everything, 1 dies on the first enemy, 0 never collides.
  maxHitCount = 1;
  // removeOnArrive = false;  // keep flying past the destination (boomerangs)
  // removeOnMaxHit = false;  // survive the last hit (chains that latch on)

  // declare the trail here, not in the base — it needs this class's `size`
  trailSystem = new api.helpers.TrailSystem({
    trailSize: this.size,
    trailColor: '#77F5',
  });

  onHit(enemy: any) {
    enemy.takeDamage(this.damage, this.owner);
    // enemy.addBuff(new api.buffs.SomeBuff(1000, this.owner, enemy));
  }

  draw() {
    push();
    noStroke();
    fill('#77f');
    circle(this.position.x, this.position.y, this.size);
    pop();
  }

  // Hooks for bending the default flight:
  // onBeforeMove()      — runs each frame before the step (rotation, speed ramps)
  // onAfterMove()       — after the step, before collision (size that tracks distance)
  // onArrive()          — reached the destination
  // getTrailPosition()  — emit the trail somewhere other than the centre
}

export class SpellName_Buff extends api.buffs.Buff {
  image = api.asset('buff_name');
  description = '';
  buffAddType = api.enums.BuffAddType.REPLACE_EXISTING;
  maxStacks = 1;
  onCreate() {}
  onActivate() {}
  onDeactivate() {}
  onUpdate() {}
  draw() {}
}

/** For effects that are not projectiles: zones, wards, tethers, summons. */
export class SpellName_Object extends api.SpellObject {
  onAdded() {}
  onRemoved() {}
  update() {}
  draw() {}
  getDisplayBoundingBox(): any {}
}
