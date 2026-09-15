/**
 * Tests for the data loader.
 *
 * The point of splitting categories into their own files is that a reference
 * between them can be checked. These cover the frontmatter subset and the
 * entry -> category link, against the real `data/` content.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  loadCategories,
  loadEntries,
  loadSections,
  parseFrontmatter,
  licenseBadge,
  renderRow,
  slugify,
  starBadge,
} from "./data.js";

test("frontmatter: scalars, inline lists, empties and numbers", () => {
  const { data, body } = parseFrontmatter(
    `---
name: Punctual
order: 40
license: null
bindings: [D1, R2, Durable Objects]
summary: Calendly alternative, edge-rendered.
---

Longer prose.
`,
  );
  assert.equal(data.name, "Punctual");
  assert.equal(data.order, 40);
  assert.equal(data.license, null);
  assert.deepEqual(data.bindings, ["D1", "R2", "Durable Objects"]);
  assert.equal(data.summary, "Calendly alternative, edge-rendered.");
  assert.equal(body, "Longer prose.");
});

test("frontmatter: a summary containing a colon survives intact", () => {
  const { data } = parseFrontmatter(
    "---\nname: X\nsummary: Canny alternative: boards, roadmap and changelog.\n---\n",
  );
  assert.equal(data.summary, "Canny alternative: boards, roadmap and changelog.");
});

test("categories are ordered by their order field, not filename", () => {
  const cats = loadCategories();
  const orders = cats.map((c) => c.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  assert.equal(cats[0].slug, "analytics");
  assert.equal(cats.at(-1).slug, "personal");
});

test("every category slug is unique and every entry resolves to one", () => {
  const cats = loadCategories();
  assert.equal(new Set(cats.map((c) => c.slug)).size, cats.length);

  const entries = loadEntries();
  for (const entry of entries) {
    assert.ok(entry.category, `${entry.slug} has no resolved category`);
    assert.equal(entry.category.slug, entry.categorySlug);
  }
});

test("an entry pointing at a missing category throws, rather than vanishing", () => {
  // The failure mode the category split introduces: rename a category file and
  // every entry referencing it must fail loudly, not drop out of the README.
  // Loading the real entries against a category list missing one proves it.
  const withoutAnalytics = loadCategories().filter((c) => c.slug !== "analytics");
  assert.throws(
    () => loadEntries(withoutAnalytics),
    /category "analytics" has no file in data\/categories\//,
  );
});

test("entry repos are unique -- no project listed twice", () => {
  const repos = loadEntries().map((e) => e.repo.toLowerCase());
  const dupes = repos.filter((r, i) => repos.indexOf(r) !== i);
  assert.deepEqual(dupes, [], `duplicate entries: ${dupes.join(", ")}`);
});

test("sections drop empty categories and keep entries alphabetical", () => {
  for (const section of loadSections()) {
    assert.ok(section.entries.length > 0);
    const names = section.entries.map((e) => e.name.toLowerCase());
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  }
});

test("renderRow marks unlicensed and source-available entries", () => {
  const [left] = renderRow({
    name: "Punctual", repo: "CCCrafts/punctual", summary: "Calendly alternative.",
    license: "MIT", bindings: ["D1", "R2"],
  });
  assert.match(left, /^\*\*\[Punctual\]\(https:\/\/github\.com\/CCCrafts\/punctual\)\*\*<br>/);
  assert.match(left, /<img alt="stars"[^>]*>&nbsp;<img alt="MIT"/);

  const [noLicense] = renderRow({
    name: "smail", repo: "akazwz/smail", summary: "Temporary mailbox.",
    license: null, bindings: ["D1"],
  });
  assert.match(noLicense, /<img alt="⚠ unlicensed"/);

  const [sourceAvailable] = renderRow({
    name: "Timeseal", repo: "Teycir/Timeseal", summary: "Time-locked vault.",
    license: "BUSL-1.1", bindings: ["D1"],
  });
  assert.match(sourceAvailable, /<img alt="⚠ BUSL-1\.1"/);

  // An ordinary open license gets no marker.
  const [open] = renderRow({
    name: "X", repo: "a/b", summary: "Thing.", license: "EPL-2.0", bindings: [],
  });
  assert.match(open, /<img alt="EPL-2\.0"/);
});

test("renderRow stacks the summary over the bindings", () => {
  const [, right] = renderRow({
    name: "X", repo: "a/b", summary: "Does a thing.", license: "MIT",
    bindings: ["D1", "R2", "KV"],
  });
  assert.equal(right, "Does a thing.<br><sub>D1 · R2 · KV</sub>");
});

test("renderRow omits the bindings line when there are none", () => {
  const [, right] = renderRow({
    name: "X", repo: "a/b", summary: "Does a thing.", license: "MIT", bindings: [],
  });
  assert.equal(right, "Does a thing.");
  assert.ok(!right.includes("<sub>"));
});

test("slugify turns a repo into its entry id", () => {
  assert.equal(slugify("CCCrafts/punctual"), "punctual");
  assert.equal(slugify("MarSeventh/CloudFlare-ImgBed"), "cloudflare-imgbed");
  assert.equal(slugify("inngest/typedwebhook.tools"), "typedwebhook-tools");
});

test("starBadge is built from the repo alone, with nothing stored", () => {
  const badge = starBadge("benvinegar/counterscale");
  assert.equal(
    badge,
    '<img alt="stars" src="https://img.shields.io/github/stars/benvinegar/counterscale' +
      '?style=flat-square&amp;label=%E2%98%85" align="absmiddle" height="18">',
  );
});

// GitHub strips `style` from user HTML, so the badge relies on the attributes
// that survive its sanitiser. Losing these silently would un-align every row.
test("starBadge keeps the attributes GitHub actually preserves", () => {
  const badge = starBadge("a/b");
  assert.match(badge, /align="absmiddle"/);
  assert.match(badge, /alt="stars"/);
  // hspace pads both sides, so it cannot give a flush left edge.
  assert.ok(!badge.includes("hspace"), "hspace would indent the badge");
  // Shorter than the line box, so a wrapped pair is not flush against itself.
  assert.match(badge, /height="18"/);
  assert.ok(!/\sstyle="/.test(badge), "a style attribute would be stripped by GitHub");
});

// Shields escaping: a literal dash doubles, a space becomes an underscore.
// Getting this wrong renders "BUSL-1.1" as "BUSL 1.1" with a split label.
test("licenseBadge escapes text the way shields expects", () => {
  assert.match(licenseBadge("BUSL-1.1"), /badge\/%E2%9A%A0_BUSL--1\.1-orange/);
  assert.match(licenseBadge("MIT"), /badge\/MIT-lightgrey/);
  assert.match(licenseBadge("AGPL-3.0"), /badge\/AGPL--3\.0-lightgrey/);
});

test("both badges are drawn the same height, or they will not line up", () => {
  const star = starBadge("a/b").match(/height="(\d+)"/)[1];
  const lic = licenseBadge("MIT").match(/height="(\d+)"/)[1];
  assert.equal(star, lic);
});

test("licenseBadge colours the cases a reader should check", () => {
  assert.match(licenseBadge(null), /-orange\?/, "no licence should warn");
  assert.match(licenseBadge("BUSL-1.1"), /-orange\?/, "source-available should warn");
  assert.match(licenseBadge("MIT"), /-lightgrey\?/, "open source should not");
  assert.match(licenseBadge("EPL-2.0"), /-lightgrey\?/, "uncommon open source should not");
});

test("every entry renders a badge for its own repo", () => {
  for (const entry of loadEntries()) {
    const [left] = renderRow(entry);
    assert.ok(
      left.includes(`img.shields.io/github/stars/${entry.repo}?`),
      `${entry.slug} badge does not point at ${entry.repo}`,
    );
  }
});

// A stray pipe in a summary would split a cell and corrupt the table.
test("no summary contains a character that would break a table cell", () => {
  for (const entry of loadEntries()) {
    assert.ok(!entry.summary.includes("|"), `${entry.slug} summary contains a pipe`);
    assert.ok(!entry.name.includes("|"), `${entry.slug} name contains a pipe`);
  }
});
