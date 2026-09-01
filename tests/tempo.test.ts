/**
 * This pack *is* the pace band.
 *
 * The ceilings in `@moba2d/core/testing/tempo` were measured off these 306
 * abilities — no ultimate above 10 seconds, nothing at all above 12 — so this
 * file is the one that keeps the reference honest. Anything here that drifts
 * past its own ceiling has moved the standard every other pack is held to,
 * silently, and this is the only place that would say so.
 *
 * Items are deliberately not swept: `data.champions[].spells` is the kit, and
 * an item active is bought rather than levelled — a 90-second Zhonya's is a
 * purchase, not a champion standing still.
 */
import { describeTempo } from '@moba2d/core/testing/tempo';
import { data } from '../pack';
import { spellCatalog } from '../generated/spellCatalog';

describeTempo({
  label: 'lol — the pack the band was measured from',
  spellCatalog,
  champions: (data.champions ?? []).filter(champion => champion.playable),
});
