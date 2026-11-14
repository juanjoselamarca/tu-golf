/**
 * Lectura con IA de capturas de Garmin Golf: prompt, tipos de la respuesta y correcciones de errores comunes.
 * Movido tal cual desde `src/app/api/import/screenshot/route.ts` (regla "el que toca, ordena", 14-nov-2026).
 */

// ============================================================
// VISION PROMPT — Garmin Golf specific
// Color system verified against real Garmin Golf screenshots:
//   Scorecard: azul oscuro=eagle, celeste=birdie, sin borde=par,
//              dorado/naranja=bogey, rojo=doble bogey+
//   Activity:  azul oscuro=eagle, celeste=birdie, verde=par,
//              dorado/naranja=bogey, rojo=doble bogey+
// ============================================================
export const VISION_PROMPT = `You are an expert at reading Garmin Golf app screenshots. There are TWO formats:

**FORMAT 1 — SCORECARD (detailed view of ONE round)**
Shows: club name, tees, date, player name, total score (+/- par), and a grid with:
- Row of hole numbers (1-9 + "Out", then 10-18 + "In")
- Row of par values per hole
- Row of player scores per hole
- Scores have colored borders indicating performance:
  - Dark blue circle = Eagle or better (-2 or less vs par)
  - Light blue / celeste circle = Birdie (-1 vs par)
  - No border = Par (even with par)
  - Gold / orange / amber square = Bogey (+1 vs par)
  - Red square = Double bogey or worse (+2 or more vs par)

For this format, extract EXACT scores from the numbers shown. Also read the par row.

**FORMAT 2 — ACTIVITY LIST (multiple rounds summary)**
Shows a scrollable list of round cards, each with:
- Club name, date, total score, +/- par number
- A small color bar below each round where each colored segment = 1 hole:
  - Dark blue segment = Eagle or better (-2+)
  - Light blue / celeste segment = Birdie (-1)
  - Green segment = Par (0)
  - Gold / orange / amber segment = Bogey (+1)
  - Red segment = Double bogey or worse (+2+)

For this format, extract each round visible. Read the color bar LEFT TO RIGHT.

Respond EXCLUSIVELY with valid JSON (no markdown, no backticks):

For FORMAT 1:
{
  "format": "scorecard",
  "course_name": "string",
  "tees": "string or null",
  "played_at": "YYYY-MM-DD or null",
  "holes_played": 9 or 18,
  "scores": { "1": exact_score, "2": exact_score, ... },
  "total_gross": number,
  "vs_par": number,
  "par_per_hole": { "1": par, "2": par, ... },
  "confidence": 0.0 to 1.0
}

For FORMAT 2:
{
  "format": "activity_list",
  "rounds": [
    {
      "course_name": "string",
      "played_at": "YYYY-MM-DD or null",
      "total_gross": number,
      "vs_par": number,
      "holes_played": 9 or 18,
      "color_sequence": ["gold","green","light_blue","red",...],
      "confidence": 0.0 to 1.0
    }
  ]
}

Rules:
- If you can't read a score number, use null
- If you can't read a date, use null
- confidence reflects how certain you are of the reading
- For FORMAT 2, read ALL rounds visible in the image
- For color_sequence use ONLY: "dark_blue", "light_blue", "green", "gold", "red"
- IMPORTANT: In the activity bar, green = PAR, light_blue = BIRDIE, gold/orange = BOGEY
- If image is NOT a Garmin Golf screenshot, respond: {"error": "not_a_scorecard"}
- Respond ONLY with JSON, nothing else`

// ---------------------------------------------------------------------------
// Types for Claude vision responses
// ---------------------------------------------------------------------------
export interface VisionScorecard {
  format: 'scorecard'
  course_name: string
  tees?: string | null
  played_at: string | null
  holes_played: number
  scores: Record<string, number>
  total_gross: number
  vs_par: number
  par_per_hole?: Record<string, number> | null
  confidence: number
}

export interface VisionActivityRound {
  course_name: string
  played_at: string | null
  total_gross: number
  vs_par: number
  holes_played: number
  color_sequence: string[]
  confidence: number
}

export interface VisionActivityList {
  format: 'activity_list'
  rounds: VisionActivityRound[]
}

export interface VisionError {
  error: string
}

// ---------------------------------------------------------------------------
// Post-processing: fix common Gemini mistakes
// ---------------------------------------------------------------------------
export function fixActivityRound(r: VisionActivityRound): VisionActivityRound {
  // Fix 1: Correct holes_played based on score total
  // A 9-hole round rarely exceeds 60 strokes for an amateur
  // An 18-hole round is almost always > 60
  if (r.total_gross > 60 && r.holes_played === 9) {
    r.holes_played = 18
  } else if (r.total_gross <= 60 && r.holes_played === 18) {
    r.holes_played = 9
  }

  // Fix 2: Recalculate vs_par from standard par
  const standardPar = r.holes_played === 9 ? 36 : 72
  r.vs_par = r.total_gross - standardPar

  // Fix 3: If color_sequence length doesn't match holes_played, fix it
  if (r.color_sequence && r.color_sequence.length !== r.holes_played) {
    // If sequence is double what expected (Gemini counted wrong), take first half
    if (r.color_sequence.length === r.holes_played * 2) {
      r.color_sequence = r.color_sequence.slice(0, r.holes_played)
    }
    // If sequence is half what expected, it's probably correct and holes_played is wrong
    else if (r.color_sequence.length * 2 === r.holes_played) {
      r.holes_played = r.color_sequence.length
      r.vs_par = r.total_gross - (r.holes_played === 9 ? 36 : 72)
    }
    // Otherwise truncate or pad with 'gold' (most common color) to match
    else if (r.color_sequence.length > r.holes_played) {
      r.color_sequence = r.color_sequence.slice(0, r.holes_played)
    } else {
      // Pad with 'gold' — most common color for amateurs
      while (r.color_sequence.length < r.holes_played) {
        r.color_sequence.push('gold')
      }
    }
  }

  return r
}

export type VisionResponse = VisionScorecard | VisionActivityList | VisionError
