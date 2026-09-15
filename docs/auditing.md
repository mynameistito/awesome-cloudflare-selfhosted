# How the audit works

The list claims its facts are read from each project rather than taken on trust. This is how.

## The data

`data/` is the source of truth. README.md and the issue form are generated from it, so edit the
data, not the page.

```
data/
  categories/<slug>.md   one per section — name, order, description
  entries/<slug>.md      one per project — references a category by its slug
```

A file's name is its id. `data/entries/punctual.md` is the entry `punctual`, and its
`category: business-and-operations` points at `data/categories/business-and-operations.md`.
Nothing else links the two, so a rename surfaces as a load error rather than an entry quietly
disappearing from the list.

Generated files are deliberately absent from pull requests. Two submissions that each regenerated
README.md would both rewrite the entry count to the same new number, and git merges identical
changes cleanly — no conflict, but a README that disagrees with the data and silently omits one of
the two entries. A push to `main` regenerates instead.

## Commands

```bash
npm run build           # regenerate README.md and the issue form from data/
npm run audit           # re-check every entry against GitHub
npm run audit:stale     # only entries inactive for 12+ months
npm run audit -- --json # machine-readable
npm test                # test the deploy-config parser
npm run lint            # awesome-lint
```

No dependencies — Node 20+ and [`gh`](https://cli.github.com) are all you need. The audit uses
`gh` for API quota; CI runs it monthly and on every pull request.

## Highlighted entries

`data/popular.json` lists the repositories whose star badge is drawn in green,
currently those at or above 1,000 stars — about a fifth of the list.

Only membership is stored, never a count. The badge fetches the live number from
shields on every page load, so nothing stale is ever displayed; the file decides
the colour and nothing else. That is the difference from storing counts, which
this list deliberately does not do: a stale count shown as fact is wrong, while a
stale threshold means a project that crossed the line last week is highlighted a
little late.

It refreshes monthly (`npm run popular`). The diff is a short list of projects
that crossed the line, rather than 117 integers ticking over.

## What the audit checks

[`scripts/audit.js`](../scripts/audit.js) walks every entry and reports:

- the resolved SPDX licence, read from the repository's licence file rather than trusting GitHub's
  classifier, and whether it warrants a marker
- whether a Cloudflare deploy configuration exists — `wrangler.toml`, `.json`, `.jsonc`, a
  committed `.example` variant, or an Alchemy `alchemy.run.ts`
- the bindings that configuration declares, which is where each entry's binding list comes from
- last push date, latest release tag, and archived status

## Why reading a config is harder than it looks

Getting this wrong in either direction misleads people, and each of these produced a wrong answer
against a real project before it was fixed:

- A path glob like `/fonts/*` or `"/api/*"` looks exactly like the start of a block comment. A
  regex that treats it as one swallows the rest of the file, erasing every binding below it.
- `wrangler init` scaffolds every binding Cloudflare offers as commented placeholders. Counting
  those credits a project with Vectorize and Hyperdrive it has never used.
- A binding commented out because its id must be filled in locally *is* real, so comments cannot
  simply be dropped either.
- "All rights reserved." appears verbatim in BSD's own text, so a proprietary-licence fallback has
  to run after the known licences or BSD reads as custom terms.

[`scripts/config-parser.js`](../scripts/config-parser.js) holds the rules and
[`config-parser.test.js`](../scripts/config-parser.test.js) pins down each case.

## Not every project uses wrangler

[Alchemy](https://alchemy.run) declares the same infrastructure in TypeScript, and a checker that
only looks for `wrangler.toml` rejects those projects as undeployable — which is how a list like
this quietly loses some of its best entries. Both forms are recognised. If a project deploys to
Cloudflare some third way, that is a bug worth reporting rather than a reason to exclude it.
