# Foundation — Release Manifest

**Version** 2.3.3
**Build** 2.3.3+schema.1
**Storage schema** 1
**Service worker cache** v2.3.3
**Release date** 30 July 2026
**Phases** 23 of 23 complete

---

## What this document is

The single page to read before shipping. It states what was tested, what was
not, and what is known to be limited — with those three kept strictly apart.
Every claim below is either backed by a named test or marked as untested.

Legend used throughout:

| Mark | Meaning |
|---|---|
| **TESTED** | An automated test asserts it and passes |
| **NOT TESTED** | No test asserts it; no claim is made |
| **ENVIRONMENT LIMITED** | Cannot be tested here; the tool is absent |
| **KNOWN LIMITATION** | Works as designed, and the design has a ceiling |

---

## Tests

| | |
|---|---:|
| Node | **1,310 passing** |
| Browser tests, under jsdom | **88 passing** |
| Total | **1,398 passing** |
| Failing | **0** |
| Skipped under Node (need a DOM) | 88 |
| Skipped under jsdom | 0 |

Phase 23 added **77** tests: 71 in Node (`tests/release.test.js`) and 6
browser-side graph audits in `tests/architecture.test.js`. The 1,304 tests that
existed before phase 23 all still pass, unchanged.

**How the browser tests were run:** under a temporary jsdom harness, installed
for the run and removed afterwards. The project still declares **zero
dependencies**. No real browser and no real device were available at any point.

---

## Phases

| # | Phase | # | Phase |
|---|---|---|---|
| 1 | Shell, PWA, offline | 13 | UI layer |
| 2 | SPA routing, theming | 14 | Production hardening |
| 3 | Data layer, validation, events | 15 | i18n (English / Arabic) |
| 4 | Calculation engines | 16 | Reports engine |
| 5 | Planner engine | 17 | Insights engine |
| 6 | Exercise database | 18 | Dashboard engine |
| 7 | Workout engine | 19 | Analytics engine |
| 8 | Execution engine | 20 | Import / export / backup |
| 9 | Running engine | 21 | Coach engine (rule-based) |
| 10 | Nutrition core | 22 | PDF & charts (reporting layer) |
| 11 | Meal planning | 23 | Final production hardening |
| 12 | Application layer | | |

---

## Architecture — **TESTED**

```
pages/ + components/     presentation only
        ↓ App.query · App.actions · App.forms
app/                     orchestration, no business logic
        ↓ (reporting only, one direction)
reporting/               documents, charts, renderers — imports no figure source
        ↓
services/                storage boundary: fetch, cache, publish
        ↓
engines/ + rules/        all calculation and policy — PURE
        ↓
models/ validators/ repositories/ data/ events/
        ↓
localStorage
```

`tests/architecture.test.js` reads the service worker's own precache manifest —
240 modules — and fails on any of the following:

| Check | Result |
|---|---|
| Layer imports outside its allowance | **TESTED** — 0 breaches |
| UI reaching past `app/` | **TESTED** — 0 breaches |
| Engine touching storage | **TESTED** — 0 breaches |
| Only repositories import the storage engine | **TESTED** — 0 breaches |
| Direct `console` outside the logger | **TESTED** — 0 breaches |
| `innerHTML`, `eval`, `new Function` | **TESTED** — 0 uses |
| Reporting layer importing anything that produces a figure | **TESTED** — 0 breaches |
| Reporting layer reading `engines/constants.js` | **TESTED** — 0 breaches |
| Reporting layer performing arithmetic on presented figures | **TESTED** — 0 matches |
| Literal sentences in the reporting layer | **TESTED** — 0 found |
| Circular imports, anywhere in the app | **TESTED** — 0 cycles |
| Modules nothing imports | **TESTED** — 0, after 15 named entry points |
| Duplicate ownership within a folder | **TESTED** — 0 |
| Engine formulas reimplemented in `app/` | **TESTED** — 0 matches for BMR, macro energy densities, pace conversion, acute:chronic ratio, 1RM estimate |

**Documented cross-layer exemptions** — two, both deliberate:

- `scripts/logger.js` — cross-cutting infrastructure. Every layer logs.
- `engines/constants.js` — shared configuration that grew into the wrong
  folder. It holds tuning values for the whole app, not engine behaviour.
  Renaming it touches ~40 imports and was judged not worth the churn. The
  **reporting layer is excluded from this exemption** and has its own
  constants file, so the exemption can never widen.

---

## Security — **TESTED**

| Check | Result |
|---|---|
| `__proto__` in an imported backup | **TESTED** — refused, `Object.prototype` unpolluted |
| `constructor` / `prototype` keys | **TESTED** — stripped by `scripts/safe-json.js` |
| 13 malformed envelope shapes (null, scalars, arrays, wrong types) | **TESTED** — no internal error; `ImportError` or a clean verdict |
| Duplicate ids on import | **TESTED** — refused, nothing written |
| Broken references (unknown exercise / food ids) | **TESTED** — kept as warnings, never silently dropped |
| Invalid and future dates | **TESTED** — invalid refused, future accepted and reported |
| `eval` / `new Function` / dynamic script injection | **TESTED** — none in 240 shipped modules |
| `innerHTML` | **TESTED** — none. The UI builds DOM nodes; the print renderer returns an escaped string |
| HTML escaping in the print renderer | **TESTED** — `</article><script>` round-trips as entities |
| Private data in a printed report | **TESTED** — ids, timestamps, tokens, emails and phone patterns are stripped on the way in |

Every record read from storage passes its model's schema before any engine sees
it. Records that fail are dropped and **counted** in the report's
`quality.dropped`, never silently discarded.

---

## Backup and restore — **TESTED**

| Case | Result |
|---|---|
| Full export → clear → import → compare | **TESTED** — data identical |
| Round trip through a JSON string | **TESTED** — data identical |
| Partial export (profile / training / nutrition / settings) | **TESTED** — untouched sections preserved |
| Merge | **TESTED** — nothing lost from either side |
| Replace | **TESTED** — the file becomes the truth |
| Dry run | **TESTED** — nothing written, no cache invalidated |
| Validation only | **TESTED** — all 11 checks run, nothing written |
| Rollback on a mid-import failure | **TESTED** — store byte-identical to before |
| Silent partial write (storage refuses a row) | **TESTED** — caught by counting, rolled back |
| Corrupted file | **TESTED** — refused, nothing written |
| Foreign app | **TESTED** — refused |
| Older schema (no version stamp) | **TESTED** — migrated forward, reported as a fixed item |
| Future schema | **TESTED** — refused rather than partially imported |
| Empty backup | **TESTED** |
| Large backup (400 records) | **TESTED** |
| Every repository covered by the backup schema | **TESTED** — 14 of 14 |

**Documented exception:** an import **re-stamps `updatedAt`** on every restored
record, because `replaceAll` writes through the model. The data is identical
across a round trip; the write metadata is not. `updatedAt` means "when this row
was last written", and after a restore that is genuinely now. Both halves are
pinned by tests so the behaviour cannot change silently.

**No half-imported state is reachable.** The order is: parse → read current
state → plan (pure, writes nothing) → refuse if unsound → snapshot every
affected section → apply → verify each section landed → restore on any failure.

---

## Cross-engine integration — **TESTED**

One end-to-end test walks a new user through every layer and then through a
restore:

profile → goal → planner → workout → running → nutrition → meals → execution →
reports → analytics → insights → dashboard → coach → reporting → backup →
clear → import → re-read → compare.

The weekly report, the insight set, the analytics summary, the coaching session,
the dashboard and the report document are all compared before and after the
round trip and are **identical**. A printable HTML document and a structural PDF
are produced from the same week.

---

## Cache and event integrity — **TESTED**

Six caches: `dashboard`, `weekly-report`, `weekly-insights`, `analytics`,
`coach`, `report-document-weekly` (plus monthly and progress documents).

| Check | Result |
|---|---|
| Second read served from cache, every cache | **TESTED** |
| Identical object returned, not an equal one | **TESTED** |
| A write invalidates and no stale figure is served | **TESTED** |
| Invalidating one cache leaves unrelated caches alone | **TESTED** |
| Cold start then ten warm reads rebuild nothing | **TESTED** |
| Monthly / quarterly / yearly analytics memoised separately | **TESTED** |
| No test depends on execution order | **TESTED** |
| **A read emits no event at all** | **TESTED** — warm and cold |
| A write emits, and the emission invalidates | **TESTED** |
| One write rebuilds each cache at most a bounded number of times | **TESTED** — no thrashing |
| 20 wire/unwire cycles do not multiply work | **TESTED** |
| 50 reads do not grow the cache registry | **TESTED** |
| 10 language switches change no figure | **TESTED** |
| 50 invalidations leave the app working | **TESTED** |

**Documented behaviour:** switching language writes to Settings, which sweeps
three snapshot caches. Switching theme has always done the same. The sweep
rebuilds nothing by itself and no figure changes — pinned by a test.

---

## Explainability — **TESTED**

| Producer | Requirement | Result |
|---|---|---|
| Planner / dashboard | every decision has a rule id and a message | **TESTED** |
| Weekly report | every figure has a method and a source | **TESTED** |
| Insights | reason, evidence, source engine, confidence | **TESTED** |
| Analytics | evidence, reason, confidence, source | **TESTED** |
| Coach | reasoning, evidence, source engines, confidence | **TESTED** |
| Reporting layer | carries the producing engine's explanation verbatim; writes none of its own | **TESTED** |
| A dashboard figure can be taken apart to its inputs | | **TESTED** |

No renderer composes an explanation. `metadata.calculated` on every report
document is `[]`, and `metadata.unsourcedFields` counts the figures that name no
engine (structural ones, like a week number).

---

## Internationalisation — **TESTED**

| Check | Result |
|---|---|
| Every English key present in Arabic | **TESTED** — 0 missing |
| No orphaned Arabic key | **TESTED** — 0, excluding `food.*` (see below) |
| No blank label in either language | **TESTED** |
| Placeholders match between the two languages | **TESTED** |
| No raw key reaches a rendered report | **TESTED** — both languages |
| A language change rebuilds no engine and changes no figure | **TESTED** |

**Key counts:** 627 English, 692 Arabic.

**Documented exception:** Arabic carries 65 `food.*` keys English does not.
English deliberately falls back to each record's own `name`. Documented in the
dictionary header since phase 15.

**KNOWN LIMITATION — untranslated by design:**

- 101 exercise names have no Arabic label and fall back to English.
- Engine-authored text stays English: reasons, `workout.goal`,
  `recovery.status`, `plan.phase`, insight summaries, coaching sentences,
  validation messages. These are **data**, not display strings — translating
  them would move wording into storage, and a coaching sentence contains
  figures the engine composed.
- Consequently an **Arabic report has Arabic headings and English findings**.
  That is the designed behaviour, not an unfinished translation.

---

## Right-to-left — **PARTIALLY TESTED**

| Surface | Status |
|---|---|
| `dir` attribute set on the document root | **TESTED** (jsdom) |
| `dir="rtl"` and `lang="ar"` on a printable report | **TESTED** |
| Arabic headings resolved from the Arabic dictionary | **TESTED** |
| Same figures in both language renderings | **TESTED** |
| RTL layout on a real screen | **NOT TESTED** |
| RTL text shaping in a PDF | **NOT TESTED** |

`DIRECTION_SUPPORT` in `reporting/constants.js` reports
`pdf: 'via-browser-print'` rather than `true`, because nothing in this project
has produced a PDF or seen one on paper.

---

## Accessibility — **ENVIRONMENT LIMITED**

Phase 14 ran axe-core in a real browser and recorded zero violations. **Phase 23
did not re-run it**, and no browser or device was available.

| Check | Status |
|---|---|
| axe-core violations | **NOT TESTED in phase 23** — phase 14 recorded 0 |
| Heading hierarchy, labels, accessible names | **NOT RE-TESTED** |
| Keyboard navigation, focus order, focus visibility | **NOT TESTED** |
| Colour contrast | **NOT TESTED** — no tooling available |
| Screen reader behaviour | **NOT TESTED** |
| Arabic / RTL accessibility | **NOT TESTED** |

No page markup changed in phases 15–23, so the phase-14 result is likely still
accurate. "Likely" is not "tested", and this manifest does not claim it is.

---

## Progressive web app and offline — **ENVIRONMENT LIMITED**

| Check | Status |
|---|---|
| Precache manifest lists every shipped module | **TESTED** — 240, and the suite is excluded |
| Manifest and service worker present and versioned together | **TESTED** |
| Cache version bumped for this release | **TESTED** — `v2.3.0` |
| Service worker registration | **NOT TESTED** — jsdom has no service worker |
| Offline reload | **NOT TESTED** |
| Upgrade from a previously cached version | **NOT TESTED** |
| Install on iPhone / Safari | **NOT TESTED** — no device |
| Mobile / tablet / desktop layouts | **NOT TESTED** in phase 23 |
| Back button, direct page access | **NOT TESTED** in phase 23 |

---

## Performance — **MEASURED (Node, not a browser)**

Twelve weeks of logged data, single-threaded Node, cold cache unless stated:

| Operation | Time |
|---|---:|
| Dashboard, cold | 72.6 ms |
| Dashboard, warm | < 0.1 ms |
| Weekly report, cold | 6.3 ms |
| Weekly report, warm | 0.1 ms |
| Analytics, month, cold | 18.3 ms |
| Analytics, quarter, cold | 37.6 ms |
| Coach session, cold | 21.7 ms |
| Coach session, warm | < 0.1 ms |
| Report document, cold | < 0.1 ms |
| Print HTML | 2.5 ms |
| Structural PDF | 0.8 ms |
| Backup export | 1.0 ms |
| Backup import | 14.0 ms |

The cold dashboard is the most expensive read because everything else sits
underneath it — the weekly report, its four lookback weeks, the insight set and
the recovery snapshot. It is paid once per invalidation, not once per read.

**Phase 14 browser figures — DCL 781 ms, FCP 364 ms — were NOT re-measured.**
No browser was available. Those numbers are recorded as historical and are not
claimed to be current. The application shell has not grown: the additions since
phase 14 are engines and a reporting layer, none of which is imported by the
critical path until a page asks for them.

---

## Public API compatibility — **TESTED**

| Surface | Result |
|---|---|
| `Queries` — 15 methods | **TESTED** — all present |
| `DashboardService`, `ReportService`, `InsightsService`, `AnalyticsService`, `CoachService` | **TESTED** — all methods present |
| `BackupService` — `export`, `toJSON`, `download`, `import`, `importFile`, `reset` | **TESTED** — unchanged since phase 3 |
| `App` facade — `query`, `actions`, `forms` | **TESTED** |
| 14 storage keys and the `foundation` prefix | **TESTED** — unchanged |
| 40 event names | **TESTED** — the 11 load-bearing ones asserted individually |
| Legacy goals `bulk` / `cut` / `recomp` / `maintain` | **TESTED** — accepted, aliased, and driven end to end through the planner |
| Legacy muscle names | **TESTED** — pinned by phase-6 regression tests |
| Backup envelope — `app`, `version`, `schemaVersion`, `exportedAt`, `data` | **TESTED** — unchanged |
| Storage schema version | **TESTED** — still 1; no migration needed for this release |

**Nothing was renamed, moved or reshaped in phase 23.**

---

## Numeric regression — **TESTED, UNCHANGED**

`tests/regression.test.js` pins the figures that must never drift silently:

| Figure | Value |
|---|---:|
| BMR (Mifflin-St Jeor, reference subject) | 1638 kcal |
| TDEE (moderate activity) | 2539 kcal |
| Calorie target (bulk) | 2844 kcal |
| Protein target | 116 g |
| Set volume (4 × 6 × 60 kg) | 1440 kg |
| Default rest | 90 s |

All unchanged in phase 23. No figure was adjusted to make a test pass.

---

## Data integrity — **TESTED**

Twelve regression users, each driven through planner, workout, running,
nutrition, meals, reports, analytics, insights, dashboard, coach and reporting.
No crashes.

| User | Shape | Result |
|---|---|---|
| A | Beginner + bulk | **TESTED** |
| B | Intermediate + cut | **TESTED** |
| C | Advanced + maintain | **TESTED** |
| D | Recomp | **TESTED** |
| E | No history | **TESTED** — missing figures null, not zero |
| F | High fatigue | **TESTED** |
| G | Movement restriction on file | **TESTED** — coach raises it |
| H | Two-week layoff | **TESTED** |
| I | Sustained improvement | **TESTED** |
| J | Sustained decline | **TESTED** |
| K | Missing settings entirely | **TESTED** |
| L | Corrupted records already in storage | **TESTED** — invalid date and future date survive reading |

Plus a week with each of workouts, runs, nutrition and weigh-ins missing in turn.

---

## Known limitations

Carried forward from earlier phases and re-verified as still accurate.

**Data and measurement**
- Engines only see what is logged. An unlogged day is not a fasted day, and no
  engine treats it as one.
- **Fibre and sodium are never logged.** The nutrition plan sets targets for
  both; the model has no field for either, so the report's `avgFibreG` and
  `avgSodiumMg` are always null and say why.
- **Sleep is a setting, not a measurement.** It cannot vary within a week, so
  the recovery summary reports a habit rather than seven nights.
- Food prices are estimates (`priceConfidence: 'estimate'`).
- **An unlogged week enters a trend as a zero, not as a gap.** The reports
  engine cannot tell a rest week from an unlogged one. `risk.layoff` names the
  gap so the resulting slope is not read as a measured collapse.

**Modelling**
- The meal planner is a greedy heuristic (~90% macro accuracy, reported).
- The volume audit reports muscle shortfalls but does not auto-correct.
- Free-text injuries change nothing; only `restrictedMovements` and
  `excludedExercises` do.
- Equipment is assumed to be a standard gym unless stated.
- A monthly report inherits every gap in its weeks.
- Analytics windows are counted back from the current week, not from a calendar
  boundary. `quarter()` is the last thirteen weeks, not Q3.
- **The flat bands in `ANALYTICS.FLAT_BAND` are coaching conventions**, not
  measured thresholds.
- **The coach is rule-based and is not intelligent.** Fifty conditionals over
  other engines' output. It cannot notice anything no rule was written for.
- Coach suppression is a judgement about wording, not a fact about data.

**Reporting**
- There is no PDF library. Real files come from the browser's print dialogue,
  so PDF export does not work headlessly.
- A printed chart is a table of its own values. A printed page has no canvas.
- Charts truncate rather than downsample beyond 400 points, because averaging
  would invent readings nobody took.

**Operational**
- A yearly analysis is expensive on its first call: 52 report builds against a
  memo holding `CACHE.MAX_ENTRIES`. The analysis itself is cached, so this is
  paid once per invalidation.
- A produced `WeeklyReport` cannot be fed back into `history.reports`: the
  engine's output carries `range.start`, the stored model carries `weekStart`.
  Production passes stored records, so this affects fixtures only.
- Rollback is best-effort, not transactional. localStorage offers no
  transaction; the previous state is held in memory and written back.

---

## Known exceptions

Deliberate deviations, each with a reason and a test.

1. **`engines/constants.js` crosses layers.** Shared configuration in the wrong
   folder. Exempted in the architecture test, and the reporting layer is
   explicitly excluded from the exemption.
2. **`scripts/logger.js` crosses layers.** Cross-cutting infrastructure.
3. **`scripts/routes.js` imports pages.** It is the route table; that is its job.
4. **An import re-stamps `updatedAt`.** Pinned by a test in both directions.
5. **Nine exported symbols are currently unused**: `activeFormulas`,
   `shapeFor`, `RowGroup`, `parseSafely`, and the five `all*Rules` barrel
   helpers. All are public API surface consistent with siblings that *are*
   used, and are kept rather than deleted — phase 23 does not delete a file or
   an export merely because nothing calls it today.
6. **`app/reporting-service.js` has no caller.** Phase 22 built the document
   layer and deliberately added no page. It is named as an entry point in the
   dead-module audit rather than deleted.
7. **`ALL_REPOSITORIES` and `SECTIONS` are two lists in two layers.** The
   backup engine may not import repositories, so they are kept in sync by a
   test rather than by construction.
8. **Arabic carries 65 `food.*` keys English does not.** English falls back to
   each record's own name.
9. **The 88 tests skipped under Node need a DOM.** They pass under jsdom; the
   total of 1,381 includes them.

---

## Repository

| | |
|---|---:|
| Files | 296 |
| Lines | 52,975 (code) · 55,722 (with documentation) |
| Dependencies | **0** |
| Build step | **none** |
| Modules precached | 240 |
| Test files | 28 |
| Engines | 42 |
| Rule files | 65 (50 of them coaching rules) |
| Exercise records | 101 |
| Food records | 65 |
| Interface keys | 627 English · 692 Arabic |

---

## Storage schema

Prefix `foundation`. Fourteen keys, one per repository, unchanged since phase 3:

`profile` · `settings` · `goals` · `schedule` · `measurements` · `runs` ·
`workouts` · `nutrition` · `supplements` · `weekly-reports` · `sessions` ·
`notifications` · `plan-snapshots` · `onboarding`

**Schema version 1.** Migration chain: v0 (unstamped) → v1. Files written by
any earlier build of this app still restore.

---

## Release checklist

| Gate | Requirement | Status |
|---|---|---|
| **A** | All tests green | ✅ 1,381 passing, 0 failing |
| **B** | Architecture audit green | ✅ 14 checks, 0 breaches |
| **C** | Security audit green | ✅ 10 checks |
| **D** | Backup round trip green | ✅ 17 cases, one documented exception |
| **E** | Cross-engine integration green | ✅ 20-step round trip, results identical |
| **F** | Cache and event integrity green | ✅ 14 checks; reads emit nothing |
| **G** | i18n audit green | ✅ 6 checks, 0 missing keys |
| **H** | Accessibility green **or** limitation documented | ⚠️ **ENVIRONMENT LIMITED** — documented above |
| **I** | Performance green **or** regression documented | ⚠️ **MEASURED in Node**; browser figures not re-measured |
| **J** | Public API compatibility green | ✅ 8 checks, nothing moved |
| **K** | Documentation complete | ✅ `PROJECT_STATE.md`, `REPORT.md`, this manifest |
| **L** | Git working tree clean | ✅ see below |

**Gates H and I are amber, not green, and are not being presented as green.**
Neither is a defect: both are the absence of a tool. No browser and no device
were available at any point in this project's construction, and every
browser-dependent claim in this document is marked accordingly.

---

## Git

The project has been delivered as archives throughout its construction, so
there is no commit history before this release. Phase 23 initialises a
repository and makes one commit containing the finished project, which is
honest about what it is rather than a reconstruction of twenty-three phases
that were never committed.

- Repository initialised at phase 23
- One commit: the 2.3.0 release
- Working tree clean at commit time
- No debug files, generated artefacts, temporary fixtures or archives inside
  the project

---

## Production readiness

### PRODUCTION READY: YES — with two stated conditions

Everything that can be verified in this environment is verified. There are no
known defects, no failing tests, no architecture breaches and no unexplained
warnings.

The two conditions are both about **verification**, not about the code:

1. **Accessibility has not been re-tested since phase 14.** Page markup has not
   changed since, so the phase-14 axe result of zero violations is probably
   still accurate — but "probably" is doing real work in that sentence. Run
   axe-core in a real browser before shipping to anyone who depends on assistive
   technology.

2. **Nothing has been run on a real device.** Install on the target iPhone,
   confirm the service worker registers, reload offline, and check the Arabic
   layout on a real screen. All three are expected to work and none has been
   observed working.

Neither condition blocks a release to its author, who is also its only user and
who can perform both checks in a few minutes. Both would block a release to
anyone else.

---

## 2.3.1 — timezone fix (production bug found on a real iPhone)

**Symptom.** Onboarding step 13 of 13 refused to finish: *"Start date is not a
real date."* The phone was in Morocco, UTC+1.

**Root cause.** A date string was parsed as **local** midnight —
`new Date(\`${value}T00:00:00\`)`, no `Z` — and then rendered back with
`toISOString()`, which is **UTC**. Two calendar frames in one round trip. East
of UTC, local midnight is the previous UTC day, so the validator's round-trip
check saw a different string and reported every real date as impossible. The
same mismatch shifted every date-arithmetic helper in the app by one day.

The exact failing value was the date the app itself supplied: `today()` returns
a *local* calendar date, and the validator then rejected it.

**Why no test caught it.** The container runs in UTC, where local and UTC
coincide. Under `TZ=Africa/Casablanca` the pre-fix suite scored **1,276 / 1,302**.

**The fix.** Parse in UTC wherever the result is rendered with `toISOString()`,
so both ends share a frame; and build the validator's "not in the future"
ceiling from local calendar parts, since the app's own `today()` is local.
`engines/plan-context.js` is deliberately untouched — it parses local and
renders through its own local-offset helper, and its `startOfWeek` depends on
`getDay()`, which is local. Both of its ends were already consistent.

**Scope.** 12 production files, 1 changed line each; 11 test files carrying the
same defect in their fixtures. No API, no storage key, no schema change —
schema stays at version 1, and no migration is needed.

**Proof.** The whole suite now passes in every timezone tried, from UTC−11 to
UTC+14: Pacific/Midway, America/New_York, UTC, Africa/Casablanca, Asia/Tokyo,
Pacific/Kiritimati — **1,302 / 1,302** in each. A source audit added to
`tests/release.test.js` fails if any shipped file parses in one frame and
renders in another again.

---

## 2.3.2 — every page 404'd on GitHub Pages

**Symptom.** Deployed at `https://adnanechaibi.github.io/fitness/`, every route
failed. The console reported `GET .../pages/_page.js 404`,
`[router] could not load "profile"`,
`Failed to fetch dynamically imported module: .../pages/profile.js`, and
`Failed to execute 'addAll' on 'Cache': Request failed`.

**Root cause.** **GitHub Pages runs Jekyll by default, and Jekyll excludes
every file whose name begins with an underscore.** Two shipped files start with
one — `pages/_page.js` and `pages/_live.js` — so neither was ever published.

`pages/_page.js` holds the shared page shell that all eleven pages import, so
one unpublished dependency broke every route at once. `cache.addAll` is atomic,
so the same two URLs also failed the entire service worker install.

**What was *not* the cause.** The base path was correct throughout:
`https://adnanechaibi.github.io/fitness/pages/profile.js` returns **200** and is
served as JavaScript. The browser names the *entry* module in
"failed to fetch dynamically imported module" when one of its **dependencies**
fails, which is what made a dependency problem look like a routing problem. The
router's relative `import('../pages/x.js')` resolves against the module URL and
works under any base path; nothing in the app uses a root-relative URL.

**The fix.** One empty file, `.nojekyll`, at the repository root. **No
application code changed.**

**Recovery for anyone with the broken version installed** is automatic. The
failed install meant that service worker version never activated, so no bad
cache was ever written. With the files published, install succeeds, and the
existing lifecycle — `skipWaiting`, `clients.claim`, and deleting every
`foundation-shell-*` cache that is not the current one — takes over. The cache
version is bumped to `v2.3.2` to force it.

**Tests added:** eight, in `tests/release.test.js`. They check the publication
contract rather than the filesystem, because a local run cannot see this bug —
the files are present on disk and read fine. Removing `.nojekyll` fails the
suite, which is how the regression test was verified.

**Known limitation:** the deployed site has not been re-fetched since the fix,
because the fix has not been pushed yet. What is verified is that `profile.js`
returns 200 and `_page.js` returns 404 on the live site — the two observations
that identify the cause.

---

## 2.3.3 — the underscore files renamed, so Jekyll can never drop them again

**Symptom on the live site.** Onboarding completed and showed "Profile saved.",
but the app stayed on the same screen; after a reload the Dashboard header and
the bottom navigation appeared and the page body was **empty**.

**Why it looked like two different bugs and was one.** `pages/onboarding.js` is
the only page that does *not* import the shared page shell, which is why it
rendered perfectly while every other page rendered nothing. The shell —
formerly `pages/_page.js` — was returning 404 on GitHub Pages, so:

- Finish saved the profile, navigated to the dashboard, and the dashboard's
  module failed to load, leaving the outlet empty;
- after a reload the app shell still rendered, because `index.html`,
  `script.js` and the router load fine — only the *page* module fails.

**Root cause.** The same one as 2.3.2: GitHub Pages runs Jekyll, and Jekyll
excludes files whose names begin with an underscore. Verified on the live site
— `pages/_page.js` still returns 404.

**Why 2.3.2 was not enough.** 2.3.2 added `.nojekyll`, which is the canonical
fix, but a dot-file is easy to lose when a project is copied, zipped, or
uploaded through a web UI — and losing it takes every page down at once. So the
two files were renamed as well:

    pages/_page.js  →  pages/page-frame.js
    pages/_live.js  →  pages/live-region.js

`.nojekyll` is kept. The deployment now works whether or not it survives.

**Scope.** Two files renamed, 11 importers updated, the precache manifest and
the test manifest updated. **No behaviour, no API, no schema change** — the
exports and their signatures are identical, and the storage schema stays at
version 1. The regression test now asserts that no shipped file starts with an
underscore at all, rather than listing the ones that do.
