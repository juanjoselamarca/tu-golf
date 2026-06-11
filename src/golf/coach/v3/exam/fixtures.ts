/**
 * Fixtures del examen del coach (causa H).
 *
 * Cada caso es una de las capturas reales reportadas (las 4 del inbox 09-jun +
 * el bug de lenguaje golfístico). Trae:
 *  - `userMessage`: lo que el jugador escribió.
 *  - `seed`: la data del jugador (rondas + scorecard + handicap) que el examen
 *    siembra EN MEMORIA (mock executeTool) — el coach DEBE alcanzarla con sus
 *    tools, nunca pedírsela al jugador ni inventarla.
 *  - `rubric`: condiciones que la respuesta DEBE cumplir (`must`) y que NO debe
 *    violar (`mustNot`), evaluadas por el juez semántico.
 */

const LOMAS_ID = '00000000-0000-4000-8000-0000000010a5'
// Par 72 realista (front 36 + back 36).
const LOMAS_PARES = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]

export interface ExamSeedRound {
  course: string
  course_id: string
  total: number
  holes: number
  played_at: string
  scores?: Record<string, number>
}

export interface ExamSeed {
  rounds: ExamSeedRound[]
  /** Scorecard de la cancha (pares por hoyo + par total). */
  scorecard?: { course: string; course_id: string; par_total: number; pares: number[] }
  /** Handicap de juego ya resuelto (índice vs handicap de juego). */
  handicap?: {
    cancha: string
    course_id: string
    indice: number
    handicap_de_juego: number
    holes: number
    tee: string
    course_rating: number
    slope: number
  }
}

export interface ExamCase {
  id: string
  userMessage: string
  seed: ExamSeed
  rubric: { must: string[]; mustNot: string[] }
}

const lomasScorecard = { course: 'Club Golf Lomas de la Dehesa', course_id: LOMAS_ID, par_total: 72, pares: LOMAS_PARES }
const lomasHandicap = {
  cancha: 'Club Golf Lomas de la Dehesa',
  course_id: LOMAS_ID,
  indice: 10,
  handicap_de_juego: 14,
  holes: 18,
  tee: 'azul',
  course_rating: 72.4,
  slope: 133,
}

function lomasRounds(n: number, base = 84): ExamSeedRound[] {
  return Array.from({ length: n }, (_, i) => ({
    course: 'Club Golf Lomas de la Dehesa',
    course_id: LOMAS_ID,
    total: base + i,
    holes: 18,
    played_at: `2026-0${(i % 6) + 1}-15`,
  }))
}

export const EXAM_CASES: ExamCase[] = [
  {
    id: 'captura1_indice_vs_hcp',
    userMessage:
      'Dame el formato por par 3, par 4 y par 5 de Lomas de la Dehesa. Mi índice es 10, mi handicap de juego 14.',
    seed: { rounds: lomasRounds(3), scorecard: lomasScorecard, handicap: lomasHandicap },
    rubric: {
      must: [
        'distingue claramente el índice (10) del handicap de juego (14)',
        'usa los pares reales de Lomas que trae del sistema (par 3, par 4, par 5), sin pedírselos al jugador',
      ],
      mustNot: [
        'inventa un handicap de juego distinto al que da el sistema',
        'le pide al jugador la tarjeta o los pares de la cancha',
        'dice que no tiene la cancha en el sistema',
      ],
    },
  },
  {
    id: 'captura2_pide_data',
    userMessage:
      'Tú tienes en tu base de datos el recorrido de las Lomas de la Dehesa, ¿por qué me lo preguntas?',
    seed: { rounds: lomasRounds(4, 86), scorecard: lomasScorecard },
    rubric: {
      must: ['trae los pares de la cancha con su herramienta (get_course_scorecard) y los usa'],
      mustNot: ['le pide la tarjeta o los pares al jugador', 'culpa al sistema o a una limitación'],
    },
  },
  {
    id: 'captura3_se_contradice',
    userMessage: 'Búscalo tú, que tienes toda mi data. ¿Cuántas rondas tengo registradas en Lomas?',
    seed: { rounds: lomasRounds(6, 85) },
    rubric: {
      must: ['encuentra las rondas con find_rounds y responde el número (6)'],
      mustNot: [
        'dice que el sistema no le devuelve las rondas o las fechas',
        'se contradice dentro de la misma respuesta',
      ],
    },
  },
  {
    id: 'captura4_culpa_sistema',
    userMessage: '¿Cuántas rondas tengo en Lomas de la Dehesa y cómo vengo jugando ahí?',
    seed: { rounds: lomasRounds(6, 85) },
    rubric: {
      must: ['responde que son 6 rondas usando find_rounds y comenta cómo viene jugando'],
      mustNot: ['dice que es una limitación del sistema', 'pide la fecha exacta de las rondas'],
    },
  },
  {
    // Bug de lenguaje golfístico (feedback_vocabulario_golf_strokes): menos golpes = mejor.
    id: 'captura5_lenguaje_golfistico',
    userMessage: 'Vengo de jugar 88, después 86 y la última 84 en Lomas. ¿Voy mejorando o empeorando?',
    seed: {
      rounds: [
        { course: 'Club Golf Lomas de la Dehesa', course_id: LOMAS_ID, total: 88, holes: 18, played_at: '2026-03-15' },
        { course: 'Club Golf Lomas de la Dehesa', course_id: LOMAS_ID, total: 86, holes: 18, played_at: '2026-04-15' },
        { course: 'Club Golf Lomas de la Dehesa', course_id: LOMAS_ID, total: 84, holes: 18, played_at: '2026-05-15' },
      ],
    },
    rubric: {
      must: ['reconoce que bajar de 88 a 84 golpes es MEJORAR (en golf, menos golpes es mejor)'],
      mustNot: [
        'dice que bajar el score de 88 a 84 es empeorar',
        'invierte la dirección de los strokes (trata más golpes como mejor rendimiento)',
      ],
    },
  },
]
