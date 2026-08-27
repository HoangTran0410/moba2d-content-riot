/**
 * The entry a runtime install imports — the whole pack behind one URL.
 *
 * Core's build-time path reads two specifiers (`<pkg>/pack` for the halves,
 * `<pkg>/generated/assetManifest` for the art). A runtime install has one
 * `import()` to spend, so this module re-exports both. It adds nothing of
 * its own: everything here already existed, and keeping it a pure re-export
 * is what stops the two paths from drifting into two different packs.
 */
export { default, data } from './pack';
export { assetManifest } from './generated/assetManifest';
