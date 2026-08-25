import { defineConfig } from 'vitest/config';
// @ts-expect-error — plain .mjs, deliberately (see that file's own header:
// a pack's config loader hands a bare specifier under `node_modules`
// straight to Node, which refuses to strip types there). `exports` maps
// this subpath to the `.mjs` file directly with no `types` condition, so
// there is no declaration for a `bundler`-resolution program to find — the
// same shape core's own `vitest.config.ts` suppresses for its two `.mjs`
// build-script imports, just never previously typechecked into visibility:
// core's own `tsconfig.json` is `src/**/*` and does not reach its repo-root
// `vitest.config.ts` at all, while this pack's `**/*.ts` reaches its own.
import { moba2dPackTestConfig } from '@moba2d/core/testing/vitest';

/**
 * This pack's own test runner — `npm test --workspace=@moba2d/content-lol`
 * (`package.json`'s own `test` script) is the pack's own gate, wired into
 * root `verify:all` the same way `check-seams` already is. Spreads the
 * shared preset (`@moba2d/core/testing/vitest`, Task 3) rather than a
 * hand-written copy, so this config and core's own `vitest.config.ts` (which
 * runs under the identical preset) cannot quietly drift the way two
 * hand-written `tests/setup.ts` installations used to.
 */
const preset = moba2dPackTestConfig({ setupFiles: ['./vitest.setup.ts'] });

export default defineConfig({
  resolve: preset.resolve,
  test: { ...preset.test, include: ['tests/**/*.test.ts'] },
});
