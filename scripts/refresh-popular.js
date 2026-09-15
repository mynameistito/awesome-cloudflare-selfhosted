#!/usr/bin/env node
/**
 * Keep each entry's `popular` flag in step with its star count.
 *
 *   node scripts/refresh-popular.js
 *
 * The flag lives in the entry's own frontmatter rather than a shared list, for
 * three reasons:
 *
 * - A new submission is correct immediately. `propose-entry` sets the flag from
 *   the stars it already fetched, so a popular project is highlighted the moment
 *   it lands instead of waiting for the next refresh.
 * - There is no shared file for two pull requests to fight over. A central list
 *   would be appended to by every submission, which is the collision this repo
 *   already avoids by keeping generated files out of pull requests.
 * - It matches how `license` and `bindings` already work: derived from the
 *   repository, written into the entry, checked by the audit.
 *
 * Only the flag is stored, never a count. The badge fetches the live number from
 * shields on every page load, so nothing stale is displayed -- this decides one
 * thing, the colour.
 *
 * Only files whose status actually changed are rewritten, so a month where
 * nothing crossed the line touches nothing.
 */

import fs from "node:fs";
import path from "node:path";

import { ENTRIES_DIR, POPULAR_THRESHOLD, loadEntries } from "./data.js";
import { inspectRepo } from "./audit.js";

/** Add or remove the `popular: true` line, leaving every other line alone. */
export function setPopularFlag(text, popular) {
  const has = /^popular:\s*true\s*$/m.test(text);
  if (has === popular) return text;
  if (popular) {
    // Immediately before `summary`, which is where renderEntry puts it.
    return text.replace(/^(summary:)/m, "popular: true\n$1");
  }
  return text.replace(/^popular:\s*true\s*\n/m, "");
}

async function main() {
  const entries = loadEntries();
  const changed = [];
  let unreadable = 0;

  for (const [i, entry] of entries.entries()) {
    process.stderr.write(`\r  ${i + 1}/${entries.length} ${entry.repo.padEnd(48)}`);
    const info = await inspectRepo(entry.repo);
    if (!info || typeof info.stars !== "number") {
      // One bad response should not demote a project. Leave it as it is.
      unreadable += 1;
      continue;
    }
    const popular = info.stars >= POPULAR_THRESHOLD;
    if (popular === entry.popular) continue;

    const file = path.join(ENTRIES_DIR, `${entry.slug}.md`);
    fs.writeFileSync(file, setPopularFlag(fs.readFileSync(file, "utf8"), popular));
    changed.push(`${popular ? "+" : "-"} ${entry.repo} (${info.stars})`);
  }
  process.stderr.write(`\r${" ".repeat(70)}\r`);

  console.log(
    `${entries.length} entries checked against ${POPULAR_THRESHOLD} stars, ` +
      `${changed.length} changed` +
      (unreadable ? `, ${unreadable} unreadable (left as they were)` : ""),
  );
  for (const line of changed) console.log(`  ${line}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
