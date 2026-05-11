export interface PracticeAction {
  headline: string;
  subtitle: string;
  duration_min: number;
}

const MAP: Record<string, PracticeAction> = {
  approach_100_150: {
    headline: 'Driving range — aproximaciones',
    subtitle: '25 min · hierros 8 y 9',
    duration_min: 25,
  },
  putts_1_2m: {
    headline: 'Putting green — putts cortos',
    subtitle: '20 min · radio 1-2m',
    duration_min: 20,
  },
  post_bogey_spiral: {
    headline: 'Ronda con foco mental',
    subtitle: '9 hoyos · respiración post-bogey',
    duration_min: 90,
  },
  driving_dispersion: {
    headline: 'Driving range — dispersión',
    subtitle: '30 min · drives + medio',
    duration_min: 30,
  },
  putts_from_3m: {
    headline: 'Putting green — distancia',
    subtitle: '20 min · putts 3-5m',
    duration_min: 20,
  },
};

export const KNOWN_PATTERNS = Object.keys(MAP);

const FALLBACK: PracticeAction = {
  headline: 'Sesión libre',
  subtitle: '30 min · trabajá lo que sientas',
  duration_min: 30,
};

export function derivePracticeAction(plan: { pattern_id: string }): PracticeAction {
  return MAP[plan.pattern_id] ?? FALLBACK;
}
