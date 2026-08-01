# Foundation — Training

A personal training and nutrition tracker, built as an installable PWA.
No frameworks, no build step: HTML5, CSS3, and ES modules only.

**Status: 1.0.0 — production ready.** See [REPORT.md](REPORT.md) for the full
audit: architecture, performance, security, accessibility and known limits. App shell, routing, data layer, calculation
engines, weekly planner, content databases, a workout engine that builds the week,
an execution engine that tracks what was actually done and feeds it back, a
running engine that builds, tracks and measures the endurance side, and a
nutrition engine that sets the intake targets, a meal planning engine that
turns them into food, and an application layer that orchestrates all of it,
and a UI that consumes it. The interface holds no business logic.

---

## Requirements

Any static file server. The app uses ES modules and a service worker, so it
must be served over `http://localhost` or `https://` — opening `index.html`
directly with `file://` will not work.

## Run locally

```bash
cd fitness-app
python3 -m http.server 8000
# then open http://localhost:8000
```

Alternatives: `npx serve .` or the VS Code "Live Server" extension.

## Install on iPhone

1. Serve the folder on your machine, or deploy it (GitHub Pages, Netlify,
   Vercel — any static host with HTTPS).
2. Open the URL in **Safari** (not Chrome — only Safari can install on iOS).
3. Share → **Add to Home Screen**.
4. Launch from the home screen: full screen, no browser chrome, works offline.

## Structure

```
fitness-app/
├── index.html            App shell markup
├── style.css             Stylesheet entry point (imports styles/*)
├── script.js             JavaScript entry point (imports scripts/*)
├── manifest.json         PWA metadata: name, icons, colours, display mode
├── service-worker.js     Offline cache for the app shell
├── styles/               tokens, themes, base, layout, components, transitions
├── scripts/
│   ├── config.js         App constants, base path, storage keys
│   ├── storage.js        LocalStorage engine (repositories only)
│   ├── router.js         pushState router with page transitions
│   ├── routes.js         Route table — the navigation source of truth
│   ├── theme.js          Dark / light / system theme manager
│   ├── dom.js            el(), icon(), clear() helpers
│   └── pwa.js            Service worker registration
├── pages/                one module per route
├── components/           Card, Button, Modal, ProgressRing, StatCard,
│                         Header, BottomNavigation, Field, Choice, Toast
├── models/               shape + rules for each record type
├── validators/           rules, schema factory, error types
├── repositories/         the only code allowed to touch storage
├── services/             logic spanning several repositories
├── events/               the shared event bus and its vocabulary
├── engines/              pure calculation: no storage, no events, no DOM
│   ├── constants.js      every tunable number in the app
│   ├── formula.js        formula metadata + replaceable slots
│   ├── calculation-engine.js   arithmetic only, no domain knowledge
│   ├── energy-engine.js  BMR, TDEE, macro targets
│   ├── body-engine.js    BMI, body fat, weight trend
│   ├── strength-engine.js  volume, one-rep max
│   ├── running-engine.js   pace, speed, energy cost
│   ├── adjustment-engine.js  calorie adjustment, always with a reason
│   ├── plan-context.js   raw records → the facts the rules read
│   ├── planner-engine.js builds one WeeklyPlan; imports no UI, no storage
│   ├── workout-context.js  raw records → the facts the workout rules read
│   ├── workout-engine.js builds one WorkoutWeek; holds no programme
│   ├── execution-engine.js  tracks a lifting session; pure state machine
│   ├── session-state.js  the state machine both execution engines share
│   ├── running-context.js   raw runs → the facts the running rules read
│   ├── running-program-engine.js   builds one RunningWeek
│   ├── running-progress-engine.js  read-only metrics over the run history
│   ├── running-execution-engine.js tracks one run against its plan
│   ├── nutrition-context.js  derives goal, energy, trend and training load
│   ├── nutrition-engine.js   builds one NutritionWeek; chooses no food
│   ├── meal-context.js       budget, constraints and the eligible food pool
│   └── meal-planning-engine.js  builds one MealPlanWeek from the targets
├── rules/                planning policy, one file per domain
│   ├── workout/          workout policy: split, volume, selection, overload,
│   │                     equipment, injury, corrective, recovery
│   ├── execution/        completion verdicts, failure detection, records
│   ├── running/          session type, distance load, recovery, progression
│   ├── nutrition/        calories, macros, bulk, cut, refeed, diet break,
│   │                     recovery, hydration and the safety floors
│   └── meals/            food priority, selection, distribution, timing,
│                         appetite, budget, replacement and safety
│   ├── rule.js           defineRule, selectOne, applyAll
│   ├── phase-rules.js    which training block the week belongs to
│   ├── recovery-rules.js how far to pull the week back
│   ├── gym-rules.js      how many lifting days, how hard
│   ├── running-rules.js  how much running the week can carry
│   └── nutrition-rules.js  calorie, protein and water targets
├── data/                 content, queried by taxonomy — never by name
│   ├── taxonomy.js       the vocabulary engines ask in
│   ├── exercises/        98 records + the ExerciseDB query surface
│   ├── foods/            65 records + the FoodDB query surface
│   └── i18n/             labels only; ids stay English
├── app/                  orchestration only — no business logic
│   ├── planning-service.js   the seven-step week pipeline
│   ├── dashboard-service.js  today, assembled from every engine
│   ├── progress-service.js   everything that has changed
│   ├── recovery-service.js   existing numbers, given a label
│   ├── report-service.js     closing a week
│   ├── sync-service.js       storage and cache boundary
│   ├── notification-engine.js  events → notifications
│   ├── cache.js              named caches with event invalidation
│   ├── queries.js            getToday(), getCurrentWeek(), …
│   └── wiring.js             the event chains between services
├── pages/                one module per route, presentation only
├── components/           Card, Button, Form, ReasonList, states, …
└── tests/                655 tests (27 need a browser)
└── assets/
    ├── icons/            App icons (192, 512, maskable, apple-touch)
    └── images/           Background grain texture
```

## Conventions

- All colours, sizes and durations come from `styles/tokens.css`. No literal
  hex values anywhere else.
- All storage keys come from `KEYS` in `scripts/config.js`. No string literals.
- **Only repositories import `scripts/storage.js`.** Pages and services go
  through a repository; that rule is what makes the storage engine swappable.
- Validation lives in `models/`, once. Forms reuse the same rules, so nothing
  can be accepted in the UI that the model would reject.
- Every mutation saves immediately and emits an event. There is no Save button.
- One module, one responsibility. `script.js` only boots; it holds no features.
- Bump the version in **both** `scripts/config.js` and `service-worker.js`
  when releasing, or browsers will keep serving the old cached shell.

## Tests

```bash
npm test              # runs under Node — engines are pure, no DOM needed
```

Or open `tests/index.html` in a browser for the same suite with a readable
report. Both databases are checked for schema validity, duplicate ids, broken
alternative links and macro/calorie consistency on every run. The planner is
covered by six lived-in scenarios — two training days,
six training days, back from a trip, short on sleep, weight not moving, weight
moving too fast — plus invariants that must hold for any plan. Every formula is covered for normal values, boundaries and invalid
input, and `regression.test.js` locks in the Phase 1–3 numbers so a refactor
cannot quietly change them.

## Calculation rules

- Engines are pure. They never read storage, emit events or touch the DOM.
- `calculation-engine.js` knows arithmetic and nothing about training. Domain
  engines build on it; it builds on nothing.
- Every equation is a `Formula` with a name, a citation, an accuracy label
  (`exact` or `estimate`) and a note on when to use it.
- Any formula can be swapped at runtime: `bmrFormula.use('katch-mcardle')`.
  No engine, service or page changes.
- Every number that can be argued about lives in `engines/constants.js`.
- A decision always comes with a reason string and the evidence behind it.
  If it cannot be explained, it is not made.

## How the planner decides

The planner runs five stages. Each reads what the last decided; none of them
contains a branch about another domain.

```
records ─▶ createPlanContext ─▶ 1. phase rules     selectOne — one wins
                                2. recovery rules  applyAll  — they stack
                                3. gym rules       applyAll
                                4. running rules   applyAll
                                5. nutrition rules applyAll
                                        │
                                        ▼
                                   layout: counts → 7 dated days
                                        │
                                        ▼
                                   WeeklyPlan { days, reasons[], notes[] }
```

`createPlanContext` does all the derivation once — week number, available days,
strain index, weight trend, layoff length — so rules read flat facts and stay
one-liners. Every rule that fires appends a sentence to `plan.reasons`, and a
rule that returns a decision without a message is dropped rather than applied.

### Adding a rule

Write it in the file for its domain. Nothing else changes.

```js
// rules/recovery-rules.js
defineRule({
  id: 'recovery.illness',
  name: 'Back off while ill',
  scope: 'week',
  priority: 85,                       // higher runs first
  when: (context) => context.recovery.score <= 2,
  apply: () => ({
    patch: { volumeFactor: 0.5, intensityCap: 'easy' },
    message: 'Volume is halved this week because you rated recovery 2 out of 10.',
  }),
});
```

### Adding a phase

Add the name to `PHASE` and its length to `PLANNER.PHASE_LENGTH_WEEKS` in
`engines/constants.js`, give it a share in `GYM_SHARE_BY_PHASE`, then add one
rule to `phase-rules.js` that selects it. The focus text lives in
`GYM_FOCUS` in the planner.

### Replacing the planner

Two levels, both without touching a page:

```js
// swap one set of rules
PlannerEngine.plan(input, { ruleSets: { ...DEFAULT_RULE_SETS, gym: myGymRules } });

// swap the entire planner
plannerSlot.register(myPlanner);   // any object with the Formula shape
plannerSlot.use('my-planner');
```

`PlannerService` is the only thing that knows both the planner and the
repositories. The engine itself imports no storage, no events and no UI — the
test suite runs it under Node with no browser at all.

## The databases

An engine asks by property, never by name:

```js
ExerciseDB.query({ movement: 'horizontal_push', category: 'compound',
                   equipment: ['barbell', 'bench'] });

FoodDB.query({ mealType: 'breakfast', maxCookingMin: 5, maxPriceMadPerKg: 20 });
FoodDB.proteinValue({ minProteinG: 15 });   // cheapest protein first
```

`equipment` on a record lists what is **required** — a barbell bench press
needs a barbell *and* a bench. `equipmentAny` lists interchangeable options —
a goblet squat takes a dumbbell *or* a kettlebell. Keeping them apart is what
makes "what can I do with only a band?" return the right answer.

### Changing content

- **Swap an exercise**: edit the record in `data/exercises/`. No code changes.
- **Add a food**: add one entry to a file in `data/foods/`. Export and import
  pick it up automatically.
- **Add a language**: add a file to `data/i18n/` and register it. Records are
  never touched — ids are data, labels are presentation.

### On the numbers

Food macros are reference values per 100 g from standard composition tables.
**Prices are estimates in MAD/kg and the least reliable field in the project.**
Every record carries `priceConfidence: 'estimate'`; set it to `'checked'` with
a `priceUpdated` date once you have verified one against a real shop.
`FoodDB.priceReliability()` reports how much has been checked.

No exercise media is shipped and no third-party media URL appears in any
record — see `assets/exercises/README.md` for why and what to do instead.

## How the workout engine decides

```
WeeklyPlan ─┐
Profile ────┼─▶ createWorkoutContext ─▶ 1. split      one wins
Settings ───┤                           2. equipment  stack
History ────┘                           3. injury     stack
                                        4. volume     stack
                                        5. recovery   stack
                                        6. corrective stack
                                              │
                          per slot ──▶ criteria rules ──▶ ExerciseDB.query
                                              │                  │
                                              └── rank ◀──────────┘
                                              │
                       per exercise ──▶ overload rules  one wins
                                              │
                                        fit to the clock
                                              ▼
                                   WorkoutWeek { days, reasons[] }
```

**Selection.** A slot is a movement pattern plus an optional muscle target.
Criteria rules turn it into a database query — pattern, category, difficulty
ceiling, available equipment, exclusions — and the ranking picks among what
comes back. No exercise is named anywhere in the engine.

**Rotation cuts both ways.** The first two slots of a session prefer
*continuity*: progressive overload is measured against the same lift, so
rotating the squat away throws out the only record of whether it is moving.
Accessories prefer *variation*, which keeps the work fresh at no cost to
progression.

**Volume.** Weekly working sets per muscle come from the level (beginner 10,
intermediate 14, advanced 18 as a target) scaled by the phase. Secondary work
counts at half a set. After the week is built it is audited: any muscle under
the minimum or over the ceiling produces a reason saying so.

**Overload.** One instruction per exercise, judged against logged sets: reached
the top of the rep range at or below target RPE → add load; inside the range →
add a rep; last session above RPE 9 → hold; three sessions without beating the
best → back off 10%; deload week → 80% load, 60% sets; no history → no load
prescribed, and the engine says why.

**Time.** Warm-up and cool-down scale with the session. If the work still
overruns, sets are trimmed across the session before any exercise is dropped —
and both kinds of cut are explained.

**Substitution.** Restricted movement patterns never reach the database.
Excluded exercise ids are filtered out. What remains is whatever the equipment
allows, so a bodyweight-only week still fills every slot it can.

### Extending it

- **A new rule**: add it to the right file in `rules/workout/`. It runs.
- **A new exercise type**: add records to `data/exercises/` with the right
  `movement` and `type`. If it needs a new pattern, add it to `taxonomy.js` and
  reference it from a split template.
- **A new split**: add a template to `split-rules.js` and one rule that selects
  it.
- **Replacing the engine**: `workoutSlot.register(mine); workoutSlot.use('mine')`,
  or pass `{ ruleSets }` to `WorkoutEngine.build()` to swap one set of rules.
  `WorkoutPlanService` is the only thing that knows both the engine and the
  repositories.

### Reasons are data

Every exercise carries `reason` (why it was chosen, with the score components
and the query that found it) and `progression` (the action, the previous
session, and why). `WorkoutEngine.allReasons(week)` flattens the lot. A report
generator or a coaching layer reads those objects — it never re-derives the
logic.

## How execution tracking works

The execution engine generates nothing. It takes a `WorkoutDay` from the
workout engine and records what happened against it.

```
WorkoutDay ──▶ sessionFromDay ──▶ planned
                                     │ start
                                     ▼
                  logSet / skipExercise ⇄ pause ⇄ resume
                                     │ complete | cancel
                                     ▼
              completion rules ─▶ verdict      (one wins)
              failure rules    ─▶ may progression build on it
              PR rules         ─▶ load / e1RM / volume records
                                     ▼
                       WorkoutSession { feedback, records, reasons[] }
                                     │ toGymRecords()
                                     ▼
                          WorkoutRepository ──▶ next week's engine
```

**Pure.** Every operation takes a session and returns a *new* session plus the
events that occurred. The engine never stores or emits; `ExecutionService`
does both. That is what makes a whole session replayable in a test.

**Planned versus actual.** Each exercise carries both: `plannedSets` beside
`completedSets`, `plannedWeightKg` beside `actualWeightKg`, `plannedRpe`
beside `actualRpe`. Nothing is overwritten, so the comparison is always
available and the feedback report is derived, not stored.

**Failure.** A set two or more reps under target is a failed set, not a light
one. An exercise where at least half the sets failed is a failed exercise, and
it is marked `progressionEligible: false` — which is the point of the whole
file. Without it, a session where every set fell short would read to next
week's engine as "top of the range reached" and it would add weight on top of
a miss. One exception, and it is explained: if only the *last* set fell short,
that is ordinary within-session fatigue and the load still progresses.

**Records.** Three kinds, because they mean different things: heaviest load,
best estimated one-rep max, and most tonnage in a session. Only completed sets
are eligible — a missed rep is not a best. The e1RM record is flagged
`estimated: true`, because it comes from a formula rather than a lift.

**Closing the loop.** `toGymRecords()` turns a finished session into rows for
`WorkoutRepository`, each carrying its `status`. `createWorkoutContext` then
excludes failed sets from the reps it reads, and an overload rule holds the
load when the last session missed. Skipping a session writes nothing at all —
the engine will not guess at what would have happened.

## How the running engine decides

```
WeeklyPlan ──┐
Profile ─────┼──▶ createRunningContext ──▶ 1. recovery   intensity ceilings
Run history ─┤                             2. load       weekly distance
WorkoutWeek ─┘                             3. impact     effect on lifting
                                           4. progression is it improving
                                                  │
                              per slot ──▶ session-type rules  (one wins)
                                                  │
                                    normalise shares, fit to the clock
                                                  ▼
                                   RunningWeek { sessions, reasons[] }
```

**Session type.** One rule wins per slot, ordered so the overrides sit
highest: an easy-only week beats everything; a complete beginner walks; the
last slot of a multi-run week is the long run; hard sessions do not appear at
all until about four weeks of consistent running, and never more than two in a
week.

**Distance.** The budget starts from what was *actually run* last week, not
from a table, and rises by at most 10%. That ceiling is a widely taught
convention rather than a proven injury threshold, and the engine says so. A
deload, a layoff, an acute load spike or a demanding lifting week each cut it,
with a reason. Each session's share is normalised across the types chosen, so
a week with one run spends the whole budget on it rather than a quarter.

**Load.** Session load is minutes × session RPE (Foster's method). The acute
seven-day total is compared to the chronic 28-day average; outside 0.8–1.3 the
week is eased and told why.

**Pace.** Derived from the *median* pace of logged easy runs — a median
because one interval session logged as a run would drag a mean down and make
every prescription too fast. With nothing logged the pace is a stated guess.

**Heart rate.** Zones are a share of an estimated maximum (Tanaka). Both the
estimate and the zones are flagged `estimated: true`; the maximum can be ten
beats either way for an individual.

**Effect on the planner and the lifting engine.** The planner already decides
*how many* running days from the weight trend; this engine decides what they
are. It reads the lifting week's strain and eases when lifting is heavy, and
publishes `recoveryImpact` so the cost is visible rather than implied. Logged
runs flow back through `RunningService` into the planner's strain calculation
and the progress metrics.

## How the nutrition engine decides

```
Profile ────┐
WeeklyPlan ─┤
WorkoutWeek─┼─▶ createNutritionContext ─▶ 1. diet break   whole week at maintenance?
RunningWeek─┤                             2. refeed       one day at maintenance?
Weight hist─┤                             3. calories     the daily target
Sessions ───┘                             4. macros       protein, fat, carbs, fibre
                                          5. recovery     extra fuel if needed
                                          6. goal         rate expectations
                                          7. hydration    fluid and sodium
                                          8. safety       floors and caps, last
                                                 ▼
                                   NutritionWeek { days, reasons[] }
```

**Calories.** The baseline is `EnergyEngine.target()` — the same call the app
has used since phase 4, not a second implementation. The correction against
the scale is `AdjustmentEngine.evaluate()`, also unchanged; this engine applies
its decision and carries its reason forward rather than re-deriving one. That
is why `adjustment.source` reads `adjustment-engine`.

**Macros.** Protein and fat are set per kilogram of body weight and hold
steady across the week. Carbohydrate takes whatever energy is left, which is
what makes it the macro that moves with training and with rest days.

**Daily shaping.** Training days take more and rest days less, using the same
cycling convention the planner already applies, so the week still averages the
target exactly. A day with both lifting and running is the largest
carbohydrate day.

**Refeed and diet break.** A refeed is one day at maintenance, carbohydrate
led, offered from the third week of a deficit or sooner if recovery is poor. A
diet break is a full week at maintenance, due after ten weeks or earlier when
progress and recovery have both stalled. A break replaces a refeed rather than
stacking with it. The engine states plainly that the metabolic claims made for
refeeds outrun the evidence.

**Safety.** Runs last and only ever moves numbers to safer values: never below
resting metabolism, never more than 25% under maintenance or 20% over, protein
never under 1.6 g/kg, fat never under 0.5 g/kg or a fifth of energy, and no
week-on-week change larger than 300 kcal. When a floor fires, the week says so.

**Adding a goal.** Add the name to `NUTRITION_GOAL`, a surplus or deficit
fraction to `GOAL_ADJUSTMENT`, a rate to `ADJUSTMENT.TARGET_RATE_FRACTION`, and
protein and fat entries to `MACROS`. No rule and no engine changes.

**Replacing the engine.** `nutritionSlot.register(mine); nutritionSlot.use('mine')`,
or pass `{ ruleSets }` to `NutritionEngine.build()` to swap one set of rules.
`NutritionPlanService` is the only thing that knows both the engine and the
repositories.

## How the meal engine decides

```
NutritionWeek ─┐
Settings ──────┼─▶ createMealContext ─▶ per day: 1. distribution  how many meals
FoodDB ────────┤                                 2. appetite      density vs volume
WorkoutWeek ───┤                                 3. budget        the allowance
RunningWeek ───┘                                 4. timing        where carbs sit
                                                        │
                                    per meal ──▶ protein anchor → carbs → fat → fibre
                                                        │
                                                  repair pass
                                                        │
                                                 5. safety checks
                                                        ▼
                                        MealPlanWeek { days, meals, reasons[] }
```

**It calculates nothing nutritional.** Every target is read from the
NutritionWeek. `day.targets` is that object, untouched.

**Food selection is by property, never by name.** A role — protein anchor,
carbohydrate source, fat, fibre — becomes a query against the database, and
the candidates are scored on macro density per calorie, cost, preparation
time, availability, how often the food has already been used this week, and
whether it suits the time of day. The weights live in `food-priority.js`.

**The solver is greedy, and says so.** It anchors a meal on protein, fills
carbohydrate, then fat, then fibre — each sized against what the previous ones
left. That overshoots, because a bread portion brings protein with it, so a
repair pass scales the portions back toward the target. What remains is
reported as **macro accuracy**, weighted double on protein, rather than
hidden. Around 90% is typical; a plan claiming to be exact would be lying.

**Portions are practical.** Rounded to 5, 10 or 25 g by food group, and to
whole units for countable foods — three eggs, not 137 g of egg. Every portion
stays inside bounds for its group, so nothing prescribes 800 g of olive oil.

**Budget.** A stated daily or monthly figure, or an assumption from the budget
level with a note saying so. When the cheapest possible version of a day still
costs more than 60% of the allowance, price starts outranking variety. When a
day cannot be built inside the budget at all, the engine says exactly that,
by how much, and reminds you the prices are estimates.

**Replacement.** A food is swapped when it is excluded, unavailable, too
expensive or used too often. The replacement keeps the role and the swap
records what it replaced and why.

**Extending it.** A new meal slot: add it to `MEAL_SLOT`, give it food types
in `SLOT_FOOD_TYPES`, and put it in a shape in `MEAL_SHAPES`. A new food: one
record in `data/foods/`. Replacing the engine:
`mealSlot.register(mine); mealSlot.use('mine')`, or pass `{ ruleSets }` to
`MealPlanningEngine.build()`.

## How it all connects

```
                    ┌─────────────── consumers (UI, tests, CLI) ───────────────┐
                    │                    App.query.*                            │
                    └──────────────────────────┬──────────────────────────────┘
                                               ▼
  app/  PlanningService · DashboardService · ProgressService · RecoveryService
        ReportService · SyncService · NotificationEngine · Cache · Queries
                                               │  reads only
                                               ▼
  services/  Planner · WorkoutPlan · RunningProgram · NutritionPlan · MealPlan
             Execution · Weight · Backup                (storage boundary)
                                               ▼
  engines/   planner · workout · execution · running · nutrition · meals
             calculation · energy · body · strength · adjustment
                                               ▼
  rules/ · models/ · repositories/ · data/ · events/
```

**The pipeline is an order, not a preference.** Each engine consumes what the
one before produced, so `PlanningService.generateWeek()` runs planner →
workout → running → nutrition → meals → storage → events. Out of order it does
not fail loudly; it silently plans against stale numbers.

**Nothing calls anything sideways.** The chains between services are bus
subscriptions in `wiring.js`. A completed session emits an event; the caches
for the dashboard, progress and recovery clear; the next read rebuilds. The
rebuild is lazy because a snapshot nobody asked for is work nobody needed.

**The cache is a registry, not a mechanism.** The memoisation with event-driven
invalidation already existed in the calculation engine. `app/cache.js` names
those caches so they can be listed, inspected and cleared in one place.

**The application layer computes nothing.** `RecoveryService` reads the strain
index the planner's context already produced and applies a threshold to label
it. `ProgressService` reads what the weight, workout, running and nutrition
services measured. `DashboardService` reads today's slice of each. If a query
needed a calculation, that calculation would belong in the engine that owns the
subject.

**Adding an engine later.** Give it a service that fetches its inputs and
caches its output on the events that invalidate it, add a step to `PIPELINE`
in the right position, register its cache, and add a query. No existing service
changes, because none of them know about each other.

## How the UI works

```
pages/ + components/          presentation only
        │  imports only from app/, components/ and scripts/
        ▼
app/    Queries · Actions · Forms · PlanningService · …
        ▼
services/ → engines/ → rules/ → repositories/ → storage
```

**The boundary is checkable, not just a convention.** No file in `pages/` or
`components/` imports a repository, an engine, a rule or a service. Everything
goes through `app/`: `Queries` to read, `Actions` to do, `Forms` to edit.

**Live updates.** A page subscribes to the bus in `mount()` through
`pages/_live.js`, and unsubscribes in `unmount()`. When something is logged the
page re-reads from the application layer — it holds no state of its own, so
there is nothing to keep in sync.

**Forms.** `app/forms.js` declares each form: field, label, type, unit and the
validation rule the *model* already declares. The `Form` component builds the
inputs and submits through `Forms.save()`, which routes to a service. If a
value is rejected, it was rejected by the model, and the message shown is the
model's.

**Reasons everywhere.** Every engine attaches explanations to what it decided.
`ReasonList` renders them verbatim. If a reason reads badly, that is wording to
fix in the rule, not in the screen.

**Adding a page.** Write `pages/name.js` with `render()`, `mount()`,
`unmount()`, add one entry to `scripts/routes.js`, and add it to the service
worker's precache list. **Adding a widget:** a factory in `components/` that
takes options and returns an element, plus a section in
`styles/components.css`. **Changing the design:** edit `styles/tokens.css` and
`styles/themes.css` — no page references a colour directly.

## Roadmap

| Phase | Scope |
| ----- | ----- |
| 1 | App shell, design system, storage engine, offline — **done** |
| 2 | Routing, pages, components, theme system — **done** |
| 3 | Models, repositories, services, events, wizard, backup — **done** |
| 4 | Calculation engines, formula registry, test suite — **done** |
| 5 | Weekly planner engine and rules — **done** |
| 6 | Exercise and food databases — **done** |

| 7 | Workout Engine — composes sessions from ExerciseDB — **done** |
| 8 | Execution Engine — tracks sessions, detects records — **done** |
| 9 | Running Engine — builds, tracks and measures running — **done** |
| 10 | Nutrition Engine core — targets only, no food — **done** |
| 11 | Meal Planning Engine — composes meals from FoodDB — **done** |
| 12 | Application layer — orchestration, queries, notifications — **done** |
| 13 | UI layer — nine pages, forms, live updates — **done** |
| 14 | Hardening — audit, logging, performance, security — **done** |
