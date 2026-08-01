/**
 * training-rules.js — advice about lifting, and about the plan around it.
 *
 * Every rule here appends a draft; none of them replaces another, because a
 * week can need less volume *and* a rest day *and* a different exercise
 * selection at once. What stops that becoming a wall of text is the
 * suppression table in `rules/coach/index.js` and the caps in
 * `COACH.MAX_DAILY` / `MAX_WEEKLY` — trimming happens after ranking, so the
 * thing that survives is the most important one rather than the first one
 * written.
 *
 * No rule computes anything. Volume, strain, adherence and every trend were
 * produced by the engines named in each `sourceEngines`, and the thresholds
 * they are compared against live in constants.js beside the engine that owns
 * them.
 */

import { defineRule } from '../rule.js';
import {
  COACH, COACH_CATEGORY, COACH_SEVERITY, COACH_HORIZON,
  ACHIEVEMENT, PRIORITY,
} from '../../engines/constants.js';

const add = (draft, item) => ({ advice: [...(draft.advice ?? []), item] });

export const trainingRules = [
  defineRule({
    id: 'coach.training.reduce-load',
    name: 'Take the volume down',
    scope: 'coach',
    priority: 100,
    when: (context) => context.poorRecovery && (context.sessionsThisWeek ?? 0) > 0,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'training.reduce-load',
        category: COACH_CATEGORY.TRAINING,
        priority: COACH.PRIORITY.URGENT,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'Cut this week\'s volume',
        summary: `Recovery reads ${context.recoveryStatus} at a strain index of ${context.strainIndex} while ${context.sessionsThisWeek} sessions were completed.`,
        recommendation: 'Drop roughly a third of the working sets this week and keep the loads where they are. Fewer sets at the same weight preserves the stimulus that matters and removes the one that does not.',
        reasoning: `The planner's strain index is at ${context.strainIndex} of 100 and the recovery snapshot calls that ${context.recoveryStatus}. Training through it does not build more — adaptation happens between sessions, and there is currently no room for it to.`,
        evidence: {
          recoveryStatus: context.recoveryStatus,
          strainIndex: context.strainIndex,
          sessionsCompleted: context.sessionsThisWeek,
          avgFatigue: context.fatigue,
        },
        confidence: context.confidence(),
        sourceEngines: ['planner-engine', 'reports-engine'],
        actions: [
          { label: 'Cut sets, keep weight', kind: 'adjust', target: 'volume' },
          { label: 'Log fatigue after each session', kind: 'log', target: 'fatigue' },
        ],
      }),
      message: 'Poor recovery with completed volume is the one combination where doing less is doing more.',
    }),
  }),

  defineRule({
    id: 'coach.training.add-rest-day',
    name: 'Add a rest day',
    scope: 'coach',
    priority: 95,
    when: (context) => (context.strainIndex ?? 0) >= COACH.STRAIN_HIGH &&
      (context.dashboard?.weeklyProgress?.restDays ?? 1) <= 1,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'training.add-rest-day',
        category: COACH_CATEGORY.TRAINING,
        priority: COACH.PRIORITY.HIGH,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'The week has no room in it',
        summary: `A strain index of ${context.strainIndex} with ${context.dashboard?.weeklyProgress?.restDays ?? 0} rest day scheduled.`,
        recommendation: 'Put a full rest day in the middle of the week — not an easy session, a rest day. The planner will redistribute the remaining volume around it.',
        reasoning: `Strain is at ${context.strainIndex} and the plan sets aside ${context.dashboard?.weeklyProgress?.restDays ?? 0} day for recovery. A week with nowhere to recover accumulates fatigue rather than fitness, and the accumulation is invisible until it is not.`,
        evidence: {
          strainIndex: context.strainIndex,
          restDays: context.dashboard?.weeklyProgress?.restDays ?? null,
          gymDays: context.dashboard?.weeklyProgress?.gymDaysPlanned ?? null,
          runningDays: context.dashboard?.weeklyProgress?.runningDaysPlanned ?? null,
        },
        confidence: context.confidence(),
        sourceEngines: ['planner-engine', 'dashboard-engine'],
        actions: [{ label: 'Mark a mid-week day as rest', kind: 'plan', target: 'schedule' }],
      }),
      message: 'A week with one rest day and high strain has no recovery in it.',
    }),
  }),

  defineRule({
    id: 'coach.training.plateau-change-stimulus',
    name: 'Change the stimulus',
    scope: 'coach',
    priority: 85,
    when: (context) => context.enoughForTrendAdvice &&
      (context.found('plateau.oneRepMaxKg') || context.found('plateau.volumeKg')),
    apply: (context, draft) => {
      const finding = context.finding('plateau.oneRepMaxKg') ?? context.finding('plateau.volumeKg');

      return {
        patch: add(draft, {
          key: 'training.plateau-change-stimulus',
          category: COACH_CATEGORY.TRAINING,
          priority: COACH.PRIORITY.HIGH,
          severity: COACH_SEVERITY.WARNING,
          horizon: COACH_HORIZON.WEEKLY,
          title: 'Strength has stopped moving',
          summary: finding.summary,
          recommendation: 'Change one variable, not three: either add a set to the main lift, slow the eccentric, or swap the accessory work. Then hold everything else still for three weeks so the change is readable.',
          reasoning: `${finding.reason} Changing several things at once makes the next three weeks uninterpretable — whatever happens, there is no way to tell which change caused it.`,
          evidence: { ...finding.evidence, weeksAnalysed: context.weeksAnalysed },
          confidence: context.confidence(),
          sourceEngines: ['analytics-engine', 'strength-engine'],
          actions: [
            { label: 'Add one set to the main lift', kind: 'adjust', target: 'volume' },
            { label: 'Hold everything else for three weeks', kind: 'hold', target: 'plan' },
          ],
        }),
        message: 'A plateau the analytics engine already found, turned into one change rather than several.',
      };
    },
  }),

  defineRule({
    id: 'coach.training.hold-the-plan',
    name: 'Do not change anything',
    scope: 'coach',
    priority: 40,
    when: (context) => (context.adherence ?? 0) >= COACH.ADHERENCE_GOOD &&
      !context.poorRecovery &&
      !context.plateauDetected &&
      !context.riskDetected,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'training.hold-the-plan',
        category: COACH_CATEGORY.TRAINING,
        priority: COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.POSITIVE,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'Leave the plan alone',
        summary: `${context.adherence}% adherence, recovery ${context.recoveryStatus}, nothing flagged.`,
        recommendation: 'Change nothing this week. The plan is working and the most common way to stop it working is to improve it.',
        reasoning: `Adherence is ${context.adherence}%, past the ${COACH.ADHERENCE_GOOD}% the coach treats as good; recovery reads ${context.recoveryStatus}; no plateau and no risk were found across ${context.weeksAnalysed} weeks. A programme that is working needs time, not adjustment — and adjusting it now would also destroy the baseline that makes the next change readable.`,
        evidence: {
          adherence: context.adherence,
          recoveryStatus: context.recoveryStatus,
          weeksAnalysed: context.weeksAnalysed,
          plateauDetected: context.plateauDetected,
          riskDetected: context.riskDetected,
        },
        confidence: context.confidence(),
        sourceEngines: ['reports-engine', 'analytics-engine'],
        actions: [{ label: 'Keep the current plan', kind: 'hold', target: 'plan' }],
      }),
      message: 'Nothing is wrong, which is itself worth saying — otherwise the absence of advice reads as an absence of attention.',
    }),
  }),

  defineRule({
    id: 'coach.training.volume-too-low',
    name: 'The sessions are being done but they are small',
    scope: 'coach',
    priority: 60,
    when: (context) => (context.gymAdherence ?? 0) >= COACH.ADHERENCE_GOOD &&
      context.enoughForTrendAdvice &&
      context.declining('volumeKg'),
    apply: (context, draft) => {
      const trend = context.trend('volumeKg');

      return {
        patch: add(draft, {
          key: 'training.volume-too-low',
          category: COACH_CATEGORY.TRAINING,
          priority: COACH.PRIORITY.MEDIUM,
          severity: COACH_SEVERITY.INFO,
          horizon: COACH_HORIZON.WEEKLY,
          title: 'Every session is happening and getting smaller',
          summary: `${context.gymAdherence}% of sessions completed while tonnage falls ${Math.abs(trend.perWeek)} kg per week.`,
          recommendation: 'Before adding sessions, check whether the sets being logged match the sets being prescribed. Showing up and cutting the session short is a different problem from not showing up, and it needs a different fix.',
          reasoning: `Attendance is ${context.gymAdherence}% but the tonnage the strength engine measures has fallen ${Math.abs(trend.perWeek)} kg per week across ${trend.weeks} weeks. Those two facts together usually mean sessions are being started and abandoned rather than skipped.`,
          evidence: {
            gymAdherence: context.gymAdherence,
            volumePerWeek: trend.perWeek,
            weeks: trend.weeks,
            first: trend.first ?? null,
            last: trend.last ?? null,
          },
          confidence: context.confidence(),
          sourceEngines: ['analytics-engine', 'reports-engine'],
          actions: [{ label: 'Compare logged sets against prescribed', kind: 'review', target: 'sessions' }],
        }),
        message: 'High attendance with falling tonnage is a distinct problem from low attendance.',
      };
    },
  }),

  defineRule({
    id: 'coach.training.deload-expectations',
    name: 'It is a deload week',
    scope: 'coach',
    priority: 50,
    when: (context) => context.deloadWeek,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'training.deload-expectations',
        category: COACH_CATEGORY.TRAINING,
        priority: COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'This week is meant to feel easy',
        summary: `The planner set week ${context.dashboard?.weekNumber} as a deload at ${context.dashboard?.weeklyProgress?.volumeFactor} of normal volume.`,
        recommendation: 'Do the reduced volume as written and resist adding to it. A deload that gets topped up is not a deload.',
        reasoning: `The planner scheduled this week at a volume factor of ${context.dashboard?.weeklyProgress?.volumeFactor}. The point is to let accumulated fatigue clear so the following weeks can be hard — sessions that feel too easy this week are the plan working, not a wasted week.`,
        evidence: {
          weekNumber: context.dashboard?.weekNumber ?? null,
          volumeFactor: context.dashboard?.weeklyProgress?.volumeFactor ?? null,
          strainIndex: context.strainIndex,
        },
        confidence: context.todayConfidence(),
        sourceEngines: ['planner-engine'],
        actions: [{ label: 'Do the reduced volume as written', kind: 'hold', target: 'plan' }],
      }),
      message: 'A deload is only useful if it is not quietly undone.',
    }),
  }),

  defineRule({
    id: 'coach.training.session-today',
    name: 'Today has a session in it',
    scope: 'coach',
    priority: 45,
    when: (context) => context.hasWorkoutToday && !context.poorRecovery,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'training.session-today',
        category: COACH_CATEGORY.TRAINING,
        priority: context.dashboard?.workout?.priority === PRIORITY.ESSENTIAL
          ? COACH.PRIORITY.HIGH : COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.DAILY,
        title: context.dashboard.workout.goal,
        summary: `${context.dashboard.workout.exercises} exercises, about ${context.dashboard.workout.estimatedMinutes} minutes.`,
        recommendation: 'Log each set as it happens rather than from memory afterwards. Progression reads what was logged, so a session recalled at the end of the day is a session guessed at.',
        reasoning: `The workout engine built this session for today and the planner rated it priority ${context.dashboard.workout.priority} of 3. Every load next week is derived from what gets recorded today.`,
        evidence: {
          exercises: context.dashboard.workout.exercises,
          estimatedMinutes: context.dashboard.workout.estimatedMinutes,
          priority: context.dashboard.workout.priority,
          recoveryStatus: context.recoveryStatus,
        },
        confidence: context.todayConfidence(),
        sourceEngines: ['workout-engine', 'dashboard-engine'],
        actions: [{ label: 'Log sets as you go', kind: 'log', target: 'session' }],
      }),
      message: 'Today\'s session, with the one instruction that changes next week.',
    }),
  }),

  defineRule({
    id: 'coach.training.record-set',
    name: 'A record was set',
    scope: 'coach',
    priority: 35,
    when: (context) => context.achieved(ACHIEVEMENT.PERSONAL_BEST) ||
      (context.report?.gym?.records ?? []).length > 0,
    apply: (context, draft) => {
      const records = context.report?.gym?.records ?? [];

      return {
        patch: add(draft, {
          key: 'training.record-set',
          category: COACH_CATEGORY.TRAINING,
          priority: COACH.PRIORITY.LOW,
          severity: COACH_SEVERITY.POSITIVE,
          horizon: COACH_HORIZON.WEEKLY,
          title: `${records.length || 1} record${records.length === 1 ? '' : 's'} this week`,
          summary: records.length
            ? records.slice(0, 3).map((record) => `${record.exerciseId ?? record.exercise}: ${record.value}`).join(', ')
            : 'The reports engine registered a personal record.',
          recommendation: 'Do not chase another one next week. A record is the output of the weeks before it, and hunting them weekly is how a programme turns into a series of maximum attempts.',
          reasoning: 'The execution engine detected this against the previous best it holds, and the reports engine awarded it. Records arrive from accumulated work rather than from being aimed at.',
          evidence: {
            records: records.length || 1,
            examples: records.slice(0, 3).map((record) => record.exerciseId ?? record.exercise ?? null),
            adherence: context.adherence,
          },
          confidence: context.confidence(),
          sourceEngines: ['execution-engine', 'reports-engine'],
        }),
        message: 'A record is worth naming and worth not chasing.',
      };
    },
  }),
];

export const planningRules = [
  defineRule({
    id: 'coach.planning.generate-week',
    name: 'There is no plan',
    scope: 'coach',
    priority: 100,
    when: (context) => !context.hasPlan,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'planning.generate-week',
        category: COACH_CATEGORY.PLANNING,
        priority: COACH.PRIORITY.URGENT,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.DAILY,
        title: 'No week has been planned',
        summary: `${context.missing.length} of the engines the coach reads produced nothing, because there is no plan for them to read.`,
        recommendation: 'Generate a week. Everything else here — the sessions, the targets, the trends — is derived from a plan, and without one there is nothing to be advised about.',
        reasoning: `No plan reached the dashboard for ${context.date ?? 'today'}. This is the first thing to fix rather than one of several, because every other engine is downstream of it.`,
        evidence: {
          date: context.date,
          missingInputs: context.missing.map((gap) => gap.input),
          hasProfile: context.available.profile,
        },
        confidence: context.todayConfidence(),
        sourceEngines: ['dashboard-engine'],
        actions: [{ label: 'Generate this week', kind: 'plan', target: 'week' }],
      }),
      message: 'Nothing downstream of a plan can be advised on without one.',
    }),
  }),

  defineRule({
    id: 'coach.planning.time-mismatch',
    name: 'The session is longer than the window',
    scope: 'coach',
    priority: 70,
    when: (context) => context.requiredMinutesToday !== null &&
      context.availableMinutes !== null &&
      context.requiredMinutesToday > context.availableMinutes,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'planning.time-mismatch',
        category: COACH_CATEGORY.PLANNING,
        priority: COACH.PRIORITY.MEDIUM,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.DAILY,
        title: 'Today asks for more time than there is',
        summary: `${context.requiredMinutesToday} minutes planned against ${context.availableMinutes} available.`,
        recommendation: 'Cut the accessory work rather than the main lift, and cut it before starting rather than halfway through. A session planned to fit gets finished; a session abandoned at the two-thirds mark teaches progression the wrong thing.',
        reasoning: `The engines together estimate ${context.requiredMinutesToday} minutes — the session, the run and the cooking — against the ${context.availableMinutes} the profile states. The estimate assumes nothing overlaps, so it is the pessimistic reading, but the gap is wide enough to plan around.`,
        evidence: {
          requiredMinutes: context.requiredMinutesToday,
          availableMinutes: context.availableMinutes,
          hasWorkout: context.hasWorkoutToday,
          hasRun: context.hasRunToday,
        },
        confidence: context.todayConfidence(),
        sourceEngines: ['dashboard-engine', 'workout-engine'],
        actions: [{ label: 'Trim accessory work before starting', kind: 'adjust', target: 'session' }],
      }),
      message: 'A session trimmed in advance beats one abandoned partway.',
    }),
  }),

  defineRule({
    id: 'coach.planning.state-equipment',
    name: 'Equipment has not been stated',
    scope: 'coach',
    priority: 30,
    when: (context) => context.available.settings &&
      (context.availableEquipment ?? []).length === 0,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'planning.state-equipment',
        category: COACH_CATEGORY.PLANNING,
        priority: COACH.PRIORITY.LOW,
        severity: COACH_SEVERITY.INFO,
        horizon: COACH_HORIZON.WEEKLY,
        title: 'The app does not know what you can train with',
        summary: 'No equipment is listed in settings.',
        recommendation: 'List what is actually available. The workout engine currently assumes a full gym, so a plan may be prescribing exercises you cannot do.',
        reasoning: 'Settings hold an empty equipment list, which the workout engine reads as "not stated" and therefore as unrestricted. Every exercise it selects is drawn from the whole database rather than from what is reachable.',
        evidence: {
          equipmentListed: 0,
          restrictedMovements: (context.restrictedMovements ?? []).length,
          sessionsThisWeek: context.sessionsThisWeek,
        },
        confidence: context.todayConfidence(),
        sourceEngines: ['workout-engine'],
        actions: [{ label: 'List available equipment', kind: 'settings', target: 'equipment' }],
      }),
      message: 'An unstated constraint is read as no constraint.',
    }),
  }),

  defineRule({
    id: 'coach.planning.review-after-warnings',
    name: 'Several warnings at once',
    scope: 'coach',
    priority: 75,
    when: (context) => (context.warnings ?? []).length >= 3,
    apply: (context, draft) => ({
      patch: add(draft, {
        key: 'planning.review-after-warnings',
        category: COACH_CATEGORY.PLANNING,
        priority: COACH.PRIORITY.HIGH,
        severity: COACH_SEVERITY.WARNING,
        horizon: COACH_HORIZON.WEEKLY,
        title: `${context.warnings.length} warnings in one week`,
        summary: context.warnings.slice(0, 4).map((warning) => warning.type).join(', ') + '.',
        recommendation: 'Do not try to fix all of them. Pick the one highest on this list and hold everything else still — several simultaneous corrections make the next week impossible to read, and they usually share a single cause anyway.',
        reasoning: `The reports engine raised ${context.warnings.length} warnings: ${context.warnings.map((warning) => warning.type).join(', ')}. Warnings this numerous are normally one problem seen from several angles — under-eating shows up as poor recovery, low volume and a stalled scale at the same time.`,
        evidence: {
          warningCount: context.warnings.length,
          types: context.warnings.map((warning) => warning.type),
          adherence: context.adherence,
          recoveryStatus: context.recoveryStatus,
        },
        confidence: context.confidence(),
        sourceEngines: ['reports-engine'],
        actions: [{ label: 'Fix one thing, hold the rest', kind: 'hold', target: 'plan' }],
      }),
      message: 'Many warnings usually mean one cause, and fixing everything at once hides which.',
    }),
  }),
];
