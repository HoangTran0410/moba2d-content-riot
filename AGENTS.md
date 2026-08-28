# Working on this pack

Recipes for changing `@moba2d/content-lol`. Written to be followed
literally — by a person or by an agent — without reading the engine first.

`README.md` says what each file is and where the content came from. This says
what to do.

**One rule above all the others:** run `npm run verify` before you say you are
done. It is `core:check`, `assets:check`, `catalog:check`, `ability:check`,
`items:check`, `typecheck`, `check-unused`, `check-seams` (spells, tests and
monsters), the build, and the tests. Every trap below is something it catches;
none of them are things you will notice by looking.

---

## Add an ability

Spell files live flat under `spells/` as `<Champion>_<Slot>.ts`, registered by
one export line in `spells/index.ts` — **that barrel line is the whole
registration**. The catalogue generator reads the barrel to write
`generated/spellCatalog.ts` (the name, cooldown and mana core's HUD reads) and
`generated/spellModules.ts` (the lazy `id -> import()` map the game loads
from). `npx moba2d-pack-add spell <Name> --champion <Champion> --slot <S>`
scaffolds all of it; `npm run catalog:generate` after editing by hand.

Design from the record, not from memory: `npm run ability:import -- --champion
<Name>` pulls the ability's real numbers, text and icons from the wiki into
`docs/abilities/<champion>/` and `assets/` — read the JSON before writing the
class. Two kits in this pack shipped wrong mechanics because someone trusted
recall over `docs/abilities/`.

Numbers are **rescaled, not copied**: this game plays on a ~100-point health
pool. Spells land 15-35, ultimates 40-60, ranges fit this canvas.
`docs/VFX_STANDARD.md` in core is the bar for how it should look.

**Export tuning values as constants** so the test imports them. Retuning
damage must not mean editing a test.

## Add a champion

1. `npm run ability:import -- --champion <Name>` — data, icons, portrait art
   and the provenance ledger, in one step. Then `npm run assets:generate`.
2. Four spell files, as above, `Q W E R`.
3. A row in `data.ts`'s `ROSTER` — name, `image: 'champ_<name>'`, an `attack`
   profile off the `ATTACK` archetype table, and the four spell ids.
   `championEntries()` derives everything else.
4. Vietnamese names: `npm run names:sync` reads Riot's own `vi_VN` locale;
   descriptions are written here, with this pack's rescaled numbers.
5. `npm run verify`.

`data.ts` is the **data half** and may not import a spell module — the numbers
a menu shows come off `generated/spellCatalog.ts`. `tests/dataHalf.test.ts`
enforces it.

## Add an item

1. An entry in `data.ts`'s `itemEntries()` — id, Vietnamese name,
   `icon: 'item_<id>'`, `cost`, `stats` (allow-listed keys only — see
   `ItemStatKey`), optional `buildsFrom` (cost stays the total).
2. The icon: a row in `scripts/import-items.mjs`'s `ITEMS` table, then
   `npm run items:import && npm run assets:generate`. Data Dragon is the
   source and `docs/items-source-manifest.json` the ledger; commit both.
3. A passive is a spell: `spells/Item_<Name>.ts` (see `Item_Sheen.ts` for the
   armed-once shape), named in the entry's `passive`. An active is the same
   one field over — `active` binds it to the item's inventory hotkey.
4. `npm run verify`.

## Monsters and camps

`data.ts`'s `monsterEntries()` is the data half (bodies, health, offsets —
a camp is a composition, not N copies); which pit it stands in is
`maps/summonersRift_map.json`'s `slots.neutral`, matched by `role`. A camp
with behaviour gets a **code half**: `monsters/<Name>.ts` exporting a
`MonsterAbility[]` factory, wired in `code.ts`'s `monsterAbilities` keyed by
the local monster id — `monsters/Baron.ts` is the model.

`MonsterAbility.onKilled(monster, killer)` is the reward seam: called once
per life, on the death transition, only when something dealt it. A buff camp
grants its blessing there — after `die` settles the ledger, so the killer's
bounty gold is already paid.

`check-seams:monsters` scans `monsters/` with the same battery as `spells/`.

## Publish

```bash
git push
```

The pre-push hook (`npm run hooks:install`, once per clone) runs the full
`verify` first; `git push --no-verify` or `MOBA2D_SKIP_VERIFY=1 git push`
skips it once, deliberately. CI builds against core's `#main` fresh on every
run — `package-lock.json` is gitignored here on purpose.

---

## Traps

Each of these has cost real time, and none is visible from the file you are
editing.

**Never `import { Spell } from '@moba2d/core'`.** Not once, not in a test.
The pack builds with core marked `external` — a surviving value import is a
bare specifier nothing resolves in the browser. The engine *arrives* through
`packApi.ts`: `export default class X extends api.Spell {}`. `import type`
is fine; the compiler erases it.

**A gitignored lockfile still pins.** `package-lock.json` is untracked here
but real on disk: `npm install` resolves `@moba2d/core`'s git dependency to
whatever commit the *local* lockfile recorded, however old — one checkout sat
on a core four minors stale this way while its spec said `#main`. To actually
pick up core's current `#main`, run `npm update @moba2d/core`. CI never has
the lockfile, so it resolves fresh every run — which is exactly why the drift
only ever shows up locally.

**`npm install` (and any `bun install`) stomps the dev link.** While this
pack is linked to a local core checkout (`npm run pack:link` from core), an
install here silently replaces the symlink with the npm copy and every
new-API line stops compiling with errors that look like core's fault.
`scripts/check-core-link.mjs` (first step of `verify`, warn-only on
`postinstall`) is what tells you; `npm run pack:link` from core is the repair.

**`generated/` is written, not authored.** Editing a file in there is undone
by the next `assets:generate`/`catalog:generate`, and `verify` fails when the
two disagree.

**Label your damage.** `takeDamage(amount, this.owner, 'MAGIC', 'Tên Chiêu')`
— damage type, then the player-facing source label core's death-recap modal
groups by. Damage without them shows as "Không rõ". Tests spying on
`takeDamage` match the trailing args with `expect.any(String)`, or
`.slice(0, 2)` the call — never restate the label.

**A re-applied Slow must `RENEW_EXISTING`.** `Slow`'s default add type
stacks ten deep, so an aura or zone re-applying per tick turns "40% slow"
into a standstill. One slow, clock rewound:
`slow.buffAddType = api.enums.BuffAddType.RENEW_EXISTING` (Ekko_Q, Anivia_R,
Singed_W are the models).

**A bookkeeping buff hides itself.** An item passive's internal state sets
`hudVisible = false`, or every purchase adds a row to the player's buff bar.
`duration = 0` means permanent and draws no countdown.

**`interrupts:` — only `SpellForm.CHANNELED` breaks on the caster's own
movement.** `AIMED`/`HELD`/`TETHERED` survive moving and Flash and break only
on death, stun or silence — that is what keeps cast-then-Flash combos
(Darius Q + Tốc Biến) playable. Reserve `CHANNELED` for a true channel.

**A `UNIT` spell must declare `targetingRequest: { targetTeam: 'ENEMY' }`.**
Omit it and targeting defaults to `'ANY'`, which includes the caster — with
the cursor on empty ground the nearest-target fallback resolves *her*, and
the spell dashes to and damages its own caster. Four abilities shipped that
way before anyone noticed.

**Spend mana through `spendMana()` and read range through `Reach`.**
Touching `stats.mana` directly opts out of the match rules that make URF
work; `check-seams` bans the name from `spells/`.

**Use `Dash.onDashUpdate`, never `dashBuff.onUpdate = …`.** The instance
assignment replaces the dash's own movement instead of hooking it, and the
champion plays the spell standing still. Three kits shipped with it.

**"Player is not available in this test context" is usually not the error.**
Vitest's failure printer walks the test game and trips its throwing `player`
getter while serialising an ordinary assertion diff. The real failure is the
assertion above it — read the whole output before touching the fixture.

**Never put an item's spell id in a champion's `spells: [...]`.** That would be
one spell wearing two prices — an ability a champion casts for free and an item
the shop charges for.

**An item's spell must stay out of `spellDisplay`.** That map is what a loadout
screen offers as a *choosable ability*, so an item's active left in it gets
handed to a player who never bought the item. Skip anything named `Item_*` by
prefix; do not replace the check with a list — the next item is the one that
gets left off it.

**The `coreRange` floor lives in `data.ts`** (`manifest.coreRange`, today
`'>=1.8.0'`), and `scripts/write-manifest.mjs` derives the published one from
the declared `@moba2d/core` dependency — the two must move together. `items` did
not exist in `ContentPackData` before core 1.3, `buildsFrom` before 1.4, and
`Buff.hudVisible`/`Buff.sourceSpell` before 1.5. An older core does not fail on
any of them; it *ignores* what it does not know, and installs a shop whose
passives never come off when sold.

**Ship art as files, not as data URIs.** `vite.config.ts` sets
`assetsInlineLimit: 0` on purpose — `pack.js` is downloaded before the menu can
draw, and inlined art puts every champion's portrait in it to play a match that
needs four. Its header explains the `build.lib` interaction that defeated an
earlier attempt.

**`tests/seam-debt.mjs` pins lines by position *and* content.** Inserting
lines above a pinned one in a test file shifts its number and the scan
reports the entry stale. Renumbering the pin is the expected maintenance
cost — copy the line the CLI prints back into that file; never silence the
rule instead.

**Art keys strip the extension, and art is fetched, not drawn.** Champion
portraits and ability icons come through the wiki importer, item icons
through `items:import` — each with a provenance ledger `verify` re-hashes
offline. Commit the art and its ledger together, always.

**Install the git hooks once per clone:** `npm run hooks:install`. The
pre-push hook runs `npm run verify`; `git push --no-verify` or
`MOBA2D_SKIP_VERIFY=1 git push` skips it once, deliberately.
