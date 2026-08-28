#!/usr/bin/env node
/**
 * The editor's export is the source of truth for a map, and this is what
 * makes that true rather than merely intended.
 *
 * ## The bug this exists for
 *
 * `maps/twistedTreeline.ts` carried `size: 6300` while
 * `maps/twistedTreeline_map.json` — the file the editor actually writes —
 * said `6400`, and the terrain in it reaches x=6385. Two hand-kept copies of
 * one fact, and they had already drifted apart by the width of a wall.
 *
 * Worse, the divergence was *invisible* because core resolved it by accident:
 * an active map used to be built as `{ ...summary, ...geometry }`, so the
 * geometry's own keys won and the game ran at the JSON's 6400 while every
 * picker said 6300. Core now takes only `terrain`, `slots` and `lanes` from
 * geometry (`content/activeMap.ts`), which is right — and which means the
 * summary's number is the one that ships. A wrong summary stopped being
 * harmless the moment core stopped covering for it.
 *
 * The same spread carried `"id": "map-nhap-vao"` — the name this map was
 * drawn under in the editor — into `Game.activeMapId`, where it became the
 * `mapId` in a LAN hello and made the map unjoinable. Nothing here has to
 * *strip* that any more, because nothing here copies it: the id belongs to
 * the pack and stays hand-written in `maps/<name>.ts`, which is the one field
 * a re-export must never be able to change.
 *
 * ## What it writes, and why two files rather than one
 *
 * Per editor-format map:
 *
 *   - `generated/maps/<name>.geometry.json` — `terrain`, `slots`, `lanes`,
 *     minified. This is what ships.
 *   - one entry in `generated/maps/mapMeta.ts` — `name`, `size`, `factions`.
 *     A few hundred bytes, and no polygons.
 *
 * Split because the pack's map definitions are split: `maps/<name>.ts` is the
 * cheap half a picker lists (a name and a size, never polygons) and the
 * geometry sits behind a dynamic import. A single generated module holding
 * both would put every wall in the menu's chunk the moment anything read a
 * name — undoing the split the hand-written files exist to make.
 *
 * ## What stays in the repository, and what reaches a player
 *
 * `maps/*_map.json` keeps **everything**, `authoring` included, because that
 * block is what lets the editor re-open a shipped map and merge its cut
 * polygons back into the shapes they were drawn as. Losing it means a map
 * that can never be edited again.
 *
 * A player needs none of it. The generated geometry drops `authoring` (9.4KB
 * of 71KB for Twisted Treeline) along with `id`, `name`, `size` and
 * `factions` — which live in the meta or in code — and is written minified,
 * where the editor writes indented. Full source in the repository, only the
 * fields the runtime reads on the wire.
 *
 * ## Format detection, not a list of names
 *
 * `maps/summoner_map.json` is not an editor export: its root is `wall`,
 * `bush`, `water`, `turret1`, `turret2`, and `summonersRiftGeometry.ts`
 * *computes* slots and lanes from it rather than reading them. So this walks
 * every `*_map.json` and takes the ones shaped like an editor export
 * (`terrain` + `slots`). A hard-coded list would have to be edited by whoever
 * adds the next map, which is exactly the kind of second place to remember
 * that this script exists to remove.
 *
 * Usage:
 *   node scripts/generate-maps.mjs            write
 *   node scripts/generate-maps.mjs --check    fail on drift, write nothing
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAPS_DIR = join(root, 'maps');
const OUT_DIR = join(root, 'generated', 'maps');
const META_FILE = join(OUT_DIR, 'mapMeta.ts');

const check = process.argv.includes('--check');

/** `twistedTreeline_map.json` → `twistedTreeline`. */
const baseNameOf = file => file.replace(/_map\.json$/, '');

/**
 * An editor export, as opposed to the hand-shaped source Summoner's Rift is
 * built from. Tested by shape rather than by name — see the header.
 */
const isEditorExport = data =>
  data !== null &&
  typeof data === 'object' &&
  typeof data.terrain === 'object' &&
  data.terrain !== null &&
  typeof data.slots === 'object' &&
  data.slots !== null;

/**
 * Exactly the three fields `MapGeometry` declares, in a fixed order.
 *
 * Named rather than "everything except the keys we know about": a future
 * editor that starts writing a fourth block would silently ship it under a
 * deny-list, and silently shipping whatever the editor invents is the whole
 * class of bug this repository has already paid for once.
 *
 * `lanes` is omitted when absent rather than written as `null`: core's
 * `MapGeometry.lanes` is optional and "no lanes" is a real map (no waves, and
 * the bots' PUSH posture falls through), which is not the same shape as a
 * lanes key holding nothing.
 */
const geometryOf = data => ({
  terrain: data.terrain,
  slots: data.slots,
  ...(data.lanes === undefined ? {} : { lanes: data.lanes }),
});

/** The half a picker reads. No polygons, by construction. */
const metaOf = data => ({
  name: data.name,
  size: data.size,
  factions: data.factions,
});

const metaModule = metas => {
  const entries = metas
    .map(
      ({ base, meta }) => `  ${base}: ${JSON.stringify(meta)} as MapMeta,`
    )
    .join('\n');
  return `// Generated by scripts/generate-maps.mjs — do not edit.
//
// The name, size and factions of every editor-drawn map, read from the
// editor's own export so that no hand-kept copy can drift from it. \`id\` is
// deliberately absent: it is the pack's, not the editor's, and lives in
// \`maps/<name>.ts\` — see that script's header for what a stray id once cost.
import type { MapDefinition } from '@moba2d/core/content/ContentPack';

export type MapMeta = Pick<MapDefinition, 'name' | 'size' | 'factions'>;

export const mapMeta = {
${entries}
};
`;
};

const files = readdirSync(MAPS_DIR).filter(name => name.endsWith('_map.json'));
const metas = [];
const written = [];
const stale = [];

for (const file of files.sort()) {
  const source = JSON.parse(readFileSync(join(MAPS_DIR, file), 'utf8'));
  if (!isEditorExport(source)) continue;

  const base = baseNameOf(file);
  metas.push({ base, meta: metaOf(source) });

  const target = join(OUT_DIR, `${base}.geometry.json`);
  // Minified on purpose: the editor writes indented for a human, and this copy
  // has no human reader — it is downloaded by every player who opens the map.
  const next = JSON.stringify(geometryOf(source));
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (current !== next) {
    stale.push(`generated/maps/${base}.geometry.json`);
    if (!check) {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(target, next);
    }
  }
  // Compared against the file on disk, not against a minified copy of it: the
  // file on disk is what `?raw` puts in the bundle today, so that is the
  // number this replaces.
  written.push({ base, bytes: next.length, from: readFileSync(join(MAPS_DIR, file), 'utf8').length });
}

const nextMeta = metaModule(metas);
const currentMeta = existsSync(META_FILE) ? readFileSync(META_FILE, 'utf8') : null;
if (currentMeta !== nextMeta) {
  stale.push('generated/maps/mapMeta.ts');
  if (!check) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(META_FILE, nextMeta);
  }
}

if (check && stale.length) {
  console.error('map data is stale — run `npm run maps:generate`:');
  for (const name of stale) console.error(`  ${name}`);
  process.exit(1);
}

// "Scanned N, found nothing" and "found no maps at all" are different answers
// and must not print the same line: an empty run reads as a pass otherwise.
if (files.length === 0) {
  console.error('no *_map.json under maps/ — nothing was checked');
  process.exit(1);
}

for (const { base, bytes, from } of written) {
  const saved = Math.round((1 - bytes / from) * 100);
  console.log(
    `maps: ${base} ${(bytes / 1024).toFixed(1)}KB shipped, ` +
      `down from ${(from / 1024).toFixed(1)}KB of editable source (${saved}% smaller)`
  );
}
console.log(check ? 'maps: up to date' : `maps: wrote ${written.length} geometry file(s) + meta`);
