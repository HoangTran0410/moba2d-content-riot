/**
 * The Ball sees, and that is most of what makes parking it somewhere a
 * decision rather than a cosmetic.
 *
 * Written against the *fog's own selection pass* rather than against the field
 * on the object, because the field alone has been a lie here before: a
 * `SpellObject` carries no `fogRevealRadius` getter (that lives on
 * `AttackableUnit`), and for a while `undefined > 0` dropped every spell-made
 * eye — a pack's ward included — out of the sight pass while its
 * `visionRadius` sat there looking correct. Core answers that with a fallback
 * now (`FogOfWar`'s `fogRevealOf`); this is the case that says so from the
 * pack's side, where the Ball actually lives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FogOfWar,
  buildTestApi,
  TeamId,
  createGame,
  indexObjects,
  stubGameGlobals,
  type TestGame,
} from '@moba2d/core/testing';
import { ballFor } from '../../spells/Orianna_Q';
const __api = buildTestApi();
const { Champion } = __api.units;

const CAMERA = { x: 0, y: 0, w: 800, h: 600 };
const AWAY = { x: 3_000, y: 3_000 };

let game: TestGame;

beforeEach(() => {
  stubGameGlobals();
  game = createGame();
  (game as unknown as { camera: unknown }).camera = { getBoundingBox: () => CAMERA };
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Orianna’s Ball gives the team vision', () => {
  it('lights an enemy standing where the Ball was left', () => {
    const orianna = new Champion({ game, teamId: TeamId.BLUE });
    orianna.position.set(100, 100);
    game.setPlayer(orianna);

    const ball = ballFor(orianna);
    // Parked across the map, which is the whole point: carried, its sight is
    // Orianna's own and proves nothing.
    ball.carrier = null;
    ball.position.set(AWAY.x, AWAY.y);

    const enemy = new Champion({ game, teamId: TeamId.RED });
    enemy.position.set(AWAY.x + 10, AWAY.y);

    const fog = Object.create(FogOfWar.prototype) as FogOfWar;
    (fog as unknown as { game: unknown }).game = game;
    // The raycast is a separate concern and needs real terrain. Reveal the
    // enemy only when the Ball is the observer, so a pass can mean one thing:
    // the Ball survived the revealer filter.
    (
      fog as unknown as { calculateSightForObject: (obj: unknown) => unknown }
    ).calculateSightForObject = (obj: unknown) => ({
      sightPoly: [],
      playersInSight: obj === ball ? [enemy] : [],
    });

    indexObjects(game, [orianna, ball, enemy]);
    fog.calculateSight();

    expect(enemy.visibleToPlayerTeam).toBe(true);
  });

  it('sees less far than a ward, so it scouts rather than replaces one', () => {
    // `LEASH_RANGE` lets the Ball be *sent*, and it can be re-placed every few
    // seconds — a ward's radius on something that mobile would make warding a
    // lane pointless for the one champion who can do this.
    const orianna = new Champion({ game, teamId: TeamId.BLUE });
    const ball = ballFor(orianna);
    expect(ball.visionRadius).toBeGreaterThan(0);
    expect(ball.visionRadius).toBeLessThan(350);
  });
});
