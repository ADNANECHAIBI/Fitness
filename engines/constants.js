/**
 * constants.js — every tunable number in the calculation layer.
 *
 * Rule: no engine, service or page may contain a bare numeric literal that
 * carries meaning. If a number can be argued about, it lives here, named, with
 * the reason it has that value. Changing how the app calculates is a change to
 * this file only.
 *
 * Pure arithmetic that cannot be tuned (dividing by 60 to turn minutes into
 * seconds, squaring a height) stays in the formula where it is readable.
 */

/* ── Unit conversion ────────────────────────────────────────────────────── */
export const UNITS = Object.freeze({
  SECONDS_PER_MINUTE: 60,
  MINUTES_PER_HOUR: 60,
  CM_PER_METRE: 100,
  KG_PER_LB: 0.45359237,
  KM_PER_MILE: 1.609344,
  DAYS_PER_WEEK: 7,
  KCAL_PER_G_PROTEIN: 4,
  KCAL_PER_G_CARB: 4,
  KCAL_PER_G_FAT: 9,
});

/* ── Mifflin-St Jeor coefficients ───────────────────────────────────────── */
export const MIFFLIN = Object.freeze({
  WEIGHT_COEFFICIENT: 10,      // per kg
  HEIGHT_COEFFICIENT: 6.25,    // per cm
  AGE_COEFFICIENT: -5,         // per year
  MALE_CONSTANT: 5,
  FEMALE_CONSTANT: -161,
});

/* ── Katch-McArdle (used when body-fat percentage is known) ─────────────── */
export const KATCH_MCARDLE = Object.freeze({
  BASE: 370,
  LEAN_MASS_COEFFICIENT: 21.6,
});

/* ── Activity multipliers applied to BMR to reach maintenance ───────────── */
export const ACTIVITY_FACTOR = Object.freeze({
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
});
export const DEFAULT_ACTIVITY_FACTOR = ACTIVITY_FACTOR.moderate;

/* ── Energy adjustment applied to maintenance, per goal ─────────────────── */
export const GOAL_ADJUSTMENT = Object.freeze({
  bulk: 0.12,
  cut: -0.18,
  recomp: 0,
  maintain: 0,
  // Added in the nutrition phase. The four above are unchanged on purpose:
  // earlier phases and their tests are built on those exact numbers.
  lean_bulk: 0.08,
  maintenance: 0,
  recomposition: 0,
  fat_loss: -0.18,
  aggressive_cut: -0.25,
});

/* ── Macronutrient targets, in grams per kg of body weight ──────────────── */
export const MACRO_PER_KG = Object.freeze({
  PROTEIN_DEFAULT: 1.9,
  PROTEIN_CUT: 2.2,     // higher while in a deficit, to protect lean mass
  FAT_DEFAULT: 0.9,
});

/* ── US Navy body-fat formula coefficients ──────────────────────────────── */
export const NAVY_BODY_FAT = Object.freeze({
  MALE: { A: 495, B: 1.0324, C: 0.19077, D: 0.15456, E: 450 },
  FEMALE: { A: 495, B: 1.29579, C: 0.35004, D: 0.22100, E: 450 },
  MIN_PERCENT: 2,
  MAX_PERCENT: 70,
});

/* ── One-rep-max estimation ─────────────────────────────────────────────── */
export const ONE_REP_MAX = Object.freeze({
  EPLEY_COEFFICIENT: 1 / 30,
  BRZYCKI_NUMERATOR: 36,
  BRZYCKI_OFFSET: 37,
  /** Both formulas drift badly past this many reps. */
  MAX_RELIABLE_REPS: 12,
});

/* ── Running ────────────────────────────────────────────────────────────── */
export const RUNNING = Object.freeze({
  /** MET values by pace band, for the energy estimate. */
  MET_BY_SPEED_KMH: Object.freeze([
    { upTo: 8, met: 8.3 },
    { upTo: 9.7, met: 9.8 },
    { upTo: 11.3, met: 11.0 },
    { upTo: 12.9, met: 11.8 },
    { upTo: 14.5, met: 12.8 },
    { upTo: Infinity, met: 14.5 },
  ]),
  MET_KCAL_PER_KG_PER_HOUR: 1,
});

/* ── Weight-trend and calorie adjustment policy ─────────────────────────── */
export const ADJUSTMENT = Object.freeze({
  /** Weekly rate targets, as a fraction of body weight. */
  TARGET_RATE_FRACTION: Object.freeze({
    bulk: 0.0035,      // ~0.35 % of body weight gained per week
    cut: -0.0075,      // ~0.75 % lost per week
    recomp: 0,
    maintain: 0,
    lean_bulk: 0.0025,
    maintenance: 0,
    recomposition: 0,
    fat_loss: -0.0075,
    aggressive_cut: -0.0100,
  }),
  /** How far off target the rate may drift before anything changes. */
  TOLERANCE_FRACTION: 0.4,
  /**
   * Tolerance when the target rate is zero (maintain, recomp): a band around
   * no change, as a fraction of body weight per week. Without this, any
   * fluctuation at all would look like a deviation.
   */
  FLAT_TOLERANCE_FRACTION: 0.0025,
  /** Size of one adjustment, in kcal. */
  STEP_KCAL: 200,
  /** Never move the target further than this from maintenance. */
  MAX_DEVIATION_FRACTION: 0.30,
  /** Minimum weigh-ins needed before a decision is honest. */
  MIN_READINGS: 3,
  /** How many days of history the decision looks at. */
  WINDOW_DAYS: 14,
  /** Weigh-ins closer together than this add noise, not signal. */
  MIN_DAYS_BETWEEN_READINGS: 2,
});

/* ── Rounding ───────────────────────────────────────────────────────────── */
export const PRECISION = Object.freeze({
  KCAL: 0,
  GRAMS: 0,
  KG: 2,
  KM: 2,
  PERCENT: 1,
  RATE_KG_PER_WEEK: 3,
});

/* ── Cache ──────────────────────────────────────────────────────────────── */
export const CACHE = Object.freeze({
  /** Entries kept per memoised function before the oldest is dropped. */
  MAX_ENTRIES: 32,
});

/* ── Planner ────────────────────────────────────────────────────────────────
   Every number the weekly planner can be argued about. Training policy, not
   physiology: these are conventions drawn from periodisation practice, and
   they are meant to be edited.                                             */

export const PHASE = Object.freeze({
  FOUNDATION: 'foundation',
  HYPERTROPHY: 'hypertrophy',
  STRENGTH: 'strength',
  PEAK: 'peak',
  RECOVERY: 'recovery',
});

export const DAY_TYPE = Object.freeze({
  GYM: 'gym',
  RUNNING: 'running',
  MOBILITY: 'mobility',
  REST: 'rest',
});

export const INTENSITY = Object.freeze({
  EASY: 'easy',
  MODERATE: 'moderate',
  HARD: 'hard',
});

export const PRIORITY = Object.freeze({
  ESSENTIAL: 1,   // dropping this costs the week
  IMPORTANT: 2,   // move it rather than skip it
  OPTIONAL: 3,    // skip freely when life happens
});

export const PLANNER = Object.freeze({
  /** How long each phase runs before the next is considered, in weeks. */
  PHASE_LENGTH_WEEKS: Object.freeze({
    foundation: 4,
    hypertrophy: 8,
    strength: 6,
    peak: 3,
    recovery: 1,
  }),

  /** A planned deload lands every this many training weeks. */
  DELOAD_EVERY_WEEKS: 6,

  /** Strain at or above this forces a deload regardless of the calendar. */
  DELOAD_STRAIN_THRESHOLD: 75,

  /** Volume and intensity kept during a deload week. */
  DELOAD_VOLUME_FACTOR: 0.6,

  /** Gym share of the available training days, by phase. */
  GYM_SHARE_BY_PHASE: Object.freeze({
    foundation: 0.6,
    hypertrophy: 0.75,
    strength: 0.8,
    peak: 0.7,
    recovery: 0.5,
  }),

  /** Never plan more than this many training days in a row. */
  MAX_CONSECUTIVE_TRAINING_DAYS: 3,

  /** Below this many available days, running gives way to lifting. */
  MIN_DAYS_FOR_RUNNING: 3,

  /** Minimum gym days worth calling a training week. */
  MIN_GYM_DAYS: 1,

  /** Session length bounds when the schedule does not say, in minutes. */
  DEFAULT_SESSION_MIN: 75,
  MIN_SESSION_MIN: 20,
  MAX_SESSION_MIN: 180,
  MOBILITY_SESSION_MIN: 25,
  RUN_SESSION_MIN: 40,
});

export const STRAIN = Object.freeze({
  /** Weights of each component of the strain index. They sum to 1. */
  WEIGHTS: Object.freeze({
    volume: 0.35,
    running: 0.2,
    sleep: 0.25,
    recovery: 0.2,
  }),
  /** A week-on-week volume rise of this fraction reads as maximum strain. */
  VOLUME_RISE_AT_MAX: 0.4,
  /** Weekly running minutes that read as maximum strain. */
  RUNNING_MINUTES_AT_MAX: 240,
  /** Self-reported recovery runs 1–10. */
  RECOVERY_SCALE_MAX: 10,
  RECOVERY_SCALE_MIN: 1,
  /** Default when nothing has been reported. */
  DEFAULT_RECOVERY_SCORE: 7,
  /** Recovery at or below this counts as poor. */
  LOW_RECOVERY_SCORE: 4,
});

export const SLEEP = Object.freeze({
  /** Adult range, per the American Academy of Sleep Medicine consensus. */
  TARGET_HOURS: 8,
  MIN_HOURS: 7,
  /** Extra sleep asked for when strain is high. */
  HIGH_STRAIN_BONUS_HOURS: 0.5,
  /** Sleeping this far below target counts as a debt worth acting on. */
  DEBT_HOURS: 1,
});

export const HYDRATION = Object.freeze({
  /** Baseline intake per kg of body weight, in litres. */
  L_PER_KG: 0.035,
  /** Added per hour of training. */
  L_PER_TRAINING_HOUR: 0.5,
  MIN_L: 1.5,
  MAX_L: 6,
});

export const CALORIE_CYCLING = Object.freeze({
  /** Rest days sit this fraction below the weekly average. */
  REST_DAY_DELTA: 0.1,
  /** Never let a training or rest day drift further than this from the average. */
  MAX_DAY_DEVIATION: 0.25,
});

export const LAYOFF = Object.freeze({
  /** No logged training for this many days counts as a break. */
  DAYS_TO_COUNT_AS_BREAK: 7,
  /** Volume kept on the first week back. */
  RETURN_VOLUME_FACTOR: 0.7,
});

/* ── Workout engine ─────────────────────────────────────────────────────────
   Training policy. The volume landmarks follow the minimum-effective /
   maximum-recoverable framework popularised by Israetel et al. (Renaissance
   Periodization, Scientific Principles of Hypertrophy Training, 2021), which
   is a practical framework rather than a settled result. Everything here is
   meant to be edited.                                                       */

export const EXPERIENCE = Object.freeze({
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
});

export const WORKOUT = Object.freeze({
  /** Weekly working sets per muscle group, by experience. */
  WEEKLY_SETS_BY_LEVEL: Object.freeze({
    beginner:     { min: 6,  target: 10, max: 14 },
    intermediate: { min: 8,  target: 14, max: 20 },
    advanced:     { min: 10, target: 18, max: 24 },
  }),

  /** Multiplier on the weekly set target, by phase. */
  PHASE_VOLUME_FACTOR: Object.freeze({
    foundation: 0.8,
    hypertrophy: 1,
    strength: 0.85,
    peak: 0.7,
    recovery: 0.5,
  }),

  /** Working rep range by phase: [low, high]. */
  PHASE_REP_RANGE: Object.freeze({
    foundation: [8, 12],
    hypertrophy: [8, 12],
    strength: [4, 6],
    peak: [2, 4],
    recovery: [10, 15],
  }),

  /** Target RPE by phase — how close to failure a working set should land. */
  PHASE_RPE: Object.freeze({
    foundation: 6.5,
    hypertrophy: 8,
    strength: 8.5,
    peak: 9,
    recovery: 5,
  }),

  /** Rest multiplier by phase, applied to the exercise's own default. */
  PHASE_REST_FACTOR: Object.freeze({
    foundation: 1,
    hypertrophy: 1,
    strength: 1.3,
    peak: 1.4,
    recovery: 0.8,
  }),

  /** Sets per exercise, before time trimming. */
  SETS_PER_EXERCISE: Object.freeze({ compound: 4, isolation: 3, accessory: 3, conditioning: 3, mobility: 2 }),

  /** How many exercises a session may hold, by available minutes. */
  MIN_EXERCISES: 2,
  MAX_EXERCISES: 8,

  /** Seconds a single working set takes, excluding rest. */
  SET_DURATION_SEC: 45,
  /** Warm-up sets are quick and rested briefly. */
  WARMUP_SET_DURATION_SEC: 30,
  WARMUP_REST_SEC: 45,
  /** Warm-up sets before the first working set, by category. */
  WARMUP_SETS: Object.freeze({ compound: 3, isolation: 1, accessory: 1, conditioning: 0, mobility: 0 }),
  /** Only the first exercise for a muscle needs a full warm-up ramp. */
  GENERAL_WARMUP_MIN: 8,
  COOLDOWN_MIN: 4,

  /** Corrective work is capped so it never crowds out the session's purpose. */
  MAX_CORRECTIVE_EXERCISES: 2,
  CORRECTIVE_SETS: 2,
  CORRECTIVE_REPS: 15,
  CORRECTIVE_REST_SEC: 30,
  CORRECTIVE_SET_DURATION_SEC: 40,

  /** A session shorter than this cannot hold a useful strength stimulus. */
  MIN_SESSION_MIN: 20,

  /** Rotation: how many past weeks to look at before repeating a selection. */
  ROTATION_LOOKBACK_WEEKS: 3,

  /** A muscle needs this long between hard sessions. */
  MIN_HOURS_BETWEEN_HARD_SESSIONS: 48,
});

export const PROGRESSION = Object.freeze({
  /** Smallest load jump that is practical, in kg. */
  LOAD_STEP_UPPER_KG: 2.5,
  LOAD_STEP_LOWER_KG: 5,
  /** Below this load, step by the smaller increment regardless. */
  LIGHT_LOAD_KG: 20,

  /** Add load once every set hits the top of the range at or below this RPE. */
  RPE_READY_TO_ADD: 8,
  /** Above this, the session was harder than intended — hold or back off. */
  RPE_TOO_HARD: 9,

  /** Sessions without progress before the engine calls it a plateau. */
  STALL_SESSIONS: 3,
  /** Load cut applied when a lift stalls. */
  STALL_BACKOFF: 0.9,
  /** Load and set multipliers during a deload week. */
  DELOAD_LOAD_FACTOR: 0.8,
  DELOAD_SET_FACTOR: 0.6,
  /** Weekly set increase while progress is on track. */
  SET_STEP: 1,
});

/* ── Execution ──────────────────────────────────────────────────────────────
   Tracking what actually happened in a session, and judging it against what
   was planned. Thresholds are policy, not measurement.                      */

export const SESSION_STATE = Object.freeze({
  PLANNED: 'planned',
  STARTED: 'started',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  SKIPPED: 'skipped',
});

export const EXERCISE_STATUS = Object.freeze({
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  SKIPPED: 'skipped',
  FAILED: 'failed',
});

export const EXECUTION = Object.freeze({
  /** Share of planned sets that counts the session as done rather than partial. */
  COMPLETION_SUCCESS: 0.8,
  /** Below this, the session reads as abandoned rather than shortened. */
  COMPLETION_ABANDONED: 0.3,

  /**
   * A set this many reps under the plan is a failed set, not a light one.
   * One rep short happens; three means the load was wrong.
   */
  FAILURE_REP_MARGIN: 2,

  /** An exercise fails when this share of its sets failed. */
  EXERCISE_FAILURE_RATIO: 0.5,

  /** RPE this far above plan means the session was harder than intended. */
  RPE_OVERSHOOT: 1,

  /** A new best must beat the old one by at least this, to ignore noise. */
  PR_LOAD_MARGIN_KG: 0.5,
  PR_E1RM_MARGIN_KG: 1,
  PR_VOLUME_MARGIN_KG: 1,

  /** A pause longer than this is treated as the session having been left. */
  PAUSE_ABANDON_MIN: 120,

  /** Rest longer than this between sets ends the working portion. */
  MAX_REST_SEC: 900,

  /** Self-reported fatigue scale after a session. */
  FATIGUE_MIN: 1,
  FATIGUE_MAX: 10,
});

/* ── Running programme ──────────────────────────────────────────────────────
   Session shapes, load and progression policy. The 10% weekly-increase
   convention is widely taught and weakly evidenced (Buist I, et al. Am J
   Sports Med. 2008;36(1):33-39 found no injury benefit); it is kept as a
   conservative default, not as a finding.                                   */

export const RUN_TYPE = Object.freeze({
  EASY: 'easy-run',
  RECOVERY: 'recovery-jog',
  LONG: 'long-run',
  TEMPO: 'tempo-run',
  INTERVAL: 'interval-run',
  PROGRESSION: 'progression-run',
  FARTLEK: 'fartlek',
  STRIDES: 'strides',
  WALK: 'brisk-walk',
});

/** Which types count as hard. Two of these a week is the ceiling. */
export const QUALITY_TYPES = Object.freeze([
  RUN_TYPE.TEMPO, RUN_TYPE.INTERVAL, RUN_TYPE.PROGRESSION, RUN_TYPE.FARTLEK,
]);

export const RUNNING_PROGRAM = Object.freeze({
  /** Starting weekly distance when there is no history, by level, in km. */
  BASE_WEEKLY_KM: Object.freeze({ beginner: 10, intermediate: 25, advanced: 45 }),

  /** Share of the week's distance each session type takes. */
  SESSION_SHARE: Object.freeze({
    'easy-run': 0.25,
    'recovery-jog': 0.12,
    'long-run': 0.32,
    'tempo-run': 0.2,
    'interval-run': 0.18,
    'progression-run': 0.22,
    fartlek: 0.2,
    strides: 0.06,
    'brisk-walk': 0.15,
  }),

  /** Pace relative to easy pace. Below 1 is faster. */
  PACE_FACTOR: Object.freeze({
    'easy-run': 1,
    'recovery-jog': 1.1,
    'long-run': 1.03,
    'tempo-run': 0.88,
    'interval-run': 0.8,
    'progression-run': 0.94,
    fartlek: 0.9,
    strides: 0.72,
    'brisk-walk': 1.5,
  }),

  /** Heart-rate zone per type, as a share of maximum heart rate. */
  HR_ZONE: Object.freeze({
    'easy-run': [0.65, 0.75],
    'recovery-jog': [0.6, 0.7],
    'long-run': [0.65, 0.78],
    'tempo-run': [0.83, 0.88],
    'interval-run': [0.9, 0.97],
    'progression-run': [0.7, 0.87],
    fartlek: [0.75, 0.9],
    strides: [0.85, 0.95],
    'brisk-walk': [0.5, 0.65],
  }),

  /** Session RPE per type, for the training-load calculation. */
  SESSION_RPE: Object.freeze({
    'easy-run': 3,
    'recovery-jog': 2,
    'long-run': 5,
    'tempo-run': 7,
    'interval-run': 9,
    'progression-run': 6,
    fartlek: 6,
    strides: 4,
    'brisk-walk': 2,
  }),

  /** Most a week's distance may rise over the last, as a fraction. */
  MAX_WEEKLY_INCREASE: 0.1,
  /** Hard sessions permitted in one week. */
  MAX_QUALITY_SESSIONS: 2,
  /** Weeks of running before quality work is introduced at all. */
  QUALITY_UNLOCK_WEEKS: 4,

  /** Warm-up and cool-down minutes, by whether the session is hard. */
  EASY_WARMUP_MIN: 5,
  QUALITY_WARMUP_MIN: 12,
  EASY_COOLDOWN_MIN: 3,
  QUALITY_COOLDOWN_MIN: 8,

  /** Shortest run worth planning, in minutes. */
  MIN_SESSION_MIN: 15,

  /** Days without a run before the return is treated as a restart. */
  LAYOFF_DAYS: 14,
  /** Distance kept on the first week back. */
  RETURN_DISTANCE_FACTOR: 0.6,

  /** Fall-back easy pace when nothing has been logged, in seconds per km. */
  DEFAULT_EASY_PACE_SEC: 420,
  /** Slowest and fastest easy pace the engine will ever prescribe. */
  MIN_EASY_PACE_SEC: 240,
  MAX_EASY_PACE_SEC: 900,
});

export const RUNNING_LOAD = Object.freeze({
  /**
   * Session load = duration in minutes × session RPE, after Foster C, et al.
   * A new approach to monitoring exercise training. J Strength Cond Res.
   * 2001;15(1):109-115.
   */
  ACUTE_DAYS: 7,
  CHRONIC_DAYS: 28,
  /** Acute:chronic ratios outside this band are flagged. */
  SAFE_RATIO: Object.freeze([0.8, 1.3]),
  /** The words running-progress-engine labels that ratio with. */
  VERDICT: Object.freeze({
    SPIKING: 'spiking',
    DETRAINING: 'detraining',
    STEADY: 'steady',
    UNKNOWN: 'unknown',
  }),
  /** Lifting volume above this share of the recovery budget eases running. */
  LIFTING_HEAVY_STRAIN: 55,
});

/** Maximum heart rate, Tanaka H, et al. J Am Coll Cardiol. 2001;37(1):153-156. */
export const MAX_HR = Object.freeze({ BASE: 208, AGE_COEFFICIENT: 0.7 });

/* ── Nutrition ──────────────────────────────────────────────────────────────
   Targets and safety floors. Protein and fat ranges follow the International
   Society of Sports Nutrition position stands (Jäger R, et al. J Int Soc
   Sports Nutr. 2017;14:20 for protein; Aragon AA, et al. 2017;14:16 for diet
   composition). Fibre follows the Institute of Medicine's 14 g per 1000 kcal.
   The rate limits and the refeed cadence are coaching conventions.

   Nothing here is medical advice, and the aggressive-cut settings in
   particular describe a deficit that is uncomfortable to hold and easy to get
   wrong without supervision.                                                */

export const NUTRITION_GOAL = Object.freeze({
  LEAN_BULK: 'lean_bulk',
  BULK: 'bulk',
  MAINTENANCE: 'maintenance',
  RECOMPOSITION: 'recomposition',
  FAT_LOSS: 'fat_loss',
  AGGRESSIVE_CUT: 'aggressive_cut',
});

/** The Profile still stores the four original goals. Map them forward. */
export const GOAL_ALIASES = Object.freeze({
  cut: NUTRITION_GOAL.FAT_LOSS,
  recomp: NUTRITION_GOAL.RECOMPOSITION,
  maintain: NUTRITION_GOAL.MAINTENANCE,
});

export const DEFICIT_GOALS = Object.freeze([
  NUTRITION_GOAL.FAT_LOSS, NUTRITION_GOAL.AGGRESSIVE_CUT,
]);
export const SURPLUS_GOALS = Object.freeze([
  NUTRITION_GOAL.BULK, NUTRITION_GOAL.LEAN_BULK,
]);

export const MACROS = Object.freeze({
  /** Protein in grams per kg of body weight, by goal. */
  PROTEIN_G_PER_KG: Object.freeze({
    lean_bulk: 1.9,
    bulk: 1.9,
    maintenance: 1.8,
    recomposition: 2.2,
    fat_loss: 2.2,
    aggressive_cut: 2.4,
  }),

  /** Fat in grams per kg of body weight, by goal. */
  FAT_G_PER_KG: Object.freeze({
    lean_bulk: 0.9,
    bulk: 0.9,
    maintenance: 0.9,
    recomposition: 0.8,
    fat_loss: 0.8,
    aggressive_cut: 0.7,
  }),

  /** Extra carbohydrate, in grams, per hour of training on the day. */
  CARB_G_PER_TRAINING_HOUR: 30,
  /** Extra carbohydrate per kilometre run. */
  CARB_G_PER_KM: 6,

  /** Fibre per 1000 kcal, and the range it is held inside. */
  FIBRE_G_PER_1000_KCAL: 14,
  FIBRE_MIN_G: 20,
  FIBRE_MAX_G: 60,
});

export const NUTRITION_SAFETY = Object.freeze({
  /** Never below this, whatever the goal asks for. */
  MIN_PROTEIN_G_PER_KG: 1.6,
  ABSOLUTE_MIN_PROTEIN_G_PER_KG: 1.2,
  MIN_FAT_G_PER_KG: 0.5,
  /** Fat below this share of calories is flagged. */
  MIN_FAT_ENERGY_SHARE: 0.2,

  /** Calories never go below resting metabolism. */
  MIN_CALORIES_AS_BMR_MULTIPLE: 1,
  /** Nor further below maintenance than this. */
  MAX_DEFICIT_FRACTION: 0.25,
  MAX_SURPLUS_FRACTION: 0.2,

  /** Largest week-on-week change the engine will make. */
  MAX_WEEKLY_KCAL_CHANGE: 300,

  /** Rate limits as a fraction of body weight per week. */
  MAX_LOSS_RATE: 0.01,
  MAX_GAIN_RATE: 0.006,
});

export const REFEED = Object.freeze({
  /** Consecutive weeks in a deficit before a refeed is offered. */
  MIN_DEFICIT_WEEKS: 3,
  /** Carbohydrate multiplier on a refeed day. */
  CARB_MULTIPLIER: 1.6,
  /** Calories on a refeed day, as a share of maintenance. */
  CALORIE_SHARE_OF_TDEE: 1,
  /** Refeed days in one week. */
  DAYS: 1,
  /** Recovery at or below this brings a refeed forward. */
  LOW_RECOVERY_TRIGGER: 4,
});

export const DIET_BREAK = Object.freeze({
  /** Weeks in a deficit before a full break is due. */
  AFTER_WEEKS: 10,
  /** How long the break runs. */
  DURATION_WEEKS: 1,
  /** Calories during the break, as a share of maintenance. */
  CALORIE_SHARE_OF_TDEE: 1,
  /** A stall this long in a deficit also triggers one. */
  STALL_WEEKS: 3,
});

export const HYDRATION_EXTRA = Object.freeze({
  /** Litres added per hour of running, on top of the training allowance. */
  L_PER_RUNNING_HOUR: 0.6,
  /** Sodium in milligrams per litre of sweat replaced. */
  SODIUM_MG_PER_L: 800,
  /** Baseline sodium guidance, mg per day. */
  BASELINE_SODIUM_MG: 2000,
  MAX_SODIUM_MG: 5000,
  /** Above this temperature, fluid needs rise. */
  HOT_WEATHER_C: 28,
  HOT_WEATHER_EXTRA_L: 0.5,
});

/** How the day's energy is spread across meals, by number of meals. */
export const MEAL_DISTRIBUTION = Object.freeze({
  3: [
    { slot: 'breakfast', share: 0.3 },
    { slot: 'lunch', share: 0.375 },
    { slot: 'dinner', share: 0.325 },
  ],
  4: [
    { slot: 'breakfast', share: 0.25 },
    { slot: 'lunch', share: 0.3 },
    { slot: 'snack', share: 0.15 },
    { slot: 'dinner', share: 0.3 },
  ],
  5: [
    { slot: 'breakfast', share: 0.22 },
    { slot: 'snack', share: 0.12 },
    { slot: 'lunch', share: 0.27 },
    { slot: 'post_workout', share: 0.14 },
    { slot: 'dinner', share: 0.25 },
  ],
  /** Meals per day by stated appetite. */
  BY_APPETITE: Object.freeze({ low: 5, normal: 4, high: 3 }),
});

/* ── Meal planning ──────────────────────────────────────────────────────────
   Portion bounds, meal shapes and budget defaults. Nothing here calculates a
   macro target — those come from the nutrition engine.                      */

export const MEAL_SLOT = Object.freeze({
  BREAKFAST: 'breakfast',
  MORNING_SNACK: 'morning_snack',
  LUNCH: 'lunch',
  AFTERNOON_SNACK: 'afternoon_snack',
  DINNER: 'dinner',
  BEFORE_SLEEP: 'before_sleep',
});

/** Which FoodDB meal types each slot can draw on. */
export const SLOT_FOOD_TYPES = Object.freeze({
  breakfast: ['breakfast'],
  morning_snack: ['snack', 'breakfast'],
  lunch: ['lunch'],
  afternoon_snack: ['snack', 'pre_workout', 'post_workout'],
  dinner: ['dinner'],
  before_sleep: ['snack'],
});

/** How a day splits, by number of meals. Shares sum to 1. */
export const MEAL_SHAPES = Object.freeze({
  3: [
    { slot: 'breakfast', share: 0.3 },
    { slot: 'lunch', share: 0.4 },
    { slot: 'dinner', share: 0.3 },
  ],
  4: [
    { slot: 'breakfast', share: 0.25 },
    { slot: 'lunch', share: 0.32 },
    { slot: 'afternoon_snack', share: 0.13 },
    { slot: 'dinner', share: 0.3 },
  ],
  5: [
    { slot: 'breakfast', share: 0.22 },
    { slot: 'morning_snack', share: 0.11 },
    { slot: 'lunch', share: 0.28 },
    { slot: 'afternoon_snack', share: 0.13 },
    { slot: 'dinner', share: 0.26 },
  ],
  6: [
    { slot: 'breakfast', share: 0.2 },
    { slot: 'morning_snack', share: 0.1 },
    { slot: 'lunch', share: 0.24 },
    { slot: 'afternoon_snack', share: 0.12 },
    { slot: 'dinner', share: 0.24 },
    { slot: 'before_sleep', share: 0.1 },
  ],
});

export const MEAL_PLANNING = Object.freeze({
  /** Meals per day by appetite, before any rule adjusts it. */
  MEALS_BY_APPETITE: Object.freeze({ low: 6, normal: 4, high: 3 }),
  MIN_MEALS: 3,
  MAX_MEALS: 6,

  /** Practical portion sizes in grams, by food group. */
  PORTION_BOUNDS: Object.freeze({
    protein:    { min: 40,  max: 400, step: 10 },
    grain:      { min: 30,  max: 250, step: 10 },
    legume:     { min: 30,  max: 200, step: 10 },
    vegetable:  { min: 50,  max: 400, step: 25 },
    fruit:      { min: 50,  max: 400, step: 25 },
    dairy:      { min: 50,  max: 500, step: 25 },
    fat:        { min: 5,   max: 80,  step: 5 },
    supplement: { min: 5,   max: 60,  step: 5 },
    drink:      { min: 100, max: 750, step: 50 },
  }),

  /** How close a meal has to land before the solver stops adjusting. */
  MACRO_TOLERANCE: 0.08,
  /** Whole-day accuracy at or above this counts as a good plan. */
  GOOD_ACCURACY: 0.9,

  /** Foods per meal, before the fibre and fat top-ups. */
  MIN_FOODS_PER_MEAL: 1,
  MAX_FOODS_PER_MEAL: 4,

  /** A food may appear at most this many times in a week. */
  MAX_WEEKLY_REPEATS: 7,
  /** And at most this many times in one day. */
  MAX_DAILY_REPEATS: 2,

  /** Preparation minutes available on a normal day, by stated cooking time. */
  DEFAULT_PREP_MINUTES: 60,
  /** A day needing more than this is flagged as impractical. */
  MAX_PREP_MINUTES: 150,

  /** A main meal should carry at least this share of its protein target. */
  MIN_MEAL_PROTEIN_SHARE: 0.6,
});

export const BUDGET = Object.freeze({
  /** Daily food budget in dirham, by the stated level. */
  MAD_PER_DAY: Object.freeze({ low: 45, medium: 75, high: 120 }),
  /** How far over budget a day may run before it is flagged. */
  TOLERANCE: 0.1,
  /**
   * When the cheapest possible version of the day costs more than this share
   * of the budget, price starts outranking variety and convenience.
   */
  PRESSURE_THRESHOLD: 0.6,
  /** Days in a month, for converting a monthly budget. */
  DAYS_PER_MONTH: 30,
});

/* ── Application layer ──────────────────────────────────────────────────────
   Thresholds for turning numbers the engines already produced into labels and
   notifications. No formula lives here — only where the lines are drawn.    */

export const RECOVERY_STATUS = Object.freeze({
  GOOD: 'good',
  MODERATE: 'moderate',
  POOR: 'poor',
  UNKNOWN: 'unknown',
});

/** Strain index bands, read from the value plan-context already computed. */
export const RECOVERY_BANDS = Object.freeze({
  GOOD_BELOW: 35,
  POOR_AT_OR_ABOVE: 65,
});

export const NOTIFICATION = Object.freeze({
  TYPE: Object.freeze({
    WORKOUT_MISSED: 'workout-missed',
    RUNNING_MISSED: 'running-missed',
    PROTEIN_LOW: 'protein-low',
    CALORIES_LOW: 'calories-low',
    WEIGHT_UPDATED: 'weight-updated',
    NEW_PR: 'new-pr',
    RECOVERY_POOR: 'recovery-poor',
    WEEK_COMPLETED: 'week-completed',
    PLAN_GENERATED: 'plan-generated',
    BUDGET_EXCEEDED: 'budget-exceeded',
  }),

  PRIORITY: Object.freeze({ HIGH: 'high', NORMAL: 'normal', LOW: 'low' }),

  /** Intake below this share of target counts as low. */
  LOW_INTAKE_SHARE: 0.8,
  /** Notifications kept before the oldest is dropped. */
  MAX_STORED: 100,
  /** A planned session is "missed" this long after its date. */
  MISSED_AFTER_DAYS: 1,
});

/* ── Reports ────────────────────────────────────────────────────────────────
   Phase 16. The reports engine measures nothing new: it reads what the other
   engines produced and puts a line somewhere. These are those lines, and the
   weights it averages with — all policy, all arguable, all in one place.    */

export const REPORTS = Object.freeze({
  /** How the three adherence components combine into one number.
      They sum to 1; a component with nothing planned is dropped and the
      remaining weights are renormalised, which the report explains. */
  ADHERENCE_WEIGHTS: Object.freeze({ gym: 0.4, running: 0.25, nutrition: 0.35 }),

  /** At or above this, adherence counts as perfect. */
  ADHERENCE_PERFECT: 95,
  /** Below this, adherence is low enough to be worth naming. */
  ADHERENCE_LOW: 60,

  /** A logged day inside this share of the calorie target counts as on plan. */
  CALORIE_TOLERANCE: 0.1,
  /** Protein at or above this share of target counts as hit. */
  PROTEIN_HIT_SHARE: 0.9,
  /** Average intake below this share of target is flagged as too low. */
  CALORIE_LOW_SHARE: 0.85,

  /** Weekly weight change smaller than this, in kg, reads as flat. */
  WEIGHT_STALL_KG: 0.15,
  /** Consecutive flat weeks before a bulk or a cut is called stalled. */
  WEIGHT_STALL_WEEKS: 3,

  /** Reported session fatigue runs 1–10; at or above this it is high. */
  FATIGUE_HIGH: 7,

  /** A week whose tonnage fell by at least this share reads as a deload. */
  DELOAD_VOLUME_DROP: 0.2,

  /** Distinct foods in a week below this count as a narrow week. */
  VARIETY_LOW: 12,
  /** Macro accuracy below this share is worth reporting against the plan. */
  MACRO_ACCURACY_LOW: 85,

  /** How much of the week has to be logged before a figure is trusted. */
  CONFIDENCE: Object.freeze({ HIGH_COVERAGE: 0.75, MEDIUM_COVERAGE: 0.4 }),
  CONFIDENCE_LEVEL: Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' }),

  /** Weeks needed before a monthly trend line is fitted rather than guessed. */
  MIN_WEEKS_FOR_TREND: 3,

  /** Consecutive weeks at or above ADHERENCE_PERFECT that make a streak. */
  STREAK_MIN_WEEKS: 2,

  /** How many personal records a monthly report lists. */
  MAX_RECORDS_LISTED: 10,
});

export const ACHIEVEMENT = Object.freeze({
  PERSONAL_BEST: 'personal-best',
  LONGEST_RUN: 'longest-run',
  BEST_PACE: 'best-pace',
  MOST_CONSISTENT_WEEK: 'most-consistent-week',
  PERFECT_ADHERENCE: 'perfect-adherence',
  BUDGET_SUCCESS: 'budget-success',
  GOAL_REACHED: 'goal-reached',
  STREAK: 'streak',
});

export const WARNING = Object.freeze({
  WEIGHT_STALLED: 'weight-stalled',
  OVERREACHING: 'overreaching',
  UNDER_RECOVERY: 'under-recovery',
  LOW_PROTEIN: 'low-protein',
  CALORIES_TOO_LOW: 'calories-too-low',
  HIGH_FATIGUE: 'high-fatigue',
  MISSED_WORKOUTS: 'missed-workouts',
  MISSED_RUNS: 'missed-runs',
  BUDGET_EXCEEDED: 'budget-exceeded',
  DATA_MISSING: 'data-missing',
});

/* ── Insights ───────────────────────────────────────────────────────────────
   Phase 17. The insights engine reads reports and says what stands out. It
   measures nothing, so the only numbers it needs are the lines it decides
   "stands out" against, and the weights it ranks by.                       */

export const INSIGHT_CATEGORY = Object.freeze({
  PROGRESS: 'progress',
  STRENGTH: 'strength',
  RUNNING: 'running',
  RECOVERY: 'recovery',
  NUTRITION: 'nutrition',
  MEALS: 'meal-planning',
  CONSISTENCY: 'consistency',
  BUDGET: 'budget',
  WEIGHT: 'weight',
  HEALTH: 'health',
});

export const INSIGHT_SEVERITY = Object.freeze({
  POSITIVE: 'positive',
  NEUTRAL: 'neutral',
  WARNING: 'warning',
  CRITICAL: 'critical',
});

export const INSIGHTS = Object.freeze({
  /** Ranking order for severity. Higher sorts first. */
  SEVERITY_RANK: Object.freeze({ critical: 4, warning: 3, positive: 2, neutral: 1 }),

  /** Ranking order for confidence, reusing the report's own three levels. */
  CONFIDENCE_RANK: Object.freeze({ high: 3, medium: 2, low: 1 }),

  /** Priority is 0–100. These are the bands the rules assign inside. */
  PRIORITY: Object.freeze({ CRITICAL: 90, HIGH: 75, MEDIUM: 50, LOW: 25, BACKGROUND: 10 }),

  /** At or above this priority an insight is surfaced as one to act on. */
  PRIORITY_THRESHOLD: 70,
  /** How many priority insights a week reports, at most. */
  MAX_PRIORITY: 5,
  /** How many insights of any kind a week reports, at most. */
  MAX_PER_WEEK: 20,

  /** Tonnage moving by this share week on week is worth naming. */
  VOLUME_CHANGE_SHARE: 0.1,
  /** Distance moving by this share week on week is worth naming. */
  DISTANCE_CHANGE_SHARE: 0.15,
  /** Adherence moving by this many points week on week is worth naming. */
  ADHERENCE_CHANGE_POINTS: 15,
  /** Progress toward the goal weight at or above this counts as close. */
  GOAL_NEAR_PERCENT: 90,
  /** Weeks of unbroken adherence that read as excellent consistency. */
  EXCELLENT_STREAK_WEEKS: 3,
  /** How many weeks a monthly insight needs before it claims a trend. */
  MIN_WEEKS_FOR_MONTHLY: 2,
});

/* ── Dashboard ──────────────────────────────────────────────────────────────
   Phase 18. The dashboard engine calculates nothing at all: it gathers what
   the other engines produced and arranges it. So the only numbers it needs
   are caps on how much of each list it carries, and the words it labels
   severity and risk with. Every threshold it reads is already above.       */

export const DASHBOARD_SEVERITY = Object.freeze({
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
  SUCCESS: 'success',
});

export const DASHBOARD_RISK = Object.freeze({
  NONE: 'none',
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
  UNKNOWN: 'unknown',
});

export const DASHBOARD = Object.freeze({
  /** How severity is ordered when notifications are ranked. Higher sorts first. */
  SEVERITY_RANK: Object.freeze({ critical: 4, warning: 3, info: 2, success: 1 }),

  /** Caps on what a single snapshot carries. Nothing is computed from these. */
  MAX_NOTIFICATIONS: 8,
  MAX_TOP_INSIGHTS: 5,
  MAX_CRITICAL_INSIGHTS: 5,
  MAX_IMPROVEMENTS: 3,
  MAX_RECOMMENDATIONS: 3,
  MAX_WARNINGS: 5,
  MAX_ACHIEVEMENTS: 5,
  MAX_REASONS: 40,

  /** Below this observed rate, in kg per week, no arrival date is projected. */
  MIN_RATE_FOR_ETA_KG: 0.05,
  /** An arrival further out than this many weeks is reported as out of range. */
  MAX_ETA_WEEKS: 104,
});

/* ── Analytics ──────────────────────────────────────────────────────────────
   Phase 19. The analytics engine fits no curve the reports engine has not
   already fitted and measures nothing new; it reads weekly reports over a
   longer window and says which direction things are going. So the only
   numbers it needs are the lines it calls a plateau, an improvement or a
   regression against — all policy, all arguable, all here.                 */

export const ANALYTICS_DIRECTION = Object.freeze({
  IMPROVING: 'improving',
  DECLINING: 'declining',
  FLAT: 'flat',
  UNKNOWN: 'unknown',
});

export const ANALYTICS_PERIOD = Object.freeze({
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
  RANGE: 'range',
});

export const ANALYTICS = Object.freeze({
  /** How many weeks each period spans, for windowing and for labelling. */
  WEEKS: Object.freeze({ weekly: 1, monthly: 4, quarterly: 13, yearly: 52 }),

  /**
   * Weeks of data a period needs before its trends are reported as anything
   * but provisional. Below this the analysis still builds — it says so.
   */
  MIN_WEEKS: Object.freeze({ weekly: 1, monthly: 3, quarterly: 8, yearly: 26 }),

  /**
   * A trend whose slope sits inside ± this share of the figure's own scale
   * reads as flat rather than as movement. Expressed per metric, because a
   * kilogram of body weight and a kilogram of tonnage are not comparable.
   */
  FLAT_BAND: Object.freeze({
    weightKg: 0.1,          // kg per week — narrower than REPORTS.WEIGHT_STALL_KG on purpose: that is one week, this is a fitted slope
    volumeKg: 100,          // kg of tonnage per week
    distanceKm: 0.5,        // km per week
    paceSecPerKm: 0.5,      // seconds per km per week — 2 was wrong: it made a
                            // 26 sec/km improvement over a quarter read as no change
    oneRepMaxKg: 0.5,       // kg per week
    calories: 40,           // kcal per week
    proteinG: 3,            // g per week
    adherencePercent: 1,    // points per week
    strainIndex: 1,         // points per week
    sleepHours: 0.1,        // hours per week
    trainingLoad: 0.05,     // ratio per week
    consistencyPercent: 1,  // points per week
  }),

  /** Consecutive weeks inside the flat band before a figure is called stalled. */
  PLATEAU_WEEKS: 3,
  /** Consecutive weeks moving the wrong way before it is called a regression. */
  REGRESSION_WEEKS: 3,
  /** Independent metrics that must agree before improvement is claimed. */
  MIN_AGREEING_SIGNALS: 2,

  /** A week with no log at all. This many in a row is a break in training. */
  LAYOFF_WEEKS: 2,

  /** Data coverage bands for the confidence a whole analysis earns. */
  CONFIDENCE: Object.freeze({ HIGH_WEEKS: 0.75, MEDIUM_WEEKS: 0.4 }),

  /** How many findings of each kind an analysis carries. */
  MAX_FINDINGS: 20,
  MAX_PER_KIND: 6,
});

export const ANALYTICS_FINDING = Object.freeze({
  PLATEAU: 'plateau',
  IMPROVEMENT: 'improvement',
  REGRESSION: 'regression',
  RISK: 'risk',
});

/* ── Coaching ───────────────────────────────────────────────────────────────
   Phase 21. The coach measures nothing: it reads what the other engines
   concluded and says what to do about it. So the only numbers here are the
   bands that decide how loudly a piece of advice speaks and how many of them
   one session carries. Every physiological threshold it reasons against
   already lives above, owned by the engine that uses it.                    */

export const COACH_CATEGORY = Object.freeze({
  TRAINING: 'training',
  RUNNING: 'running',
  NUTRITION: 'nutrition',
  RECOVERY: 'recovery',
  WEIGHT: 'weight',
  CONSISTENCY: 'consistency',
  GOAL: 'goal',
  MOTIVATION: 'motivation',
  HEALTH: 'health',
  PLANNING: 'planning',
});

export const COACH_SEVERITY = Object.freeze({
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
  POSITIVE: 'positive',
});

/** When a piece of advice is meant to be read. */
export const COACH_HORIZON = Object.freeze({
  DAILY: 'daily',
  WEEKLY: 'weekly',
});

export const COACH = Object.freeze({
  SEVERITY_RANK: Object.freeze({ critical: 4, warning: 3, info: 2, positive: 1 }),
  CONFIDENCE_RANK: Object.freeze({ high: 3, medium: 2, low: 1 }),

  /** Priority bands. A rule picks one rather than inventing a number. */
  PRIORITY: Object.freeze({
    URGENT: 95,   // acting late costs a week or a body part
    HIGH: 80,     // the main thing to change
    MEDIUM: 55,   // worth doing once the above is handled
    LOW: 30,      // context, encouragement, housekeeping
  }),

  /** How much one session carries. A coach that says twelve things says none. */
  MAX_DAILY: 4,
  MAX_WEEKLY: 6,
  MAX_WARNINGS: 5,
  MAX_ACHIEVEMENTS: 4,
  MAX_ACTIONS: 3,

  /**
   * Weeks of data below which the coach says so rather than advising. A
   * single week is a week; advice built on it is a guess wearing a number.
   */
  MIN_WEEKS_FOR_TREND_ADVICE: 3,

  /** Consecutive poor-recovery weeks before rest is advised over training. */
  FATIGUE_WEEKS: 2,

  /**
   * The coach's own bands. These are coaching policy rather than measurement,
   * which is why they live here and not in REPORTS beside the figures they are
   * compared against: the reports engine calls 95% perfect and 60% low, and
   * says nothing about the middle. What counts as "good enough to leave alone"
   * is a judgement, and it is this one.
   */
  ADHERENCE_GOOD: 80,
  /** Strain at or above this, with nowhere to recover, is worth acting on. */
  STRAIN_HIGH: 65,
  /** Weekly kilometres below this read as no running base yet. */
  RUNNING_BASE_KM: 15,
  /** Weigh-ins per week below this make a rate unreliable to advise on. */
  MIN_WEIGHINGS_PER_WEEK: 2,
});
