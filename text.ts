/**
 * Number formatting for the text this pack ships.
 *
 * ## Why this exists
 *
 * Every `percent`-shaped constant in this pack is a fraction — `0.28` is a 28%
 * slow — and every description that printed one wrote `${SLOW_PERCENT * 100}%`.
 * In binary floating point `0.28 * 100` is `28.000000000000004`, so Lissandra's
 * Q advertised **làm chậm 28.000000004%** in the tooltip a player reads before
 * picking her.
 *
 * Exactly one of the sixty sites was visibly broken, which is the reason to fix
 * all sixty rather than that one: which fractions survive the multiplication
 * intact is a property of their binary representation and nothing else. `0.3`
 * is fine and `0.28` is not, so the next value anybody retunes is a coin flip,
 * and the failure is silent, cosmetic, and in the shop window.
 *
 * ## Why one decimal rather than a whole number
 *
 * `Math.round` would print 7.5% as 8%, which is a real number some abilities
 * use. One decimal keeps those and still drops the binary tail, and the `/ 10`
 * takes the trailing `.0` off the whole ones for free.
 *
 * A pack-local file rather than something borrowed from core: this is about
 * how *this* pack writes Vietnamese numbers, and core's own `percent` helper
 * (`buffs/describeBuff.ts`) rounds to whole percent for the generic buff
 * tooltips it writes, which is a different decision for a different surface.
 */

/** `0.28` → `'28'`, `0.075` → `'7.5'`. The `%` sign is the caller's. */
export const pct = (fraction: number): string => String(Math.round(fraction * 1000) / 10);

/** `1500` → `'1.5'`. Milliseconds as the seconds a description says. */
export const secs = (ms: number): string => String(Math.round(ms / 100) / 10);
