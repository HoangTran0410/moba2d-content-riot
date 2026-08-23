# Researching and registering a new ability

This is the workflow section that used to be `docs/ADDING_SPELLS.md` §1 in
`@moba2d/core`, before content-pack-and-repo-split batch 6 task 12 rewrote
that document for a pack author who has never seen this pack's Riot Wiki
pipeline. Moved here verbatim (register step updated for this repository's
own file names) rather than deleted, per the same rule the content itself was
held to: nothing leaves core without a copy landing here first.

## 1. Research and register

Import PC League data and images into this repository before implementing mechanics:

```sh
npm run ability:import -- --champion Janna
npm run ability:update -- --champion Janna --slots Q,R
npm run ability:check
npm run assets:generate
```

Read the checked-in record under `docs/abilities/<champion>/`. Keep English
Wiki fields authoritative and record deliberate LOL2D changes in
`adaptation`. Normal tests and builds must never fetch the Wiki.

Image provenance currently records the source URL, source revision, fetch
time, and content hash. The Wiki image API response used by the importer does
not provide rights or license fields, so do not infer or add a license;
record one only when the upstream API supplies it directly.

Export the spell from `spells/index.ts` and add its id string to the
champion's `spells: [...]` entry in the roster (`data.ts`).

## Where this fits with core's own `ADDING_SPELLS.md`

Everything from "2. Choose activation and targeting" onward in core's guide
is the engine mechanism — `castSpec`, targeting modes, `CancelPolicy`,
delivery primitives, VFX binding, testing through `press()`, `Reach`,
on-hit passives — and applies to a spell in this pack exactly as it applies
to any other pack's. This document is only the piece that was specific to
where this pack's numbers and art actually come from: Riot's own public Wiki
and Data Dragon, which no other pack has a reason to import from.
