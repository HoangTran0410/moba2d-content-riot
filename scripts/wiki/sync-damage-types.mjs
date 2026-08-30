#!/usr/bin/env node
/**
 * Sync every champion ability's damage type against Riot's own vi_VN tooltips.
 *
 * ## The state this exists to fix
 *
 * `takeDamage` grew a damage type, and all 241 sites in this pack were given
 * one — but 225 of them were given `'MAGIC'`, because that was the engine's
 * default at the time and writing it down changed nothing. Across 63
 * champions, of whom roughly half are AD in the game this borrows from, the
 * whole roster deals eleven physical hits. The declaration is complete and its
 * content is wrong, which is the worst of both: the compiler is satisfied and
 * armour protects nobody from a Zed.
 *
 * Retyping that by hand is 200-odd judgement calls made from memory, and the
 * calls are *per slot* rather than per champion — Ezreal Q is physical while
 * his W, E and R are magic — which is exactly the kind of thing memory gets
 * wrong. Riot publishes the answer in the same Vietnamese words this pack
 * already writes, so this reads it.
 *
 *   node scripts/wiki/sync-damage-types.mjs             # report, write nothing
 *   node scripts/wiki/sync-damage-types.mjs --apply     # rewrite the spell files
 *   node scripts/wiki/sync-damage-types.mjs --refresh   # re-download from Data Dragon
 *   node scripts/wiki/sync-damage-types.mjs --check     # exit 1 on drift (CI)
 *
 * ## What it will not touch, and why that is most of the value
 *
 * A codemod over 200 files earns trust by refusing work, so this writes only
 * where the answer is unambiguous from both ends and reports everything else
 * for a human:
 *
 *   - **the tooltip names two types** (a hybrid, or an ability that also
 *     *reduces* damage of some type) — no single answer to write;
 *   - **the file already deals two types** — Camille Q, Pyke R and Sett W each
 *     mix true and magic on purpose, and a blanket rewrite would flatten them;
 *   - **this pack's own prose contradicts the upstream type** — the Vietnamese
 *     a player reads is authored content, and rewriting a sentence is not a
 *     mechanical edit. `tests/spells/damageTypeClaims.test.ts` is what makes
 *     that contradiction a test failure rather than a silent lie, so these
 *     have to be settled by hand before they can be applied;
 *   - **anything with no upstream champion**: item spells, the summoner
 *     spells, the ward. Those are this pack's own inventions or live in other
 *     Data Dragon files entirely.
 *
 * ## What Data Dragon can and cannot answer
 *
 * The *type* is in the tooltip prose and is machine-readable. The *ratios* are
 * not: modern DDragon returns `vars: []` and unresolved `{{ damage }}`
 * placeholders, so nothing here can import a number. That is fine, because
 * this engine has no per-ability ratios to import them into — see
 * `combat/Amplification.ts` in core.
 *
 * The cache it writes (`docs/spell-damage-types-vi.json`) is committed, so
 * `--check` re-derives every decision from it with no network at all and runs
 * in `verify` beside `ability:check` and `items:check`. Only `--refresh`
 * reaches Data Dragon. That split is what keeps the answer reviewable in a
 * diff: a patch that retypes 66 abilities shows the tooltips it read.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPELL_DIR = join(ROOT, 'spells');
// Deliberately outside `docs/abilities/`, which `ability:check` walks and
// validates against the imported-ability schema. Same reasoning as the cache
// in `sync-spell-names.mjs`, and the same folder.
export const CACHE_FILE = join(ROOT, 'docs', 'spell-damage-types-vi.json');
const DDRAGON = 'https://ddragon.leagueoflegends.com';
const LOCALE = 'vi_VN';

/** DDragon's `spells` array is ordered Q, W, E, R. */
export const SLOTS = ['Q', 'W', 'E', 'R'];

/**
 * The three words, in the language both sides already speak.
 *
 * This pack writes its tooltips in Vietnamese and so does the client it copies
 * from, which is the entire reason a text match is trustworthy here: there is
 * no translation step in the middle to get wrong.
 */
const TYPE_WORDS = [
  ['vật lý', 'PHYSICAL'],
  ['phép', 'MAGIC'],
  ['chuẩn', 'TRUE'],
];

/** `sát thương vật lý` / `sát thương phép` / `sát thương chuẩn`, with their positions. */
const DAMAGE_PHRASE = /sát thương (vật lý|phép|chuẩn)/gi;

/**
 * How far back to look for the word that separates damage *dealt* from damage
 * *mentioned*.
 *
 * A tooltip that says "giảm sát thương phép nhận vào" is describing a
 * resistance, not a hit, and reading it as one would type a whole ability off
 * a clause about mitigation. `gây` ("deals") is what an ability's own damage
 * clause is built around — "gây {{ damage }} sát thương vật lý" — and 60
 * characters is enough to clear the placeholder and the noun phrase between
 * the verb and the type without reaching into the previous sentence.
 */
const DEALT_WINDOW = 60;

const argv = new Set(process.argv.slice(2));
const APPLY = argv.has('--apply');
const REFRESH = argv.has('--refresh');
const CHECK = argv.has('--check');

const fetchJson = async url => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
};

/** Tooltips carry markup (`<br>`, `<magicDamage>`) that would split a phrase in half. */
const plain = html =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The damage types a tooltip claims, preferring the ones it says it *deals*.
 *
 * Returns both halves: `dealt` is what the ability does to somebody, `all` is
 * every type the sentence mentions at all. The answer is `dealt` when there is
 * one and `all` otherwise — an ability whose only mention of a type is inside
 * a clause about reduction has told us nothing about its own hit, and falling
 * back to `all` there keeps that visible in the report rather than silently
 * dropping the ability.
 */
export const typesIn = tooltip => {
  const text = plain(tooltip);
  const dealt = [];
  const all = [];
  for (const match of text.matchAll(DAMAGE_PHRASE)) {
    const word = match[1].toLowerCase();
    const type = TYPE_WORDS.find(([vi]) => vi === word)?.[1];
    if (!type) continue;
    if (!all.includes(type)) all.push(type);
    const before = text.slice(Math.max(0, match.index - DEALT_WINDOW), match.index);
    if (/\bgây\b/i.test(before) && !dealt.includes(type)) dealt.push(type);
  }
  return { dealt, all, sentence: text.slice(0, 240) };
};

const download = async () => {
  const versions = await fetchJson(`${DDRAGON}/api/versions.json`);
  const version = versions[0];
  const data = `${DDRAGON}/cdn/${version}/data/${LOCALE}`;

  // The index is the only reliable way from our file prefix to Riot's key: we
  // write `ChoGath_Q.ts`, Data Dragon files it under `Chogath`. It is the one
  // mismatch in 63, and it is also the reason this is a lookup rather than a
  // hand-written alias table that would rot the day a champion is added.
  const index = (await fetchJson(`${data}/champion.json`)).data;
  const byLowerKey = new Map(Object.keys(index).map(key => [key.toLowerCase(), key]));

  const champions = [
    ...new Set(
      readdirSync(SPELL_DIR)
        .filter(file => /^[A-Za-z]+_[QWER]\.ts$/.test(file))
        .map(file => file.split('_')[0])
    ),
  ].sort();

  const types = {};
  const missing = [];
  for (const champion of champions) {
    const key = byLowerKey.get(champion.toLowerCase());
    if (!key) {
      missing.push(champion);
      continue;
    }
    const detail = (await fetchJson(`${data}/champion/${key}.json`)).data[key];
    detail.spells.forEach((spell, i) => {
      types[`${champion}_${SLOTS[i]}`] = { name: spell.name, ...typesIn(spell.tooltip) };
    });
    process.stdout.write(`  ${key}\n`);
  }
  if (missing.length) console.warn(`\n! no Data Dragon champion for: ${missing.join(', ')}`);

  return {
    $comment:
      'Generated by scripts/wiki/sync-damage-types.mjs from Riot Data Dragon vi_VN. ' +
      'Do not hand-edit; run `npm run damage:sync -- --refresh` instead.',
    version,
    locale: LOCALE,
    source: `${DDRAGON}/cdn/${version}/data/${LOCALE}/`,
    fetchedAt: new Date().toISOString(),
    types: Object.fromEntries(Object.entries(types).sort(([a], [b]) => a.localeCompare(b))),
  };
};

const loadCache = async () => {
  if (!REFRESH && existsSync(CACHE_FILE)) return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  console.log(`fetching ${LOCALE} tooltips from Data Dragon...`);
  const payload = await download();
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`\nwrote ${CACHE_FILE} (${Object.keys(payload.types).length} abilities)`);
  return payload;
};

/**
 * Every `takeDamage(...)` in a file, as `{ start, end, type, quote, at }`.
 *
 * Paren-balanced rather than a regex, because the arguments routinely contain
 * calls of their own — `takeDamage(scaled(base, level), this.owner, 'MAGIC')`
 * — and a lazy `[^)]*` stops at the first inner paren and reports the site as
 * untyped. That mistake is what made an earlier count say 10 sites had no
 * damage type when the real number is zero.
 */
export const damageSites = source => {
  const sites = [];
  const CALL = 'takeDamage(';
  let i = 0;
  while ((i = source.indexOf(CALL, i)) !== -1) {
    const open = i + CALL.length - 1;
    let depth = 0;
    let end = open;
    for (let j = open; j < source.length; j++) {
      const c = source[j];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    const args = source.slice(open + 1, end);
    const match = args.match(/(['"])(PHYSICAL|MAGIC|TRUE)\1/);
    sites.push({
      start: open + 1,
      end,
      type: match?.[2] ?? null,
      quote: match?.[1] ?? "'",
      at: match ? open + 1 + match.index : null,
    });
    i = end;
  }
  return sites;
};

/**
 * The same claim regexes `tests/spells/damageTypeClaims.test.ts` enforces.
 *
 * Kept in step with that test on purpose: it is the thing that would fail if
 * this script wrote a type into a file whose own sentence says otherwise, so
 * the codemod refuses exactly the edits the suite would reject. English prose
 * for the two ordinary types is off the list there for reasons its own comment
 * gives, and is off it here for the same ones.
 */
export const CLAIMS = [
  [/sát thương chuẩn|true damage|TRUE_DAMAGE/i, 'TRUE'],
  [/sát thương vật lý|PHYSICAL_DAMAGE/i, 'PHYSICAL'],
  [/sát thương phép/i, 'MAGIC'],
];
export const claimsIn = source => CLAIMS.filter(([re]) => re.test(source)).map(([, type]) => type);

/**
 * The abilities Data Dragon cannot answer, and the answer, with its reason.
 *
 * All three failed the same way and it is worth naming: **Riot does not print
 * a damage type for damage that rides a basic attack**, because the attack
 * already has one. Ashe's Q says only "her Đòn Đánh will deal X sát thương",
 * Twitch's R says his arrows "gây sát thương" — no type in either, and both
 * are physical for the same reason every auto-attack in this engine is
 * (`combat/BasicAttack.ts`, `BASIC_ATTACK_TYPE`). This pack implements both as
 * their own projectile with their own `takeDamage`, so the type that was
 * implicit upstream has to be written down here.
 *
 * Pyke E is the opposite case: upstream is explicit ("gây X sát thương vật
 * lý"), and it is this pack's own Vietnamese that was wrong, so the sentence
 * was corrected rather than the tooltip disbelieved.
 *
 * A decision belongs here rather than as an edit the codemod cannot reproduce,
 * so that `--check` keeps holding the file to it and the next person reads why.
 */
export const DECIDED = {
  Ashe_Q: { type: "PHYSICAL", why: "empowers her attacks; upstream names no type because an attack has one" },
  Twitch_R: { type: "PHYSICAL", why: "his arrows are attacks; same reason Ashe Q names no type" },
  Pyke_E: { type: "PHYSICAL", why: "upstream is explicit; this pack's own tooltip said phép and was corrected" },
};

/**
 * The Vietnamese word for each type, and the class the stylesheet paints it by.
 *
 * The words are the ones Riot's own client uses, which is what makes the
 * tooltip match the game a player already knows. The classes are core's:
 * `styles/main.css` gives each the colour `DAMAGE_TEXT_COLOR` already uses for
 * the floating numbers, so a promise of "40 sát thương phép" is the colour of
 * the 40 that comes off the bar.
 */
const TYPE_WORD = { PHYSICAL: 'vật lý', MAGIC: 'phép', TRUE: 'chuẩn' };
const TYPE_CLASS = { PHYSICAL: 'physical', MAGIC: 'magic', TRUE: 'true' };

/** A span that already names a type — the word, whichever it is. */
const NAMES_TYPE = /sát thương\s+(vật lý|phép|chuẩn)/i;
/** A span carrying an actual damage figure, as opposed to emphasised prose. */
const IS_FIGURE = /sát thương/i;
/** Crit is a figure with a noun already attached; "sát thương vật lý chí mạng" is not Vietnamese. */
const IS_CRIT = /sát thương\s+chí mạng/i;

/** `<span class="damage">…</span>`, and nothing else — `buff`, `time` and `heal` make no such claim. */
const DAMAGE_SPAN = /<span class="damage( (?:physical|magic|true))?">([\s\S]*?)<\/span>/g;

/**
 * What one file's damage spans should say, given the type it deals.
 *
 * Returns the rewritten source and a list of spans it would not touch. The
 * refusals matter more than the rewrites and are all the same shape — a span
 * whose text is not a damage figure at all:
 *
 *   - **emphasis**: `<span class="damage">tướng địch</span>` uses the colour to
 *     pick a word out of a sentence. There is no number in it to type.
 *   - **a percentage**: "giảm 30% sát thương" describes a *modifier*, and a
 *     modifier applies to whatever type the hit already was.
 *   - **crit**: "sát thương chí mạng" is a compound noun, and the type word
 *     cannot be slotted into the middle of one.
 *   - **a span already naming another type**: only reachable in a file the
 *     type pass refused, and left for a human by the same reasoning.
 */
const describedSource = (source, want) => {
  const refused = [];
  const next = source.replace(DAMAGE_SPAN, (whole, existingClass, inner) => {
    if (!IS_FIGURE.test(inner)) return whole;
    if (inner.includes('%')) {
      refused.push(`percentage: ${inner.trim()}`);
      return whole;
    }
    const named = inner.match(NAMES_TYPE);
    if (named && TYPE_WORD[want] !== named[1].toLowerCase()) {
      refused.push(`already says ${named[1]}: ${inner.trim()}`);
      return whole;
    }
    // The word only when it is missing; the class always, including on the
    // spans a pack had already typed by hand — those were the right sentence
    // in the wrong colour.
    let text = inner;
    if (!named) {
      if (IS_CRIT.test(inner)) refused.push(`crit: ${inner.trim()}`);
      else text = inner.replace(/sát thương/i, match => `${match} ${TYPE_WORD[want]}`);
    }
    return `<span class="damage ${TYPE_CLASS[want]}">${text}</span>`;
  });
  return { next, refused };
};

/**
 * What type an ability deals, or why nobody can say.
 *
 * One function so the two passes below cannot disagree: it would be a poor
 * joke to type a hit `PHYSICAL` and then write "sát thương phép" underneath it.
 */
const resolveType = (slug, source, upstream, sites) => {
  const decided = DECIDED[slug];
  const entry = upstream[slug];
  if (!decided && !entry) return { skip: 'no upstream ability' };
  const found = decided ? [decided.type] : entry.dealt.length ? entry.dealt : entry.all;
  if (found.length === 0) return { skip: 'tooltip names no damage type' };
  if (found.length > 1) return { skip: `tooltip names ${found.join(' + ')}` };

  const current = [...new Set(sites.map(site => site.type))];
  if (current.length > 1) return { skip: `file already mixes ${current.join(' + ')} — hand-tuned` };

  const want = found[0];
  const contradicting = claimsIn(source).filter(type => type !== want);
  if (contradicting.length && current[0] !== want) {
    return { review: want, from: current[0], why: `own prose claims ${contradicting.join(' + ')}` };
  }
  return { want, from: current[0] };
};

const main = async () => {
  const cache = await loadCache();
  const upstream = cache.types;

  const files = readdirSync(SPELL_DIR)
    .filter(file => /^[A-Za-z]+_[QWER]\.ts$/.test(file))
    .sort();

  const retyped = [];
  const described = [];
  const review = [];
  const skipped = [];
  const refusals = [];
  let agreed = 0;

  for (const file of files) {
    const slug = file.slice(0, -3);
    const filePath = join(SPELL_DIR, file);
    let source = readFileSync(filePath, 'utf8');
    const sites = damageSites(source).filter(site => site.at !== null);
    if (!sites.length) continue;

    const decision = resolveType(slug, source, upstream, sites);
    if (decision.skip) {
      skipped.push([slug, decision.skip]);
      continue;
    }
    if (decision.review) {
      review.push([slug, decision.from, decision.review, decision.why]);
      continue;
    }
    const { want, from } = decision;

    // ------------------------------------------------------- the argument
    if (from !== want) {
      retyped.push([slug, from, want, sites.length]);
      // Back to front, so an earlier replacement cannot shift a later index.
      for (const site of [...sites].reverse()) {
        const literal = `${site.quote}${want}${site.quote}`;
        source = source.slice(0, site.at) + literal + source.slice(site.at + site.type.length + 2);
      }
    } else {
      agreed++;
    }

    // ------------------------------------------------------- the sentence
    const { next, refused } = describedSource(source, want);
    if (next !== source) described.push([slug, want]);
    for (const reason of refused) refusals.push([slug, reason]);
    source = next;

    if (APPLY && source !== readFileSync(filePath, 'utf8')) writeFileSync(filePath, source);
  }

  console.log(`\nData Dragon ${cache.version} (${cache.locale})`);
  console.log(`${agreed} abilit${agreed === 1 ? 'y' : 'ies'} already deal what upstream says.`);

  if (retyped.length) {
    console.log(`\n${retyped.length} damage type${retyped.length === 1 ? '' : 's'} ${APPLY ? 'rewritten' : 'to rewrite'}:`);
    for (const [slug, from, to, n] of retyped) {
      console.log(`  ${slug.padEnd(18)} ${from} -> ${to}${n > 1 ? `  (${n} sites)` : ''}`);
    }
  }
  if (described.length) {
    console.log(`\n${described.length} description${described.length === 1 ? '' : 's'} ${APPLY ? 'labelled' : 'to label'}:`);
    console.log(`  ${described.map(([slug]) => slug).join(', ')}`);
  }
  if (review.length) {
    console.log(`\n${review.length} need a human — code and prose disagree:`);
    for (const [slug, from, to, why] of review) {
      console.log(`  ${slug.padEnd(18)} ${from} -> ${to}   ${why}`);
    }
  }
  if (skipped.length) {
    console.log(`\n${skipped.length} left alone:`);
    for (const [slug, why] of skipped) console.log(`  ${slug.padEnd(18)} ${why}`);
  }
  if (refusals.length) {
    console.log(`\n${refusals.length} span${refusals.length === 1 ? '' : 's'} left unlabelled:`);
    for (const [slug, why] of refusals) console.log(`  ${slug.padEnd(18)} ${why}`);
  }

  const drifted = retyped.length + described.length + review.length;
  if (drifted && !APPLY && !CHECK) console.log('\nrun with --apply to rewrite the spell files.');
  // A prose contradiction fails the check as hard as a wrong literal does. It
  // is the one class this refuses to write, and the one class nothing else
  // catches: `damageTypeClaims.test.ts` compares a sentence to its own file, so
  // it passes anything that agrees with itself and with nothing upstream.
  if (CHECK && drifted) {
    console.log('\n! damage types drifted from Data Dragon. Run `npm run damage:sync -- --apply`.');
    process.exit(1);
  }
};

// Only when run as a command, so the helpers above stay importable by anything
// wanting to re-derive a decision without setting off a network sync.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
