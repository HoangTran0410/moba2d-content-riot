# VFX worked examples, carried over from core

Content-pack-and-repo-split batch 6 task 12 rewrote `docs/VFX_STANDARD.md` in
`@moba2d/core` to use generic, pack-neutral examples instead of naming specific
Riot champions — that document ships in core's own repository and is read by
authors of packs other than this one, so it can no longer assume this pack's
kits exist. The specific, real illustrations it used to carry are preserved
here verbatim, because they were true and useful and this pack is exactly the
place a reader can go look at the actual code they describe.

Core's rewritten rules are unchanged in substance; only the examples moved.

## The worked example

`Fizz_E.ts` (`Fizz_E_Object.draw`) was core's pointer for "read one real spell
file once, rather than re-deriving the VFX standard from a 400-line spell
every time." It still is — read it once, not once per task.

## Rule 1 — unique per champion

"Jarvan's walls are earthen crags, not Anivia's ice." Two champions must never
draw the same shape for two different abilities; if they would, one of them
needs a new shape — adding an `AoePulse` style is cheaper than sharing one.

## Rule 2 — every zone that behaves differently must look different

Darius Q deals full damage in the outer band and a fraction in the inner one —
and bleeds and heals off the outer only — so the two have to be two visibly
separate regions, not one disc with a faint line in it. One rule, one region.

## The size floor for anything the player has to find

Katarina's daggers were a 26-unit pale-grey blade with no outline, dropped on
a pale-grey floor — and finding them is the entire point of her kit. That
shipped, was reported, and became the rule: an object the player must locate
needs roughly 40 units of longest dimension and a contrasting rim, drawn under
*each piece* rather than around the whole cluster.

Concealed objects are the deliberate exception, and they invert the rule:
Jhin's armed trap is drawn only for its owner and only at ~80 alpha, because
being hard to see is what it is for.

## Proving it in the renderer

`tests/e2e/shoot-new-champion-vfx.mjs` (core's repository, not this one) used
to ship a worked invocation against this pack's roster:

```sh
LOL2D_CHROME_CHANNEL= node tests/e2e/shoot-new-champion-vfx.mjs /tmp/vfx Katarina
```

That script's own `ENTRIES` list is retargeted per batch of kits rather than
kept as a standing suite, and core no longer carries this pack's champions to
retarget it against. If this pack grows a screenshot rig of its own, the shape
to copy is: sample a few frames per cast straddling the moments the effect
changes (windup, strike, settle) — a single frame cannot tell an animated
effect from one that pops in.
