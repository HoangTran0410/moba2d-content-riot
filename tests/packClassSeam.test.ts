import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `packClass` is the only per-`api` memo in this pack.
 *
 * Every class here is built from the injected `api` and has to be memoized on
 * it, or two callers with two `ContentApi`s get two `instanceof`-incompatible
 * classes with the same name. That memo was written out by hand 650 times
 * before `packClass` existed, and collapsing it removed ~5000 lines.
 *
 * Four files survived that pass, and the reason they did is the reason this
 * scan exists rather than a tidier one. They use a *second* naming convention
 * — `__group0_Zed_WBuild` / `__group0_Zed_WCache` / `__group0_Zed_WBuilder`,
 * for classes that reference each other as values and so must be built in one
 * closure and returned as a bundle. The migration's own leftover check looked
 * for `__build` and `__cache`, matched neither `Build` nor `Cache`, and
 * reported the tree clean. A scan keyed on a *name* can always be defeated by
 * a new name.
 *
 * So this one is keyed on the thing itself: a `WeakMap` keyed by `ContentApi`
 * is what a per-api memo *is*, whatever its author called it. `packClass.ts`
 * holds the one legitimate instance.
 */
function tsFilesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...tsFilesUnder(full));
    else if (entry.name.endsWith('.ts')) found.push(full);
  }
  return found;
}

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the per-api memo', () => {
  it('lives in packClass.ts and nowhere else', () => {
    const offenders: string[] = [];
    for (const file of tsFilesUnder(root)) {
      if (file === join(root, 'packClass.ts')) continue;
      const source = stripComments(readFileSync(file, 'utf8'));
      if (/new WeakMap<\s*ContentApi\s*,/.test(source)) {
        offenders.push(file.slice(root.length + 1));
      }
    }

    expect(
      offenders,
      'a hand-rolled per-api memo — wrap the builder in `packClass` from ../packClass instead'
    ).toEqual([]);
  });
});
