/**
 * This pack's own spell-catalogue tree — what `@moba2d/core`'s
 * `scripts/generate-spell-catalog.mjs` needs to know about this pack's
 * layout to build `generated/spellCatalog.ts` and `generated/spellModules.ts`
 * for it.
 *
 * Read by that script via `--root=<path>`: it resolves `<root>/catalog.
 * config.mjs` and imports this file's default export as the tree, so this
 * is the one place this pack's own shape is stated — not a table inside
 * core naming this pack by id. `package.json`'s `catalog:generate` /
 * `catalog:check` pass `--tree=lol --root=.`; the tree *name* on that CLI
 * is only ever used for error messages now — the tree *definition* is this
 * file.
 *
 * Moved out of `scripts/generate-spell-catalog.mjs`'s own `PACK_SPELL_TREES`
 * table verbatim (content-pack-extraction batch 6 task 9) — that table held
 * exactly this object under a `riot` key, which was core's own tooling
 * carrying this pack's knowledge about its own layout. See that script's
 * header, "Fix round 2", for the CLI contract this file satisfies.
 */
export default {
  outputPath: 'generated/spellCatalog.ts',
  modulesOutputPath: 'generated/spellModules.ts',
  // Relative, not `@/…`: the alias in `tsconfig.json` resolves only under
  // `src/`, and a pack imports its own siblings the way
  // `packs/reference/pack.ts` already does.
  barrels: [{ path: 'spells/index.ts', importBase: '../spells' }],
  // This pack's spells are ordinary class declarations — `class Ahri_Q extends
  // api.Spell` — so they read `api` the moment their module evaluates, and
  // loading the barrel below is exactly that moment. `apiSetter` is how the
  // generator hands this pack its engine first. (It replaces `isPackFactory`,
  // which described the shape this pack used when every class was built by a
  // factory the generator called itself.)
  apiSetter: { path: 'packApi.ts', export: 'setPackApi' },
  // `iconKeyType` is gone: `render()` defaults to `'AssetKey'` and imports
  // it from `'./assetManifest'`, this pack's own sibling file, not core's —
  // a pack-local union, not a reach into core (`packBoundary.test.ts` would
  // refuse the latter). Every `iconKey` this tree generates is checked
  // against it.
  //
  // `describe()` needs `instance.image` — a spell's own `api.asset('spell_x')`
  // field initializer — to resolve rather than throw "Unknown asset key",
  // and `AssetManager` cannot import a pack's manifest itself
  // (`corePacksBoundary.test.ts`). `packId` and `assetManifestOutputPath`
  // below are what let `renderSpellCatalogSource` register this tree's own
  // manifest with `AssetManager` before any factory runs — the SSR-process
  // equivalent of what `bundledPack.ts` does for the real game.
  packId: 'lol',
  assetManifestOutputPath: 'generated/assetManifest.ts',
};
