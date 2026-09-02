/**
 * `damage-in-draw`, and for now only that one.
 *
 * The rules live in core (`@moba2d/core/testing/vfx`) because each is a fact
 * about the **engine**: what `MissileSpellObject` carries, which globals p5
 * supplies, and — this one — which of an object's callbacks `ObjectManager`
 * runs under the caster's attribution. `update`, `onAdded` and `onRemoved` are
 * bracketed; `draw` deliberately is not, so a hit dealt from a render pass is
 * not ability damage to `abilityPowerScales()` and the caster's whole
 * `Stats.abilityPower` vanishes from it while the tooltip still promises it.
 * `draw` is also skipped for anything off-screen, so such a hit lands only
 * when somebody happens to be looking at it.
 *
 * ## Why this pack asserts one rule instead of calling `describeVfxRules`
 *
 * Because the full set finds **163** issues here today — 154 unstubbed p5
 * globals, 8 missiles reading `this.direction`, 1 reading the raw cursor —
 * and burying that in a `knownDebt` array would be adopting a rule set by
 * writing down every way this pack already breaks it. That is a real pass
 * somebody should do, deliberately, and not a side effect of adding an
 * unrelated guard.
 *
 * So: the new rule is enforced from today at zero debt, and switching to the
 * full `describeVfxRules` is one edit away whenever the other 163 are faced.
 */
import { describe, expect, it } from 'vitest';
import { vfxIssues } from '@moba2d/core/testing/vfx';
import { join } from 'node:path';

describe('lol — VFX rules', () => {
  it('never deals damage or healing from a render pass', () => {
    const offenders = vfxIssues(join(__dirname, '../spells'))
      .filter(issue => issue.rule === 'damage-in-draw')
      .map(issue => `${issue.file}: ${issue.detail}`);

    expect(offenders).toEqual([]);
  });
});
