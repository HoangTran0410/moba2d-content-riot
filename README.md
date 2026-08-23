# @moba2d/content-riot

The Riot-champion content pack for [`@moba2d/core`](https://github.com/HoangTran0410/LOL2D):
58 playable champions' worth of spells, monsters and the Summoner's Rift map,
built entirely against core's public `ContentApi`. Until content-pack-and-
repo-split batch 6 task 10, this pack lived inside the core monorepo, at
`packs/riot/`; this repository is that same content, moved out — same files,
same tests, same history from this point forward, now versioned on its own.

(Checked, not rounded: `data.ts`'s own `ROSTER`/`championEntries()` produces
exactly 58 entries with `playable: true`, one per file-name prefix under
`spells/` that carries a `_Q`/`_W`/`_E`/`_R` suffix — the same count
`vite.config.ts` (in core) uses for its per-champion chunking. The pack's
spell files total more than that: a handful — `Flash`, `Ghost`, `Heal`,
`Ignite`, `StealthWard` — carry no champion prefix at all and share one
`spell-common` chunk, which is why "champions" and "spell chunks" are two
different, both-correct numbers.)

## Requires `@moba2d/core`

This pack is nothing on its own — it is a plugin. It declares `@moba2d/core`
under `devDependencies`, not `dependencies`, on purpose: every crossing this
pack makes into core is `import type` — three modules
(`@moba2d/core/content/ContentApi`, `@moba2d/core/content/ContentPack`,
`@moba2d/core/content/types`), never a value. At runtime the pack needs
nothing of core directly; it receives a fully-built `ContentApi` object as the
argument to its own factory function (`pack.ts`) and calls methods on that
object, never on an import. Core's own `pack-core-boundary` seam enforces
this on core's side — a value import of any of the three, or an import of
anything else core exposes, both fail that scan.

Core is not yet published to the npm registry, so the dependency is a plain
git reference:

```json
"devDependencies": {
  "@moba2d/core": "github:HoangTran0410/LOL2D#content-pack-batch-6"
}
```

(That branch name is where core's own work on this split currently lives; it
will move to a stable branch or tag once the split lands there.)

## Install

```bash
npm install
```

## Run the checks

```bash
npm run verify
```

`verify` runs, in order: `assets:check` (the generated asset manifest is
current), `catalog:check` (the generated spell catalogue is current),
`ability:check` (the imported ability data under `docs/abilities/` is
internally consistent and every image it references exists), `typecheck`,
`check-seams` and `check-seams:monsters` (the source-scan rules that keep
this pack from reaching into core through anything but `ContentApi`), and
`npm test` (this pack's own Vitest suite).

Individual scripts are also available on their own — `npm run test`,
`npm run typecheck`, `npm run assets:generate` (rewrite the manifest rather
than just check it), and so on; see `package.json` for the full list.

## Where the content came from

`docs/abilities/`, `assets/source-manifest.json` and `scripts/wiki/` are the
Riot Wiki / Data Dragon import toolchain and its provenance records — how
this pack's ability data and art were pulled from the public wiki in the
first place, and how a future refresh (`npm run ability:update`,
`npm run names:sync`) would pull an update. They touch the network only when
explicitly invoked; nothing in `verify` does.
