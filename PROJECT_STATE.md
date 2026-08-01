# PROJECT_STATE.md

**The single source of truth for this project's current state.**
Read this first in any new conversation. Version 2.3.3 · 23 phases complete — RELEASED.
See RELEASE_MANIFEST.md for the gate-by-gate release record.

---

## 1. Summary

`Foundation` — a personal training and nutrition tracker. An installable PWA.
No frameworks, no dependencies, no build step, no server, no network calls.
All calculation happens on the device; all data stays in `localStorage`.

- **Stack:** HTML5, CSS3, JavaScript ES modules only.
- **Target:** iPhone 14 Pro Max first, responsive to desktop.
- **Owner context:** 28y male, 186 cm, 61→74 kg lean bulk, Morocco, budget
  ~1200 MAD/month, trains 4 days, also runs, wants rounded-shoulder correction.

## 2. Final goal

A platform where every number is traceable to a cited formula and every
decision carries its own reason as **data**, so later layers (reports, PDF,
coaching) consume those objects instead of re-deriving logic.

## 3. Phases completed (1–23)

| # | Phase | Delivered |
|---|---|---|
| 1 | App shell | PWA shell, design tokens, storage engine, offline |
| 2 | SPA | pushState router, page modules, components, theme manager |
| 3 | Data layer | models, validators, repositories, events, wizard, backup |
| 4 | Calculation engines | formula registry, energy/body/strength/running, adjustment |
| 5 | Planner engine | rule-based `WeeklyPlan` |
| 6 | Databases | 101 exercise records, 65 food records, taxonomy, i18n |
| 7 | Workout engine | `WorkoutWeek` from patterns, progressive overload |
| 8 | Execution engine | session state machine, PR detection, failure detection |
| 9 | Running engine | `RunningWeek`, progress metrics, run execution |
| 10 | Nutrition core | `NutritionWeek`, targets only, safety floors |
| 11 | Meal planning | `MealPlanWeek` from FoodDB, budget aware |
| 12 | Application layer | orchestration, queries, notifications, cache |
| 13 | UI layer | 9 pages, forms, live updates |
| 14 | Hardening | audit, logging layer, performance, security, report |
| 15 | i18n | language manager, 394 interface keys × 2 languages, RTL |
| 16 | Reports engine | `WeeklyReport` / `MonthlyReport`, adherence, achievements, warnings, evidence-backed recommendations, an explanation per figure |
| 17 | Insights engine | `Insight`, `WeeklyInsights` / `MonthlyInsights`, ranking, duplicate merging |
| 23 | Final production hardening | Whole-app audits: security, backup round trip, cross-engine integration, cache and event integrity, twelve-user regression dataset, dependency graph, public API compatibility. `RELEASE_MANIFEST.md`. |
| 22 | PDF & Charts (reporting layer) | `ReportDocument`, weekly/monthly/progress documents, generic charts engine, print renderer, `PdfRenderer` abstraction; a new layer that may import nothing that produces a figure |
| 21 | Coach engine | `CoachAdvice`, `CoachSession` — 50 rule-based coaching rules across ten categories, ranked, merged, suppressed; no LLM, no API |
| 20 | Import / Export & Backup engine | `BackupSnapshot`, full and partial export, merge/replace/dry-run/validate-only import, eleven validation checks, independent migrations, rollback |
| 19 | Analytics engine | `AnalyticsSummary` — twelve trends over a window of weekly reports; plateau, improvement, regression and risk detection; `weekly/monthly/quarterly/yearly/range` |
| 18 | Dashboard engine | `DashboardSnapshot` — today, week, health, goal, insight and notification summaries in one object; an explanation per figure; business logic moved out of the application layer |

## 3b. What phases 16 and 17 added

**Reports engine (16).** `ReportsEngine.weekly(input)` produces a
`WeeklyReport`: weight, gym, running, nutrition, meal and recovery summaries,
adherence, training load, progress against the week before, achievements,
warnings, recommendations, and `explanations` — one entry per figure holding
the value, the inputs, the method in words and the engine that owns it.
`report.explain('adherence.overall')` answers "why 82%?". `monthly()` sums
analysed weeks and fits trends. It calculates nothing itself: tonnage comes
from the strength engine, pace and load from the running engines, the weight
trend from the body engine, session verdicts from the execution engine.

**Insights engine (17).** `InsightsEngine.weekly({ report })` reads one report
and produces ranked `Insight` records — id, category, severity, priority,
title, summary, reason, evidence, confidence, source engine, date, related
data. Rules append drafts; `createInsight` refuses any without evidence;
duplicates sharing a key are merged, the survivor keeping the stronger
explanation and the louder severity; the survivors are ranked by priority,
then severity, then confidence, then date, and grouped into positive, neutral
and warning, with the top of the ranking as the priority set. `monthly()`
picks the best achievement, the biggest problem, the biggest improvement, the
long-term trend and a count of what was already recommended.

## 3c. What phase 18 added

**Dashboard engine (18).** `DashboardEngine.snapshot(input)` produces a
`DashboardSnapshot`: `today` (what is planned, what time it asks for, what is
left to eat, what matters most), `week` (training, running, nutrition and meal
completion, load, weight change, goal progress, streak), `health` (recovery,
fatigue, sleep and water targets, a risk level), `goal` (expected rate against
measured rate, and an arrival date when one can be justified), `insights` (the
top of the insights engine's own ranking) and `notifications`. It measures
nothing: every figure is carried from the engine that produced it, and its
explanation is carried with it — `snapshot.explain('week.weightRateKgPerWeek')`
still names the body engine, not this one.

Five arithmetic operations happen here and no more, each recorded with both
operands: target minus logged (calories, protein), the day's minutes added up,
goal weight minus current weight, and remaining kilograms over the measured
rate. That last one is refused rather than guessed when there is no goal, no
fitted rate, a rate below `DASHBOARD.MIN_RATE_FOR_ETA_KG`, or a rate pointing
away from the goal.

Three judgements are rules, in `rules/dashboard/`: `focus` (one wins — what
matters most today), `risk` (one wins — the health summary's label) and
`notification` (all matching run). A notification without a title, a message,
a severity, a reason **and** evidence is dropped and the drop is counted, the
same stance phases 16 and 17 took for recommendations and insights.

**What moved.** `app/dashboard-service.js` had been subtracting logged intake
from the day's target and ordering today's list itself — two pieces of domain
logic sitting above the engine layer. Both are now in the engine. The service
gathers, guards each read so one failing source degrades the snapshot instead
of emptying it, hands plain data down, and caches the result. Its public API
did not change; `Queries.getToday()` and `pages/dashboard.js` were not touched.

## 3d. What phase 19 added

**Analytics engine (19).** The reports engine describes a week, the insights
engine says what stood out in one, the dashboard assembles today. None can see
a quarter, because none is ever given one. `AnalyticsEngine` is given the
weeks: `weekly()`, `monthly()`, `quarterly()`, `yearly()` and `range(from, to)`
each clip a window out of a list of `WeeklyReport`s and analyse it.

It fits twelve least-squares lines — body weight, tonnage, estimated one-rep
max, distance, pace, running load, calories, protein, strain, sleep, adherence
and logging coverage — through figures the reports already hold, then labels
each slope against a flat band in constants and the metric's own definition of
*better*. A slope inside the band is flat whichever way it points; outside it,
`better: 'up'`, `'down'`, `'goal'` or nothing at all decides whether the
movement is improvement, decline, or simply movement. Nobody improves at
eating 2,800 calories, so calories have no direction.

Three rule sets read those trends: **plateau** (a figure that stopped moving
where movement was the point), **progress** (improvement needs
`MIN_AGREEING_SIGNALS` independent measures agreeing; regression does not —
the asymmetry is deliberate) and **risk** (shapes across weeks no single week
can see: a layoff, load climbing while recovery falls, adherence slipping
before the results do). A finding without evidence is refused and counted.

**`engines/trend.js`.** `trendOf`, `meanOf` and `totalOf` were private to the
reports engine. Analytics needed exactly them, so they were extracted rather
than copied — a quarter and the months inside it now cannot disagree about a
slope, because both call the same function. The reports engine's output is
byte-identical after the move.

## 3e. What phase 20 added

**Backup engine (20).** Four files, and the split between them is the whole
design. `backup-schema.js` declares the sections — which model owns each, what
group it belongs to for a partial export, where its cross-references live.
`backup-validation.js` runs eleven checks. `backup-migration.js` holds the
one-step-at-a-time chain. `backup-engine.js` builds a `BackupSnapshot` on the
way out, and on the way in produces an **ImportPlan** — what *would* be
written, what would be skipped, and every finding behind those decisions.

The engine writes nothing. `services/backup-service.js` takes a plan and
executes it through repositories, which is what makes dry-run possible at all:
"what would this import do" is the same code path, stopped one step earlier.

**Nothing is half-imported.** The order is: parse → read current state → plan
(pure) → refuse if unsound → snapshot every section the plan would touch →
apply → verify each section landed → restore the snapshot on any failure. The
verification matters as much as the try/catch: `replaceAll` returns a count
rather than throwing when storage refuses a row, so a silent partial write is
caught by counting, not by catching.

**No validation rule was written.** Every question about whether a record is
well-formed is asked of the model that owns it, through `model.isValid()` —
the same schema a repository would have run. What the backup layer adds is the
questions a schema cannot answer: is this a Foundation file, can this build
read its version, do two records share an id, does it point at an exercise
that no longer exists.

**Severity is the design.** An error stops a section; a warning does not. A
session naming an exercise since removed from the database is still a session
that happened, and refusing it to protect a foreign key would lose the more
valuable of the two.

**`APP.build`** was added: version and schema version together, derived from
both so it cannot drift, stamped into every file.

## 3f. What phase 21 added

**Coach engine (21).** Twenty phases produced a description; none of them said
what to *do*. `CoachEngine.session()` reads the conclusions of eight engines —
dashboard, reports, insights, analytics, recovery, plus the profile, settings
and goals — and produces `CoachAdvice` records grouped into a `CoachSession`.

**It contains no model.** No API, no LLM, no network. Fifty rules across ten
categories (training, running, nutrition, recovery, weight, consistency, goal,
motivation, health, planning), each naming a recommendation with its reasoning,
its evidence, the engines behind it and a confidence level. Every sentence
traces to a threshold in constants.js and a figure some named engine measured.
Nothing is generated.

**Selection, ranking, merging, suppression.** Every rule runs — a week can
need less volume *and* more food *and* more sleep at once. `createAdvice`
refuses any draft missing evidence, a recommendation, its reasoning or its
engines, and counts the refusal. What survives is ranked (priority → severity →
confidence → evidence → key), then merged by key, then **suppressed**: advice a
stronger piece already implies is dropped through the table in
`rules/coach/index.js`, because "do not train today" plus "take the volume
down" reads as a machine repeating itself. Suppression runs after ranking, so
the survivor is the more important one. Then `MAX_DAILY` / `MAX_WEEKLY` trim.

**Confidence is never chosen by a rule.** The context computes the weakest of
the report's coverage and the analytics window's; a rule may cap it lower and
cannot raise it.

**Safety.** No rule names a condition, offers a cause or interprets a symptom.
The strongest thing the health rules say is that a pattern is worth showing to
someone qualified. When the inputs are too thin, `health.not-enough-data`
outranks nearly everything and suppresses the reassuring advice that would
otherwise appear.

**`engines/ranked-record.js`.** The refuse-without-evidence guard, the
comparator and the deduplicator were private to `insight.js`. The coach needed
the same three, so they were extracted and parameterised rather than copied —
two records in this app cannot now disagree about which of them is stronger.
`insight.js` behaves identically after the move.

## 3g. What phase 22 added

**The reporting layer (22).** A new top-level `reporting/` directory, six
files, and one structural guarantee: **it may import nothing that could
produce a figure.** Not engines, not rules, not models, not repositories, not
services — not even `engines/constants.js`, which every other layer reads under
a documented exemption. Its caps live in `reporting/constants.js` so that
exemption never has to be argued about. Six checks in
`tests/architecture.test.js` enforce this against the precache manifest.

**It imports nothing from `app/` either.** The document builders are pure
functions of their arguments; `app/reporting-service.js` gathers the weekly
report, the insight set, the analytics summary and the coaching session and
calls down. That keeps the dependency one-directional — no cycle — and is why
every phase-22 test builds documents without storage, a plan or a cache.

**`ReportDocument`** is the single thing every renderer accepts: a title, a
period, sections, and the provenance of every figure. `fromExplanation` reads a
value *and* its reason *and* its source out of the producing engine's own
explanation map, so the common case cannot be got wrong. A field with no source
is allowed and **counted** (`metadata.unsourcedFields`).

**Three documents:** weekly (from `WeeklyReport` + insights + coach +
dashboard), monthly (from `MonthlyReport` + `AnalyticsSummary`), progress (from
`AnalyticsSummary` alone).

**The charts engine knows nothing about fitness.** Labels, numbers, a unit.
Five shapes. It never interpolates, averages, extrapolates or downsamples — a
gap stays a gap, and a series over the point cap is truncated with a note
rather than averaged, because the mean of five readings is a sixth number
nobody took. NaN and Infinity are counted separately from null, since one means
"never recorded" and the other means "a calculation went wrong upstream".

**Two PDF renderers, and an honest claim.** There is no PDF library and none
was added. `BrowserPrintPdfRenderer` produces print-ready HTML and hands it to
the browser's own print-to-PDF, which is what shapes the Arabic.
`StructuralPdfRenderer` produces no glyphs at all — it returns the pages,
fields, explanations, warnings and recommendations a PDF would contain, which
is what the tests assert against. **RTL PDF correctness is not claimed**: the
structural renderer proves the content arrives, the browser is trusted for the
glyphs, and neither is the same as having seen it on paper.

**Localisation.** 150 new keys in both languages, and a test that fails on any
renderer label missing from either. The translator is **injected** — no
renderer imports the language manager — which is how Arabic and English output
are tested without booting the app, and why an audit can assert that no file in
the layer contains a literal sentence. Sentences an *engine* wrote (a warning's
message, a coach's reasoning) are carried **verbatim and untranslated**: they
contain figures the engine composed, and re-wording them would be this layer
making a claim.

**Privacy.** Every value passes a blocklist scrub on the way *in*, so no
renderer is the last line of defence. Record ids, timestamps, tokens and
anything matching an email or phone pattern are removed and the removal is
recorded in `metadata.withheld`.

## 3h. What phase 23 added

**No feature, no engine, no page, no abstraction.** Phase 23 added one test
file, six graph audits, one document, and a version bump. Everything else it
did was verification.

**`tests/release.test.js`** (71 tests) asks the questions that only matter at
the end, across the whole app rather than inside one engine:

- **Security** — prototype pollution through an imported backup, thirteen
  malformed envelope shapes, duplicate ids, and the absence of `eval`,
  `new Function` and `innerHTML` in all 240 shipped modules.
- **Backup** — seventeen cases, including a full export → clear → import →
  compare that asserts the restored store is identical.
- **Cross-engine integration** — one user through all fourteen layers, then
  through a restore, with the report, insights, analytics, coaching, dashboard
  and document compared on both sides and found identical.
- **Cache and event integrity** — every cache read twice, invalidated by name,
  and checked for cross-invalidation; and the rule that matters most, **a read
  emits no event**, asserted warm and cold.
- **Twelve regression users** — A through L, each driven through every engine.
- **Explainability** — every producer checked for reason, evidence, source and
  confidence.
- **i18n** — no missing key, no orphan, no placeholder mismatch, no raw key
  reaching a user, and no figure changed by a language switch.
- **Public API** — every service method, storage key, event name and legacy
  goal asserted present and unchanged.

**Six graph audits** in `tests/architecture.test.js`: no circular import
anywhere in the app, no module nothing imports, no duplicate ownership, and a
**formula check** that greps `app/` for the Mifflin-St Jeor equation, macro
energy densities, a pace conversion, an acute:chronic ratio and a 1RM estimate —
the fingerprints left when someone reimplements an engine one layer up.

**One documented behaviour was discovered:** an import re-stamps `updatedAt`,
because `replaceAll` writes through the model. The data survives a round trip
byte-identically; the write metadata does not. Both halves are now pinned.

## 4. Architecture (enforced, not described)

```
pages/ + components/     presentation only
        ↓ App.query · App.actions · App.forms
app/                     orchestration, no business logic
        ↓ (reporting only, one way)
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

`tests/architecture.test.js` reads the service worker's own precache manifest
and **fails** on any layer violation, UI reaching past `app/`, an engine
touching storage, a direct `console` call, or `innerHTML`/`eval`/`new Function`.

Translation crosses no boundary: the UI reads it, and `scripts/` may not
import `data/`, so `script.js` hands the label files to the language manager
at boot. Nothing below the UI knows a language exists.

## 5. File structure

```
index.html  style.css  script.js  manifest.json  service-worker.js  package.json
README.md  REPORT.md  PROJECT_STATE.md
styles/     tokens, themes, base, layout, components, transitions
scripts/    config, logger, safe-json, storage, dom, router, routes, theme,
            language, pwa
data/       taxonomy, exercise-schema, food-schema, exercises/, foods/, i18n/
models/     15 files
validators/ rules, schema, errors, index
repositories/ 15 files
events/     event-bus, events, index
engines/    42 files
reporting/  6 files: constants, report-document, charts-engine, documents,
            renderers, index
rules/      rule.js + planner rules + workout/ execution/ running/ nutrition/
            meals/ reports/ insights/ dashboard/ analytics/ coach/
services/   15 files
app/        17 files
components/ 16 files
pages/      13 files
tests/      28 test files + runner, index, run-node, shell-files
assets/     icons/, images/, exercises/README.md
```

## 6. Engines (`engines/`, all pure)

| Engine | Produces |
|---|---|
| `calculation-engine` | arithmetic only, no domain knowledge |
| `formula` | `defineFormula`, `createSlot` — replaceability |
| `energy-engine` | BMR, TDEE, macro targets |
| `body-engine` | BMI, body fat, weight trend |
| `strength-engine` | volume, 1RM |
| `running-engine` | pace, speed, MET energy |
| `adjustment-engine` | explainable calorie adjustment |
| `planner-engine` + `plan-context` | `WeeklyPlan` |
| `workout-engine` + `workout-context` | `WorkoutWeek` |
| `execution-engine` + `session-state` | `WorkoutSession` |
| `running-program-engine` + `running-context` | `RunningWeek` |
| `running-progress-engine` | pace/distance/consistency/load metrics |
| `running-execution-engine` | `RunningExecution` |
| `nutrition-engine` + `nutrition-context` | `NutritionWeek` |
| `meal-planning-engine` + `meal-context` | `MealPlanWeek` |
| `reports-engine` + `report-context` + `report-metrics` + `report-explain` | `WeeklyReport`, `MonthlyReport` |
| `insights-engine` + `insight` | `WeeklyInsights`, `MonthlyInsights` |
| `dashboard-engine` + `dashboard-context` | `DashboardSnapshot` |
| `analytics-engine` + `analytics-context` + `trend` | `AnalyticsSummary` |
| `backup-engine` + `backup-schema` + `backup-validation` + `backup-migration` | `BackupSnapshot`, `ImportPlan` |
| `coach-engine` + `coach-context` + `coach-advice` + `ranked-record` | `CoachAdvice`, `CoachSession` |

**Swappable slots:** `bmr`, `tdee`, `bmi`, `body-fat`, `weight-trend`,
`volume`, `one-rep-max`, `pace`, `run-energy`, `calorie-adjustment`,
`weekly-planner`, `workout-engine`, `execution-engine`, `running-engine`,
`run-execution`, `nutrition-engine`, `meal-planner`.

## 7. Services (`services/`)

`planner-service` · `workout-plan-service` · `running-program-service` ·
`nutrition-plan-service` · `meal-plan-service` · `execution-service` ·
`weight-service` · `calories-service` · `workout-service` · `running-service` ·
`nutrition-service` · `adjustment-service` · `backup-service` · `reactions`

Each caches its output via `cached()` and invalidates on bus events.

## 8. Databases (`data/`)

- **ExerciseDB** — 101 records: strength, running, mobility, stretch,
  corrective, warmup, cooldown, activation, recovery.
  Query by `movement`, `category`, `muscles`, `equipment`, `maxDifficulty`,
  `tags`. `equipment` = all required; `equipmentAny` = one suffices.
- **FoodDB** — 65 records, Moroccan availability, MAD price estimates.
  Query by group, mealType, budget, cooking time, diet. `portion()`,
  `proteinValue()`, `priceReliability()`.
- **taxonomy.js** — the vocabulary engines query in. Machine keys only.
- **i18n/** — en + ar label maps: taxonomy, 65 food names and 394 interface
  keys. Wired to the UI in phase 15; see section 9.

## 9. Language layer

`scripts/language.js` — the Language Manager, built like `theme.js`. It holds
no dictionary: the architecture forbids `scripts/` from importing `data/`, so
`script.js` calls `language.install(i18n).init()` before the shell is built.

- `T(key, vars, fallback)` marks text. `el()` writes the translation and
  stamps `data-i18n`, so the node can be rewritten later.
- `language.set(code)` persists to Settings, sets `<html lang dir>`, sweeps
  every stamped node and notifies subscribers. **Nothing is re-rendered.**
- `TName(prefix, id, name)` for records — a food's Arabic label, or the
  record's own name where a language has none.
- `TJoin(prefix, ids)` for lists, read lazily so they follow the sentence.
- A key nothing defines shows itself and is warned about once. A record with
  no label falls back to its name and is not warned about.

`data/i18n/` gained `has()`, `direction()` and `keysOf()`; nothing was
rewritten. **394 interface keys, identical in `en` and `ar`.**

## 10. Application layer (`app/`)

`PlanningService` (7-step pipeline) · `DashboardService` · `ProgressService` ·
`RecoveryService` · `ReportService` · `InsightsService` · `SyncService` ·
`NotificationEngine` · `Cache` (named registry) · `Queries` · `Actions` ·
`Forms` · `wiring`

`ReportService.analyze(weekStart)` gathers storage and hands it to the reports
engine; `.month(month)` aggregates the analysed weeks; `.explain(key)` takes
one figure apart. `InsightsService.week()` / `.month()` read those reports and
nothing else — an insight that disagreed with its own report would be a bug,
and giving the engine a second path to the data is what would allow it.

Entry point: `App.start()`, `App.query.*`, `App.actions.*`, `App.forms.*`.

## 11. UI layer

Pages: `dashboard` `gym` `running` `nutrition` `meals` `progress` `calendar`
`profile` `settings` `onboarding` `not-found`.
Components: Card, Button, Modal, Field, Choice, Form, ListRow/ListGroup,
ReasonList, ProgressBar, ProgressRing, StatCard, Header, BottomNavigation,
Skeleton/EmptyState/ErrorState/OfflineNotice, toast.
Live updates: `pages/_live.js` subscribes in `mount()`, tears down in
`unmount()`.

## 12. Key architectural decisions

1. **The generation order is mandatory:** Planner → Workout → Running →
   Nutrition → Meals → storage → events. Out of order it silently uses stale data.
2. **Reasons are data**, not display strings. A rule that decides without a
   message is **dropped, not applied**.
3. **Only repositories import `scripts/storage.js`.**
4. **Rules over branches** — `defineRule({ when, apply })`, `selectOne` /
   `applyAll`. No large conditionals anywhere.
5. **Reading never emits an event.** Emitting from a getter caused cache thrash
   (fixed in phase 14).
6. **Rotation cuts both ways:** main lifts prefer continuity (so overload has a
   baseline), accessories prefer variation.
7. **Failed sets are excluded** from what progression reads.
8. **Router uses hash URLs** via `pushState` (`ROUTER_MODE = 'hash'`) so a
   refresh never 404s on static hosting. Switch to `'history'` only with a
   server that rewrites to `index.html`.
9. **No web fonts, no external libraries, no media URLs** (copyright).
10. **The app layer boots after first paint** (dynamic `import('./app/index.js')`).
11. **Language is applied before the shell is built.** The label files sit on
    the critical path on purpose: 4 modules, 19.5 KB gzipped, against a shell
    that would otherwise flash English and then flip to Arabic.
12. **A key is data, a label is presentation.** The application layer names a
    label and supplies the numbers; the page turns that into a sentence.
    Engines, services and repositories know nothing about languages.
13. **A report gathers, an engine decides.** `app/report-service.js` reads
    storage and passes plain data down; `engines/reports-engine.js` holds no
    storage access at all. For a week that has passed the *stored plan
    snapshot* is used, never a regenerated plan: rebuilding an old week from
    today's profile would invent a plan nobody followed and then measure
    adherence against it.
14. **No advice, and no observation, without evidence.** A recommendation
    missing its reason, evidence, confidence or source engine is dropped
    before the report is returned; an insight missing any of those is never
    created. Both drops are counted in `meta`, never silent.
15. **Insights read reports, not records.** The insights engine's entire
    input is a `WeeklyReport`. It recomputes nothing — no BMR, TDEE, pace,
    calories, progress, load or recovery — and if a figure is not in the
    report, it does not have it.
23. **The reporting layer cannot calculate, by construction.** It imports
    nothing that could produce a figure — enforced by six architecture checks,
    not by discipline. Its own constants file exists so that the
    `engines/constants.js` exemption never applies to it.
24. **A label is a key; a sentence an engine wrote is verbatim.** Renderers
    translate what they own and carry what they do not.
21. **The coach advises; it never measures.** Every figure it reasons from
    was produced by a named engine, and its confidence is the weakest of its
    inputs — capped by the context, not chosen by a rule.
22. **No advice without evidence, a recommendation and its reasoning.**
    Enforced in `createAdvice`, not trusted to fifty rule files. Refusals are
    counted.
19. **An import decides before it writes.** The engine produces a plan; the
    service executes it. Nothing is written until the whole plan is known to
    be sound, and the previous state is held in memory until the last section
    has landed.
20. **The backup layer owns no validation.** It asks each model. The eleven
    checks it does own are all about the file, never about a record's values.
17. **A trend has one definition.** `engines/trend.js` is the only place a
    slope through weekly reports is fitted. Any engine wanting one imports
    it; none rolls its own, so no two windows over the same weeks can
    disagree.
18. **Improvement needs agreement; decline does not.** Two independent
    measures must move together before the analytics engine calls it
    progress, while one falling measure is named on its own. Missing a
    regression costs more than naming a fortnight that turns out to be noise.
16. **The dashboard aggregates and does not compute.** Every figure in a
    `DashboardSnapshot` is carried from the engine that produced it, with
    that engine's own explanation attached. Where the dashboard does
    arithmetic at all it is over two numbers that already existed, and both
    operands are in `inputs`. A projection it cannot justify — no goal, no
    fitted rate, a rate near zero, a rate pointing the wrong way — is
    refused with a reason rather than produced.
17. **Text changes in place.** `data-i18n` marks the node, a WeakMap holds the
    key and its variables. Re-rendering to change language would rebuild 886
    nodes to alter 236 strings.

## 13. Known limitations

- **101 exercise names carry no Arabic label.** The mechanism is wired; the
  content is not written. They fall back to their English names.
- **Engine text stays English**: reasons, `workout.goal`, `recovery.status`,
  `plan.phase`, food units, the `alternatives` id lists. Reasons are data,
  not display strings — translating them would move wording into storage.
- **Validation messages stay English.** They are built from the model's own
  labels, and a test pins one of them.
- **Field errors are not re-translated live.** They are written straight to
  `textContent` and disappear on the next keystroke.
- **Switching language invalidates three snapshot caches**, because it writes
  to Settings. Switching theme has always done the same. The sweep itself
  rebuilds nothing.
- Food prices are estimates (`priceConfidence: 'estimate'`).
- Meal planner is a greedy heuristic (~90% macro accuracy, reported).
- Volume audit reports muscle shortfalls but does not auto-correct.
- Free-text injuries change nothing; only `restrictedMovements` /
  `excludedExercises` do.
- Equipment is assumed (standard gym) unless set.
- Engines only see what is logged.
- **Fibre and sodium are never logged.** The nutrition plan sets targets for
  both; `models/nutrition.js` has no field for either, so the report's
  `avgFibreG` and `avgSodiumMg` are always null and say why.
- **Sleep is a setting, not a measurement.** It cannot vary within a week, so
  the recovery summary reports a habit rather than seven nights.
- **A monthly report inherits every gap in its weeks.** It sums analysed
  weeks and re-derives nothing.
- Insight titles and summaries are English sentences held as data, like every
  other engine string. Translating them would move wording into storage.
- **RTL PDF output is not verified.** The structural renderer proves the
  content reaches the document; the browser's print pipeline is trusted for
  glyphs and shaping. Nothing in this project has produced a PDF or seen one on
  paper. `DIRECTION_SUPPORT` states this rather than claiming otherwise.
- **There is no PDF library.** Real files come from the browser's print
  dialogue. That is a deliberate refusal to add a dependency, and it means PDF
  export does not work headlessly.
- **A printed chart is a table of its own values.** A printed page has no
  canvas, and drawing a picture would lose every number. The screen can draw
  the same payload; nothing in this phase does.
- **Arabic reports have English findings.** Warnings, insights and coaching
  sentences are carried as their engines wrote them. Translating them would
  mean re-composing claims, including the figures inside them.
- **The Arabic dictionary has 65 keys English does not** — all `food.*`. That is
  by design: English falls back to each record's own `name`. Verified during
  phase 22, not a defect.
- **The coach is rule-based and is not intelligent.** Fifty conditionals over
  other engines' output. It cannot notice anything no rule was written for, and
  it has no idea what it is not looking at.
- **Suppression is a judgement about wording, not a fact about data.** The
  table in `rules/coach/index.js` was decided entry by entry; it is not
  derived and it is not transitive.
- **A produced `WeeklyReport` cannot be fed back into `history.reports`.** The
  engine's output carries `range.start`; the stored model carries `weekStart`,
  and the filter reads the latter. Production is fine — it passes stored
  records — but four tests in phase 21 quietly asserted nothing until the
  fixture converted between them.
- **A newer file cannot be imported at all.** There is no honest way to guess
  what a field a future build added means, so the envelope check refuses it
  rather than importing three-quarters and calling that success.
- **Derived analysis is exported but never restored.** Reports, insights,
  analytics and the dashboard go into a backup so it reads as a record of what
  the app was saying; restoring a stale analysis over live records would put
  the app in a state its own engines disagree with.
- **Rollback is best-effort, not transactional.** localStorage offers no
  transaction. The previous state is held in memory and written back, which
  covers every failure except storage refusing the restore too.
- **`ALL_REPOSITORIES` and `SECTIONS` are two lists in two layers.** The
  engine may not import repositories, so they are kept in sync by a test
  rather than by construction.
- **Analytics windows are counted back from the current week**, not from a
  calendar boundary: `quarter()` is the last thirteen weeks, not Q3. Use
  `range(from, to)` for a calendar period.
- **A yearly analysis is expensive on its first call.** Fifty-two report
  builds against a memo that holds `CACHE.MAX_ENTRIES`, so the window evicts
  its own earlier weeks as it goes. The analysis itself is cached, so this is
  paid once per invalidation rather than once per read.
- **An unlogged week enters a trend as a zero, not as a gap.** The reports
  engine cannot tell a rest week from an unlogged one, and neither can this.
  `risk.layoff` names the gap so the resulting slope is not read as a
  measured collapse.
- **The flat bands are judgement calls.** Every one in `ANALYTICS.FLAT_BAND`
  is a coaching convention, not a measured threshold, and the pace band was
  wrong by a factor of four until a test caught it.
- **The dashboard is only as current as the week's report.** Adherence,
  load and weight figures come from `ReportService.analyze()` for the week the
  day falls in, so a figure moves when the week's data does, not when the day
  does.
- **The ETA is a straight line.** Remaining kilograms over the measured rate,
  assuming nothing changes. It is refused near a rate of zero rather than
  extrapolated, but where it is given it is a projection, not a forecast.
- **Nothing renders the new sections.** `today`, `week`, `health`, `goal` and
  `insights` are additions to an object the dashboard page already reads; the
  page still draws only the keys it drew in phase 13.
- **The dashboard cannot see a free-text injury.** It reports the day the
  workout engine built. If a restriction was never entered as
  `restrictedMovements`, the session is still there and the dashboard shows it.
- No exercise media ships.
- Not medical advice; no awareness of conditions, medication or allergies.

## 14. Documented exceptions

| Exception | Reason |
|---|---|
| `scripts/logger.js` importable from any layer | cross-cutting infrastructure |
| `engines/constants.js` importable from any layer | shared config, **misnamed**; move to `config/` costs ~40 imports |
| `scripts/routes.js` → `pages/*` | the route table's job; dynamic imports give code splitting |
| 2 unused files: `data/index.js`, `engines/index.js` | public API barrels |
| `scripts/language.js` → `repositories/settings-repository.js` | the same crossing `theme.js` makes: a preference manager persists through the repository, like everything else |

## 15. Important constants — all in `engines/constants.js`

`UNITS` `MIFFLIN` `KATCH_MCARDLE` `ACTIVITY_FACTOR` `GOAL_ADJUSTMENT`
`MACRO_PER_KG` `NAVY_BODY_FAT` `ONE_REP_MAX` `RUNNING` `ADJUSTMENT`
`PRECISION` `CACHE` `PHASE` `DAY_TYPE` `INTENSITY` `PRIORITY` `PLANNER`
`STRAIN` `SLEEP` `HYDRATION` `CALORIE_CYCLING` `LAYOFF` `EXPERIENCE`
`WORKOUT` `PROGRESSION` `SESSION_STATE` `EXERCISE_STATUS` `EXECUTION`
`RUN_TYPE` `QUALITY_TYPES` `RUNNING_PROGRAM` `RUNNING_LOAD` `MAX_HR`
`NUTRITION_GOAL` `GOAL_ALIASES` `DEFICIT_GOALS` `SURPLUS_GOALS` `MACROS`
`NUTRITION_SAFETY` `REFEED` `DIET_BREAK` `HYDRATION_EXTRA`
`MEAL_DISTRIBUTION` `MEAL_SLOT` `SLOT_FOOD_TYPES` `MEAL_SHAPES`
`MEAL_PLANNING` `BUDGET` `RECOVERY_STATUS` `RECOVERY_BANDS` `NOTIFICATION`
`REPORTS` `ACHIEVEMENT` `WARNING` `INSIGHTS` `INSIGHT_CATEGORY`
`INSIGHT_SEVERITY` `DASHBOARD` `DASHBOARD_SEVERITY` `DASHBOARD_RISK`
`ANALYTICS` `ANALYTICS_DIRECTION` `ANALYTICS_PERIOD` `ANALYTICS_FINDING`
`BACKUP_SCOPE` `IMPORT_MODE` `IMPORT_INTENT` (in engines/backup-schema.js)
`COACH` `COACH_CATEGORY` `COACH_SEVERITY` `COACH_HORIZON`

Storage keys (`scripts/config.js` → `KEYS`, prefix `foundation:`):
`profile settings goals schedule measurements runs workouts nutrition
supplements weekly-reports sessions notifications plan-snapshots onboarding`

App config: `APP.version` `APP.schemaVersion` `BASE` `ROUTER_MODE` `LOG_LEVEL`

Settings keys added in phase 15: `language` (`'en' | 'ar'`, default `'en'`).

## 16. Do NOT change

- The layering, or the architecture test that enforces it.
- The generation pipeline order.
- The four original goal names (`bulk` `cut` `recomp` `maintain`) — stored
  profiles depend on them; new names were **added**, not replaced.
- Legacy muscle names in `models/gym.js` (`back` `shoulders` `full_body`).
- Phase 1–3 regression numbers: BMR 1638, TDEE 2539, target 2844, protein 116,
  pace 5:29 for 4.59 km / 25.18 min (`tests/regression.test.js`).
- Emitting on read (reintroducing it re-breaks the caches).
- `version` in **both** `scripts/config.js` and `service-worker.js`, and the
  precache list, must be updated together on every release.
- `language.install()` before `language.init()`, and both before the shell is
  built. Without the install every screen renders raw keys.
- The two dictionaries must define the same interface keys. `tests/i18n.test.js`
  fails on a key nothing reads and on a key nothing defines.
- `tests/shell-files.js` is **generated** from the service worker manifest.
- The adherence weights in `REPORTS.ADHERENCE_WEIGHTS` sum to 1, and a
  component with nothing planned is **dropped and the rest renormalised** —
  never scored as zero.
- The reports engine's `weekly()` must stay pure. `ReportService` may read
  storage; the engine may not. The same now holds for `DashboardEngine.snapshot()`
  and `DashboardService`.
- The top-level keys of `DashboardSnapshot` that predate phase 18 — `date`
  `weekNumber` `phase` `deload` `tasks` `workout` `running` `nutrition`
  `meals` `weeklyProgress` `recovery` `notifications` `reasons` `generatedAt`.
  `pages/dashboard.js` destructures them; phase 18 added sections beside them
  rather than replacing them, and `tests/dashboard-engine.test.js` pins it.
- A notification without a title, a message, a severity, a reason and evidence
  is dropped, and the drop is counted in `meta.notificationsDropped`.

## 17. Can be improved

- PDF export, now that `WeeklyReport` and `WeeklyInsights` are structured data.
- A reports/insights UI — both engines exist and nothing draws them yet.
- Charts over `WeightService.history()` and running metrics.
- AI coach consuming reason objects.
- Photo attachments for weekly reports (model already holds references).
- Auto-correct volume shortfalls instead of only reporting them.
- Move `engines/constants.js` → `config/constants.js`.
- Verify food prices against real shops; flip `priceConfidence` to `'checked'`.

## 18. Current phase

**Phase 23 complete. Version 2.3.0. The project is finished.**

- **1,381 tests passing**, 0 failing, under jsdom. Node alone: 1,293 passing,
  88 skipped (they need a DOM).
- Phase 23 added 77 tests. The 1,304 that existed before it all still pass.
- 296 files · 52,975 lines of code · 0 dependencies · no build step.
- 240 modules precached · 627 English keys · 692 Arabic keys.

**Twelve release gates.** Ten green, two amber, none hidden. The two amber
gates are accessibility and browser performance, and both are the absence of a
tool rather than a defect: no browser and no device were available at any point
in this project's construction. `RELEASE_MANIFEST.md` records every gate, every
check behind it, and the difference between TESTED, NOT TESTED, ENVIRONMENT
LIMITED and KNOWN LIMITATION.

**Performance, measured in Node** with twelve weeks of data: dashboard 72.6 ms
cold and under 0.1 ms warm; weekly report 6.3 ms cold; quarterly analytics
37.6 ms; coach session 21.7 ms; print HTML 2.5 ms; backup export 1.0 ms and
import 14.0 ms. The phase-14 browser figures (DCL 781 ms, FCP 364 ms) were
**not** re-measured and are not claimed to be current.

## 19. Next phase

**There is no next phase.** The project is complete at 23 of 23.

Two things should be done before anyone other than the author uses it, and
neither is development work:

1. Run axe-core in a real browser. Page markup has not changed since phase 14,
   which recorded zero violations, but that result is now nine phases old.
2. Install on the target device, confirm the service worker registers, reload
   offline, and look at the Arabic layout on a real screen.

Both are listed as conditions in `RELEASE_MANIFEST.md`.

## 20. Remaining tasks

- [ ] Write the 101 Arabic exercise names.
- [ ] Decide whether logged fibre and sodium are worth a model change.
- [ ] Add a page that renders the phase-22 documents, and a chart renderer
      for the ChartData payloads.
- [ ] Expose partial export, dry run and merge in the settings page.
- [ ] Decide whether `app/recovery-service.js` should keep `statusFor()` —
      it is policy living above the engine layer, though it is the only
      owner of it, so it is a smell rather than a duplication.
- [ ] Translate the `alternatives` id lists on the meals page.
- [ ] Run axe over 9 pages × 2 themes × 2 directions on a real browser.
- [ ] Verify and update MAD food prices.
- [ ] Rename `engines/constants.js` → `config/constants.js`.
- [ ] Decide whether the two unused barrels stay.
- [ ] Add exercise media, or a search link per exercise.
- [ ] Consider auto-correcting the volume audit's shortfalls.

---

## How to run

```bash
cd fitness-app
python3 -m http.server 8000      # ES modules need http, not file://
npm test                         # Node suite
# open http://localhost:8000/tests/  for the full browser suite
```

Install on iPhone: serve over HTTPS, open in **Safari**, Share → Add to Home
Screen.

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
