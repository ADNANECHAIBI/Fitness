# Foundation — final report

Version 1.3.0 · a personal training and nutrition tracker, built as an
installable PWA with no frameworks, no build step and no dependencies.

---

## What it is

A single-page app that plans a training week, runs the sessions, tracks what
actually happened and feeds it back into the next week. Everything is
calculated on the device and stays on it: no accounts, no server, no network
calls of any kind.

Every number it shows comes from a named formula with a published citation,
and every decision it makes carries the reason it made it — not as text
assembled for a screen, but as data in the object itself.

It speaks English and Arabic, right to left included, and switching between
them changes text and nothing else.

---

## Architecture

```
┌─ consumers ────────────────────────────────────────────────────┐
│  pages/ · components/          presentation only                │
└──────────────────────────┬─────────────────────────────────────┘
                           │  App.query · App.actions · App.forms
┌──────────────────────────▼─────────────────────────────────────┐
│  app/     orchestration: planning, dashboard, progress, recovery,│
│           reports, insights, sync, notifications, cache          │
└──────────────────────────┬─────────────────────────────────────┘
┌──────────────────────────▼─────────────────────────────────────┐
│  services/  the storage boundary: fetch, cache, publish         │
└──────────────────────────┬─────────────────────────────────────┘
┌──────────────────────────▼─────────────────────────────────────┐
│  engines/ + rules/   all calculation and all policy. Pure:      │
│                      no storage, no events, no DOM              │
└──────────────────────────┬─────────────────────────────────────┘
┌──────────────────────────▼─────────────────────────────────────┐
│  models/ · validators/ · repositories/ · data/ · events/        │
└──────────────────────────┬─────────────────────────────────────┘
                           ▼
                    localStorage
```

The layering is not documentation. `tests/architecture.test.js` reads the
service worker's own precache manifest and fails the build if any layer
imports one it must not, if the UI reaches past `app/`, if an engine touches
storage, if anything writes to the console outside the logger, or if
`innerHTML`, `eval` or `new Function` appear anywhere.

Three crossings are allowed, each named in that test with the reason:
`scripts/logger.js` and `engines/constants.js` are cross-cutting, and
`scripts/routes.js` referencing pages is what gives the app its code
splitting.

The language manager needed no fourth exception. It sits in `scripts/`, which
may already reach a repository — that is how the theme is stored — and it
never touches `data/`, because the labels are handed to it instead.

---

## The pipeline

A week is generated in one order, because each engine consumes what the last
produced:

```
Planner → Workout → Running → Nutrition → Meals → storage → events
```

Out of order it does not fail loudly; it silently plans against stale numbers.
`PlanningService.generateWeek()` enforces it and returns the steps it
completed.

The loop closes on the way back: a finished session is written as logged sets,
the workout engine reads those next week, and a set marked failed is the reason
it will not add weight on top of a miss.

---

## By the numbers

| | |
|---|---|
| Files | 296 |
| Lines of code | 52,975 |
| Dependencies | 0 |
| Build step | none |
| Languages | 2 |
| **Tests** | **1,381, all passing** |

| Layer | Files | Lines |
|---|---:|---:|
| tests | 32 | 14,006 |
| engines | 42 | 12,605 |
| rules | 65 | 9,450 |
| data | 18 | 3,585 |
| reporting | 6 | 2,168 |
| app | 17 | 2,149 |
| pages | 13 | 1,758 |
| services | 15 | 1,534 |
| scripts | 10 | 1,367 |
| styles | 6 | 1,159 |
| components | 16 | 876 |
| models | 15 | 675 |
| repositories | 15 | 535 |
| validators | 4 | 270 |
| events | 3 | 165 |

**42 engine files**, **65 rule files** including 50 coaching rules, **6
reporting files**, **15 services**, **17 application services**, **16
components**, **9 pages**, **15 models**, **15 repositories**, **101 exercise
records**, **65 food records**, **627 English keys and 692 Arabic keys**,
**240 precached modules**.

---

## The language layer

`scripts/language.js` is the counterpart to `theme.js`: one object owns the
active language, the writing direction, persistence and notification.

It holds no dictionary. The labels live in `data/i18n/`, and the architecture
test forbids `scripts/` from importing `data/` — so `script.js` hands the
module over at boot:

```js
language.install(i18n).init();
```

That is not a way around the rule. A language manager that imported its own
labels would be a second translation system, and there was already one.

**Switching does not re-render.** A caller passes `T('ui.common.save')` where
it used to pass `'Save'`. It stringifies to the translation, so no component
signature changed; and `el()` records which key produced the text, stamping
`data-i18n` on the node and keeping the key and its variables in a WeakMap.
Changing language is one `querySelectorAll` and a `textContent` write per
node. Nothing is rebuilt, no query is re-read, no engine runs again.

| | |
|---|---:|
| Bound nodes across 9 mounted pages | 236 of 886 (26%) |
| Caches rebuilt by a re-translation | **0** |
| Re-translating vs re-rendering, same machine | **3.5× cheaper** |
| Interface keys, identical in both languages | 394 |
| Added to the critical path | 4 modules, 19.5 KB gzipped |

The label files sit on the critical path deliberately. The alternative is a
shell built in English that flips to Arabic a moment later.

Right to left is CSS, not JavaScript: `text-align: start`, `inset-inline`,
`border-inline-start`, and flexbox. Two glyphs are drawn rather than written —
the disclosure caret and the row chevron — and those are mirrored by hand. The
page transitions swap their forward and back keyframes, because the keyframes
were already each other's mirror.

---

## What this pass found and fixed

**Performance — the whole engine graph loaded before first paint.** `script.js`
imported the application layer eagerly, pulling roughly 150 modules onto the
critical path for a header and a tab bar that need none of them. Now it boots
after paint.

| | before | after |
|---|---:|---:|
| DOMContentLoaded | 1,855 ms | **781 ms** |
| First contentful paint | 520 ms | **364 ms** |

**Performance — reading a plan emitted an event.** `PlannerService.plan()`
published `PLAN_GENERATED` on every call, which invalidated every cache
listening for it. The recovery snapshot was rebuilt on every single read and
never once served from cache. Four services had the same bug.

| | before | after |
|---|---:|---:|
| Storage reads to generate a week | 39 | **5** |
| Week generation | 14.6 ms | **9.2 ms** |
| Cached `getToday()` | 0.725 ms | **0.02 ms** |

**Architecture — a dependency cycle.** `BottomNavigation` imported the route
table, which imports pages, which import the components barrel, which imports
the nav. The component now takes its items as a parameter.

**Architecture — a violation I introduced during this pass.** Moving a
prototype-pollution guard into `scripts/storage.js` made the backup service
import storage, which only repositories may do. The guard moved to
`scripts/safe-json.js`; the architecture test caught it.

**Security — prototype pollution.** Stored records and imported backups both
arrive from outside the app: the first can be hand-edited in developer tools,
the second came from anywhere. Both are now scrubbed of `__proto__`,
`constructor` and `prototype` at any depth, with tests proving
`Object.prototype` stays clean.

**Logging.** 27 direct `console` calls became a logging layer with four levels,
a threshold, an off switch, and a bounded history that keeps recording even
when output is off. Tests run silent, because several of them trigger
contained failures on purpose.

**Two tests were wrong, not the code.** One reached for `localStorage` in Node;
one patched a profile that did not exist and expected a write failure rather
than the validation rejection it actually got.

---

### Phase 15

**The application layer was writing English.** `buildTasks()` in
`app/dashboard-service.js` composed `"5 exercises, about 66 minutes"` and
handed it to the page as a finished sentence. That is presentation, and this
project has a rule about where presentation lives. It now names the label and
supplies the numbers; the page turns that into words. Nothing else changed —
no test depended on the wording, which is itself telling.

**The precache list the architecture test reads had gone stale.**
`tests/shell-files.js` is generated from the service worker so the test checks
what actually ships. It had drifted: 189 entries against 204 precached files.
Regenerating it and keeping the modules-only convention brought it back in
step. The gap was all assets and stylesheets, so nothing was hiding in it —
but the file had stopped being what it claims to be.

**The test suite never installed the label layer.** Every page under test
rendered raw keys. The manager was behaving correctly — a key nobody defined
shows itself — and the suite was wrong about it. It now installs the labels
the same way `script.js` does.

**Switching language invalidates three snapshot caches**, because it writes to
Settings and `SETTINGS_CHANGED` clears `dashboard`, `progress` and `recovery`.
Measured: the sweep itself rebuilds nothing, the write rebuilds nothing
immediately, and the first read afterwards rebuilds three snapshots. Switching
theme has always done exactly the same, which is how it is known not to be
something translation introduced. It is left alone: fixing it means changing
what a settings change means to the cache layer, which is not an integration
pass's business.

**One key was defined and never read**, and a generator bug briefly wrote six
Arabic strings into the English file. Both were found by an audit that is now
a test: `tests/i18n.test.js` reads every shipped module and fails on a key
nothing defines and on a key nothing reads. Both failure modes were confirmed
by breaking them on purpose.

---

## Verified

| Check | Result |
|---|---|
| Tests (Node) | 675 passing, 76 skipped — those need a DOM |
| Tests (full suite) | **751 passing, 0 failing** |
| Every page, both languages | 9 pages × 2, no untranslated key rendered |
| Interface keys | 394, identical in `en` and `ar`, none unread |
| Placeholders | every `{var}` survives translation, both ways |
| Re-translation cost | 0 caches rebuilt, 0 nodes replaced |
| Missing key | shows the key, warns once, does not throw |
| Language after restart, and after a restore | remembered |
| Circular dependencies | none |
| Dead code | 2 unused files, both deliberate API barrels |
| Console use outside the logger | none |
| `innerHTML` / `eval` / `new Function` | none |
| PWA | 204 files precached, versions in step |

**What was not verified.** Phase 15 ran without a browser. The suite was
executed under a jsdom harness, which reproduced the phase-14 browser baseline
exactly — 684 of 684 — before any change was made, so the counts above are
comparable. The phase-14 browser measurements were not re-run: **axe, the
keyboard sweep, the responsive check, DCL and FCP are phase-14 results and are
not claimed for this release.** RTL layout has not been seen on a real screen.
The timing ratios above were taken in one environment and compared against
each other, which is what they are for; the absolute milliseconds are jsdom's
and should not be read next to phase 14's numbers.

---

## Strengths

**Everything is explainable.** Every engine attaches a reason object to what it
decided, with the rule id, the evidence and a sentence a person can read. The
UI renders them verbatim. A future report generator or coaching layer reads
those objects rather than re-deriving the logic.

**Every formula is cited and labelled.** Mifflin-St Jeor, Katch-McArdle,
Tanaka, Epley, Brzycki, Foster's session-RPE, the US Navy circumference method,
the ISSN position stands — each carries its source, whether it is `exact` or
an `estimate`, when to use it and what it gets wrong. `activeFormulas()`
returns the lot for a "how is this calculated?" screen.

**The rules are data, not branches.** 44 files of `defineRule({ when, apply })`
with no large conditionals anywhere. A rule that decides something without
explaining it is dropped rather than applied — enforced, and tested.

**Content is separate from logic.** Swapping an exercise or adding a food is a
record edit. The engines ask by property — "a compound horizontal push I can do
with a barbell" — and never by name.

**It is honest about what it does not know.** Assumed equipment, guessed pace,
estimated prices, unmeasured sweat rates, insufficient weigh-ins: each is
stated rather than papered over.

---

## Current limitations

**101 exercise names carry no Arabic label.** The mechanism is wired and the
foods are translated; the exercise names are not written. They fall back to
their English names, which is what the fallback is for. Writing them is
content work, and a wrong Arabic name for a lift is worse than an English one.

**Engine text stays English.** Reasons, a session's goal, a recovery status, a
phase name, the `alternatives` id lists on the meals page. Reasons in
particular are data, not display strings — translating them would move wording
into what gets stored. Validation messages are built from the models' own
labels and stay English too; a test pins one of them.

`engines/index.js` and `data/index.js` remain unused: public API barrels
nothing imports.

**Prices are estimates.** The least reliable data in the project. Every food
carries `priceConfidence: 'estimate'`; `FoodDB.priceReliability()` reports how
much has been checked. They move with season, city and market.

**The meal planner is a greedy heuristic, not an optimiser.** It anchors on
protein, fills carbohydrate, fat and fibre, then repairs the portions. It
lands around 90% macro accuracy and reports the gap rather than hiding it.

**No exercise media ships.** No image, GIF or video URL appears in any record —
those are somebody's copyrighted work. The convention for local assets is
documented in `assets/exercises/README.md`.

**The engines only see what is logged.** A set performed and not recorded did
not happen, as far as next week is concerned.

**`engines/constants.js` is misnamed.** It grew into shared configuration for
the whole app. Moving it to `config/constants.js` touches about forty imports;
it was not worth the risk in this pass, and the architecture test names it as a
known exception.

**Nothing here is medical advice.** The calorie and macro engines do not know
about any medical condition, medication, allergy or eating disorder. The
steeper deficits in particular are bounded by safety floors and say plainly
that they warrant supervision.

---

## Why it extends

**Adding an engine.** Give it a service that fetches its inputs and caches its
output on the events that invalidate it, add a step to `PIPELINE` in the right
position, register its cache, add a query. No existing service changes, because
none of them know about each other — every link between them is a bus
subscription.

**Adding a rule.** One `defineRule` in the file for its domain. It runs.

**Replacing an engine.** Every one sits in a slot:
`workoutSlot.register(mine); workoutSlot.use('mine')`. Or pass `{ ruleSets }`
to swap one set of rules and keep the rest.

**Adding a page.** A module with `render`, `mount`, `unmount`, one entry in
`scripts/routes.js`, one line in the precache list.

**Changing the design.** `styles/tokens.css` and `styles/themes.css`. No page
references a colour.

**Adding a language.** A file in `data/i18n/` and one line to register it. Ids
are data; labels are presentation.

**Adding a language.** A file in `data/i18n/`, one line in `LOCALES`, one entry
in `LANGUAGE` in `models/settings.js` so the choice can be stored, and `'rtl'`
in `registerLocale` if it reads that way. Nothing else: the settings control
builds itself from `language.options`, and a key the new file has not reached
yet falls back to English rather than breaking.

---

## Reports and insights

Two engines were added after the app was already complete, and neither of them
calculates anything.

**The reports engine** turns a week of records into a `WeeklyReport`: what the
scale, the gym, the running, the food, the meal plan and the recovery did;
adherence; training load; what moved against last week; what was achieved;
what crossed a threshold; and what to do about it. Every figure carries an
explanation — the value, the inputs, the method in words, and which engine
owns the underlying calculation — recorded as the figure is produced rather
than written next to it, so the two cannot drift apart. `report.explain(key)`
answers *why that number*, for any number in the report.

Two rules govern it. It reuses rather than recomputes: tonnage is the strength
engine's, pace and acute:chronic load the running engines', the weight trend
the body engine's, session verdicts the execution engine's. And it refuses to
advise without evidence: a recommendation missing its reason, evidence,
confidence or source engine is dropped before the report is returned. The
rules that *decline* to act matter as much as the ones that act — when the
scale has stalled but half the week is unlogged, the output is "there is
nothing here to change the plan on, and here is why".

**The insights engine** reads that report and says what stands out. Its whole
input is the report, which is what makes it impossible for an insight to
disagree with the figures it came from. Rules append drafts; anything without
evidence is never created; two rules reaching the same conclusion are merged
into one, the survivor keeping whichever explanation rests on more evidence at
higher confidence and whichever severity is louder; and what remains is ranked
by priority, then severity, then confidence, then date.

Neither engine holds a line of display logic. An insight is a record with a
category, a severity, a priority number and two sentences held as data — the
same way a rule's reason has been data since phase 5. Nothing in either engine
knows about a screen, a language, an ordering for the eye or a colour.

**What could come next:** a screen for any of it — both engines produce
structured data and nothing renders it yet — PDF export from those same
objects, charts over `WeightService.history()` and the running progress
metrics, a coaching layer consuming `allReasons()`, photo attachments for the
weekly reports (the model already holds the references), and the 101 Arabic
exercise names, to finish what phase 15 wired.

---

## The dashboard engine

A third engine was added after the other two, and it is the only one that
computes nothing at all.

Phases 4 to 17 each produced a correct result and none of them was a screen: a
`WeeklyPlan`, a `WorkoutWeek`, a `RunningWeek`, a `NutritionWeek`, a
`MealPlanWeek`, a `WorkoutSession`, a `WeeklyReport`, a `WeeklyInsights` set.
What was missing was the join — one object a consumer can read top to bottom
instead of asking eight services eight questions and then working out how the
answers relate. `DashboardEngine.snapshot(input)` is that join and nothing
else.

Every figure in a `DashboardSnapshot` is carried from the engine that produced
it, **with that engine's explanation attached**. Ask the snapshot why the
weight rate is what it is and the answer still names the body engine and the
least-squares fit through the recent weigh-ins; the dashboard's only addition
is a note that it did the carrying. Five arithmetic operations happen in the
engine and no more — target minus logged for calories and for protein, the
day's minutes added up, goal weight minus current weight, and remaining
kilograms over the measured rate — and each records both operands.

That last one is the interesting refusal. An arrival date is not produced when
there is no goal weight, no fitted rate, a rate below the floor in constants,
or a rate pointing away from the goal. Dividing by a rate close enough to zero
produces a number, not an estimate, and the snapshot says so in words instead
of printing a date in 2041.

Three judgements remain, and all three are rules rather than branches: which
task matters most today, how loudly the health summary should read, and what
is currently worth a notification. The notification rules answer a question no
stored record can — a session planned and not started is not an event, so
nothing ever wrote it down, and it is exactly what a dashboard exists to point
at. Any notification arriving without a title, a message, a severity, a reason
and evidence is dropped and the drop is counted, which is the same stance
phases 16 and 17 took toward recommendations and insights.

**What this phase found.** `app/dashboard-service.js` had been subtracting
logged intake from the day's target and ordering today's list itself. Both are
domain decisions, both were sitting a layer above the engines, and neither had
a test that would have caught it moving. They are in the engine now. The
service gathers, guards each read so one failing source degrades the snapshot
instead of emptying it, and caches — which is the whole of what an application
service was ever meant to do.


---

## The analytics engine

A fourth engine, and the one that finally looks up from the week.

Everything before it works in one unit. The reports engine describes a week.
The insights engine says what stood out in one. The dashboard assembles a day
out of the week around it. None of them can answer *has the squat actually
moved since March*, because none of them is ever handed March.

`AnalyticsEngine` is handed the weeks. Five entry points — `weekly`,
`monthly`, `quarterly`, `yearly`, `range(from, to)` — differ only in which
window they clip out of a list of weekly reports, which is why none of them
holds any logic of its own.

**How a trend is built.** Twelve figures are fitted with a least-squares line:
body weight, tonnage, estimated one-rep max, distance, pace, running load,
calories, protein, strain, sleep, adherence and how much of each week was
logged at all. Every one of those numbers was produced by an engine that owns
it, and the explanation says which — ask the analysis about the pace trend and
it names the running engine, not this one. The fitting itself is
`engines/trend.js`, which was three private helpers inside the reports engine
until this phase; extracting them means a quarter and the months inside it
call the same function and cannot disagree about a slope.

**How a slope becomes a judgement.** Flatness is decided first, on magnitude
alone: inside the band, a slope is not movement, whichever way it points. Only
outside the band does the metric's own *better* get consulted — up for
tonnage, down for pace, the goal for body weight, and nothing at all for
calorie intake, which is meant to sit where it was put. A rising scale is
improvement on a bulk, a risk on a cut, and neither on a maintenance.

**Improvement needs agreement; decline does not.** Two independent measures
must move together before the engine calls it progress. One falling measure is
named on its own. The asymmetry is the point: missing a regression costs more
than naming a fortnight that turns out to be noise, and the week count in the
evidence lets a reader judge which they are looking at.

**What this phase found.** Four real defects, all caught by tests rather than
by reading:

1. **No cut was ever detected.** The profile stores `cut`; the nutrition
   vocabulary calls it `fat_loss`; `GOAL_ALIASES` maps between them and the
   analytics engine never called it. Every deficit goal silently failed every
   comparison against `DEFICIT_GOALS` — so a cut moving the wrong way raised
   nothing at all. The mapping was already written and exported by the
   nutrition context; it is now reused.
2. **The goal was resolved twice**, once for labelling trends and once for the
   rules, with different fallbacks. A yearly window and a quarterly one over
   the same weeks could reach different conclusions about the same scale. It
   is resolved once, in the context.
3. **Every window called itself a range.** `AnalyticsService` passed a period
   through `AnalyticsEngine.range()`, which stamps `range` by definition, so a
   monthly analysis reported itself as something else.
4. **The pace flat band was four times too wide.** At 2 sec/km/week, a runner
   improving by 26 seconds per kilometre across a quarter read as no change.
   It is 0.5 now. Every band in `ANALYTICS.FLAT_BAND` is a coaching
   convention rather than a measured threshold, and this one was simply
   wrong.


---

## The backup engine

The one feature where being wrong cannot be undone.

Everything else this app computes can be recomputed. A weight trend fitted
badly is a weight trend fitted again next week. A botched import is training
history that is gone. So phase 20 is built around refusal and reversal rather
than around throughput, and almost every test in it checks that something did
*not* happen.

**Deciding is separated from writing.** `BackupEngine.plan()` takes a
candidate file and the current state and returns what *would* be written,
section by section, with every finding behind those decisions. It writes
nothing. `BackupService` takes that plan and executes it through repositories.
That split is the reason a dry run is possible at all — "what would this
import do" is the same code path, stopped one step earlier, rather than a
second implementation that could disagree with the first.

**A half-imported state is not reachable.** Parse, read the current state,
plan, refuse if unsound, snapshot every section the plan would touch, apply,
verify each section landed, restore on any failure. The verification is not
decoration: `replaceAll` returns a count instead of throwing when storage
refuses a row, so a silent partial write is caught by counting what came back,
not by catching an exception that never arrives.

**No validation rule was written.** Every question about whether a record is
well-formed goes to the model that owns it, through `model.isValid()` — the
same schema a repository runs on `create()`. The eleven checks the backup
layer does own are all about the *file*: is this a Foundation backup, can this
build read its schema version, do two records share an id, does a session
point at an exercise that no longer exists, is a date a date.

**Severity is where the judgement lives.** An error stops a section; a warning
does not. A session naming an exercise since removed from the database is
still a session that was performed, and throwing it away to preserve a foreign
key would destroy the more valuable of the two. An unknown field is a warning
and is reported by name, because a schema silently drops what it does not
declare and the user deserves to know what a round trip cost them. A record
that fails its own model is an error, because nothing downstream can read it.

**Migrations are one step each, kept forever.** A file at version 1 opened by
a build at version 3 runs 1→2 then 2→3, each seeing only what the last
produced. The alternative — one function handling "any old version" — grows a
branch per release and is untestable within a year. Backward compatibility is
solved this way; forward compatibility is not solved at all, and that is
deliberate: a file from a newer build may contain fields with no meaning here,
and there is no honest way to guess. It is refused rather than imported at
three-quarters and called a success.

**What this phase found.** The `Gym` model stores its exercise as free text
rather than as a database id, so "invalid exercise ids" is only checkable
where ids are actually stored — inside sessions and in the two settings
exclusion lists. That is reported as what it is rather than papered over with
a check that would always pass. The section list and the repository registry
also have to live in different layers, since the engine may not import
repositories; they are kept honest by a test that fails if a repository is
added without a matching section, rather than by a comment asking someone to
remember.


---

## The coach

Twenty phases produced a description of a week. None of them said what to do
about it.

`CoachEngine.session()` closes that gap, and the first thing worth saying about
it is what it is not. There is no model in it, no API call, no network access
and no generated text. It is fifty conditionals over other engines' output.
Every sentence it produces traces to a threshold in `constants.js` and a figure
some named engine measured, and the file that builds an advice record refuses
any draft that cannot show both.

**How advice is chosen.** Every rule runs. None excludes another at match time,
because a week genuinely can need less volume *and* more food *and* more sleep
at once, and reporting only the loudest of those would hide two real problems.
A rule appends a draft; `createAdvice` refuses drafts missing evidence, a
recommendation, its reasoning or the engines behind it, and the refusal is
counted rather than swallowed.

**How it is ranked and trimmed.** Priority, then severity, then confidence,
then the weight of evidence, then the key for stability. Then merged by key —
"eat more" reached from a stalled scale and from a calorie trend is one piece of
advice. Then **suppressed**: some advice is true but redundant *as a sentence*
beside something stronger, and "do not train today" plus "take the volume down"
reads as a machine repeating itself. Suppression runs after ranking, so the
survivor is the more important one rather than whichever rule was declared
first. Then capped, because a coach that says twelve things gets none of them
done.

**How confidence works.** No rule chooses it. The context computes the weakest
of the weekly report's coverage and the analytics window's, and a rule may cap
it lower but cannot raise it. Advice cannot be surer than the thinnest evidence
under it — and a rule author who forgot that cannot break it.

**Safety.** No rule names a condition, offers a cause or interprets a symptom.
The strongest thing the health rules say is that a pattern is worth showing to
someone qualified, which is a refusal to give medical advice rather than an
instance of one. A test asserts this across every scenario. And when the inputs
are too thin, `health.not-enough-data` outranks nearly everything and suppresses
the reassuring advice that would otherwise appear — the coach saying it cannot
help is more useful than the coach guessing.

**What this phase found.** Two real defects, both silent:

1. **Both weight-rate rules never fired.** They read
   `ADJUSTMENT.MAX_GAIN_RATE`, which does not exist — the safety limits live in
   `NUTRITION_SAFETY`. The comparison was against `NaN`, which is false for
   every input, so a bulk gaining a kilo a week produced no warning at all and
   nothing anywhere reported a problem.
2. **A produced report cannot be fed back into its own input.** The reports
   engine's output carries `range.start`; the stored `WeeklyReport` model
   carries `weekStart`, and the `history.reports` filter reads the latter.
   Production is unaffected — it passes stored records — but four
   stall-detection tests were asserting nothing until the fixture converted
   between the two shapes. Worth naming as a sharp edge rather than papering
   over.

**And one honest limit.** The coach is not intelligent. It notices what fifty
rules were written to notice and nothing else, and it has no way to know what it
is not looking at. The word "AI" in the phase title describes an ambition rather
than the implementation, and the implementation is better for being auditable
than it would be for being clever.


---

## The reporting layer

Twenty-two phases in, the app could describe a week from nine angles and print
none of them. Phase 22 is the printing, and its whole design is a single
negative claim: **this layer cannot calculate.**

Not "does not" — cannot. `reporting/` imports nothing that could produce a
figure: no engines, no rules, no models, no repositories, no services, and not
even `engines/constants.js`, which every other layer in the app reads under a
documented exemption. Its own caps live in `reporting/constants.js` precisely so
that exemption never has to be argued about again, and six checks in
`tests/architecture.test.js` enforce all of it against the service worker's own
precache manifest. One of those checks greps the layer for arithmetic
operators applied to measurements, which is how the two findings below were
caught.

It also imports nothing from `app/`. The document builders are pure functions of
their arguments and `app/reporting-service.js` gathers and calls down — so the
dependency runs one way, there is no cycle, and every document in the phase-22
suite is built without storage, a plan or a cache. That is why 99 new tests run
in under a second.

**Provenance is the point.** `fromExplanation` reads a value, its unit, its
reason and its owning engine out of the producing engine's explanation map in
one call, so the common case cannot be got wrong. A field nothing sourced is
allowed — a week number has no engine behind it — but it is marked and counted
in `metadata.unsourcedFields`, so "how much of this report can be traced" has a
number rather than an impression.

**The charts engine does not know what a kilogram is.** Labels, numbers, a unit
string, five shapes. What it does know is how series arrive broken: empty, null,
NaN, Infinity, mismatched lengths, duplicate labels, forty thousand points. Every
one produces a chart with a note attached rather than an exception. It never
interpolates, averages or extrapolates, and a series over the point cap is
**truncated rather than downsampled** — the mean of five readings is a sixth
number nobody took, and this app's entire premise is that a figure has a source.
NaN is counted separately from null because one means "never recorded" and the
other means "a division went wrong two layers up", and a chart that reported
them identically would hide a bug.

**PDF, honestly.** There is no PDF library in this project and phase 22 did not
add one. `BrowserPrintPdfRenderer` produces print-ready HTML and hands it to the
browser's print-to-PDF, which is what shapes the Arabic — because it has a text
engine and this project does not. `StructuralPdfRenderer` produces no glyphs at
all: it returns the pages, fields, explanations, warnings and recommendations a
PDF would contain, which is a question that can be answered exactly. What is
**not** claimed: that RTL PDF output is correct. `DIRECTION_SUPPORT` says
`pdf: 'via-browser-print'` rather than `true`, because nothing here has produced
a PDF or seen one on paper.

**Two kinds of text, treated differently.** A label is an i18n key resolved by
an injected translator — which is why no renderer imports the language manager,
why Arabic and English output can both be tested without booting the app, and
why an audit can assert that no file in the layer contains a literal sentence. A
sentence an *engine* wrote is carried verbatim. So an Arabic report has Arabic
headings and English coaching, and that is correct rather than unfinished:
re-wording a recommendation would mean re-composing a claim, figures and all,
in a domain adjacent to medicine.

**What this phase found.** Three defects, two of them caught by the phase's own
audits:

1. **A fallback that could never fire.** The monthly document chose between the
   monthly report's total volume and the analytics summary's with `??` applied
   to the *field object* rather than the value — and a field object is always
   truthy, so the analytics branch was unreachable.
2. **A `reduce` that summed.** The charts engine counted points across series
   with `+` inside a reduce. Counting rather than calculating, but the audit is
   right to be suspicious of an operator in this layer, and rewriting it as a
   `flatMap().length` removed the ambiguity instead of arguing about it.
3. **The audit's own regex was wrong.** The literal-sentence check matched
   across two adjacent string literals on one line, reporting fragments of code
   as untranslated prose. Fixed by splitting each line on the quote character
   and taking the odd segments, which is what actually identifies string
   contents.

And one thing checked and cleared: the Arabic dictionary carries 65 keys English
does not. All of them are `food.*`, and English deliberately falls back to each
record's own `name`. Documented in the dictionary header since phase 15 — not a
defect.


---

## The release

Twenty-two phases built the thing. The twenty-third asked whether it was true.

Phase 23 added no feature, no engine, no page and no abstraction — one test
file, six graph audits, one document and a version bump. Everything else it did
was verification, and the interesting part is what verification turns up when
you finally ask the questions that only make sense across a whole application.

**The one behaviour it found.** An import re-stamps `updatedAt` on every
restored record, because `replaceAll` writes through the model. So a backup
round trip is byte-identical in its *data* and not in its *metadata*. That is
defensible — the stamp means "when this row was last written", and after a
restore that is genuinely now — but it was undocumented, and a round-trip
guarantee with an unstated exception is not a guarantee. Both halves are pinned
by tests now: the data must survive unchanged, and the stamp must change.

**Two audits caught themselves.** The dead-module check flagged
`app/reporting-service.js`, which phase 22 built and deliberately gave no
caller; and the duplicate-ownership check flagged `models/running.js` against
`pages/running.js`, which is the app's naming convention across layers rather
than a problem. Both were audit bugs, not code bugs, and fixing an audit to
stop it lying is worth more than the finding it produced.

**The check worth keeping.** One of the six new graph audits greps `app/` for
the *fingerprints* of duplicated business logic rather than for names: the
Mifflin-St Jeor coefficients, the 4/4/9 macro energy densities, a pace
conversion, an acute:chronic ratio, a one-rep-max estimate. Those are what
appears when someone reimplements an engine one layer up because reaching the
real one felt inconvenient. It finds nothing today. It will find something
eventually, and it will name it.

**What is honest about the ending.** Ten of twelve release gates are green. Two
are amber: accessibility has not been re-tested since phase 14, and no browser
performance figure has been re-measured. Neither is a defect — both are the
absence of a tool, since no browser and no device were available at any point
in this project's construction. `RELEASE_MANIFEST.md` marks every claim as
TESTED, NOT TESTED, ENVIRONMENT LIMITED or KNOWN LIMITATION, and the two amber
gates are stated as conditions on the release rather than rounded up to green.

The app is production ready for the person who wrote it, who is also its only
user and who can close both gaps in an afternoon with a real phone. It is not
production ready for a stranger relying on a screen reader, and the manifest
says so in those words.


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
