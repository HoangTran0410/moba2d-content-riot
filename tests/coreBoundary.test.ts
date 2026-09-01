import { resolve } from 'node:path';
import { describeCoreBoundary } from '@moba2d/core/testing/boundary';

/**
 * This pack names no core internal.
 *
 * The rule, the scan and the reasoning all live in core
 * (`@moba2d/core/testing/boundary`, over `src/seams/packCoreBoundary.ts`) —
 * what is here is the one thing that is this pack's: where its root is.
 *
 * It runs from `npm test` and not only from `check-seams` because TypeScript
 * cannot see this class of mistake and never will: `tsconfig.json` has to
 * publish core's own `@/*` alias so this pack's `tsc` can see types through
 * core's unbundled source, and `paths` is program-wide. So
 * `import BuffAddType from '@/game/enums/BuffAddType'` in a spell compiles
 * cleanly, the editor underlines nothing, and this is what says otherwise.
 * Everything the engine offers arrives on `api`.
 */
describeCoreBoundary({
  packRoot: resolve(__dirname, '..'),
  label: 'lol',
  // Comfortably under the real count (~450) and far above an empty walk.
  minimumFiles: 100,
});
