#!/usr/bin/env node
/**
 * Refresh `data/popular.json` -- which entries carry a highlighted star badge.
 *
 *   node scripts/refresh-popular.js
 *
 * Only membership is stored, never a count. The badge itself is fetched live
 * from shields on every page load, so the number a reader sees is always
 * current; this file decides one thing about it, the colour.
 *
 * That is why storing it is fine where storing counts was not. A stale count
 * displayed as fact is wrong. A stale threshold means a project that crossed
 * the line last week is highlighted a little late, which nobody can misread.
 *
 * Membership also changes far more slowly than a number, so the monthly diff is
 * a short list of projects that crossed the line -- readable, unlike 117
 * integers ticking over.
 */

import fs from "node:fs";

import { POPULAR_PATH, POPULAR_THRESHOLD, loadEntries, loadPopular } from "./data.js";
import { inspectRepo } from "./audit.js";

async function main() {
  const entries = loadEntries();
  const previous = new Set(loadPopular());
  const popular = [];
  let unreadable = 0;

  for (const [i, entry] of entries.entries()) {
    process.stderr.write(`\r  ${i + 1}/${entries.length} ${entry.repo.padEnd(48)}`);
    const info = await inspectRepo(entry.repo);
    if (!info || typeof info.stars !== "number") {
      // One bad response should not demote a project. Keep its current status.
      unreadable += 1;
      if (previous.has(entry.repo)) popular.push(entry.repo);
      continue;
    }
    if (info.stars >= POPULAR_THRESHOLD) popular.push(entry.repo);
  }
  process.stderr.write(`\r${" ".repeat(70)}\r`);

  popular.sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(
    POPULAR_PATH,
    `${JSON.stringify({ threshold: POPULAR_THRESHOLD, repos: popular }, null, 1)}\n`,
  );

  const added = popular.filter((r) => !previous.has(r));
  const dropped = [...previous].filter((r) => !popular.includes(r));
  console.log(
    `${popular.length} of ${entries.length} at or above ${POPULAR_THRESHOLD} stars` +
      (unreadable ? `, ${unreadable} unreadable (status kept)` : ""),
  );
  if (added.length) console.log(`  crossed:  ${added.join(", ")}`);
  if (dropped.length) console.log(`  dropped:  ${dropped.join(", ")}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
