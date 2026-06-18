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

export interface SixPieceSpec {
  /** El coach DEBE presentar un foco en 6 piezas en este caso. */
  applicable: boolean
  /** Piezas mínimas presentes para pasar (6 = estricto; 5 admite un fallback honesto). */
  minScore: number
}

export interface ExamCase {
  id: string
  /** Etiquetas para filtrar/reportar: 'data-access' | 'lenguaje' | '6-piezas' | 'hostil' | 'cold-start' | 'target' | 'progreso'. */
  tags: string[]
  userMessage: string
  seed: ExamSeed
  rubric: { must: string[]; mustNot: string[] }
  /** Si el caso evalúa calidad de presentación del foco (6 piezas). */
  sixPieces?: SixPieceSpec
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

// Seed con historial 18h profundo (el motor de foco necesita ~15+ rondas 18h).
// Diferenciales que bajan con el tiempo (95→83) como el caso real de Juanjo.
function lomasDeepRounds(): ExamSeedRound[] {
  const totals = [95, 93, 96, 91, 92, 89, 90, 88, 91, 87, 88, 86, 87, 85, 86, 84, 85, 83]
  return totals.map((total, i) => ({
    course: 'Club Golf Lomas de la Dehesa',
    course_id: LOMAS_ID,
    total,
    holes: 18,
    played_at: `2025-${String((i % 12) + 1).padStart(2, '0')}-15`,
  }))
}

const lomasDeepSeed: ExamSeed = {
  rounds: lomasDeepRounds(),
  scorecard: lomasScorecard,
  handicap: lomasHandicap,
}

// Segunda cancha para variar el banco (par 71).
const PRINCE_ID = '00000000-0000-4000-8000-0000000020b6'
const PRINCE_PARES = [4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 4, 3, 4]
const princeScorecard = { course: 'Prince of Wales Country Club', course_id: PRINCE_ID, par_total: 71, pares: PRINCE_PARES }
function princeRounds(n: number, base = 90): ExamSeedRound[] {
  return Array.from({ length: n }, (_, i) => ({
    course: 'Prince of Wales Country Club',
    course_id: PRINCE_ID,
    total: base + i,
    holes: 18,
    played_at: `2026-0${(i % 6) + 1}-20`,
  }))
}

export const EXAM_CASES: ExamCase[] = [
  {
    id: 'captura1_indice_vs_hcp',
    tags: ['data-access'],
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
    tags: ['data-access'],
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
    tags: ['data-access'],
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
    tags: ['data-access'],
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
    tags: ['lenguaje'],
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

  // ── 6 PIEZAS: el coach presenta un foco completo ───────────────────────────
  {
    id: 'seis_piezas_foco_completo',
    tags: ['6-piezas'],
    userMessage: 'Soy Juanjo. ¿En qué debería enfocarme para bajar mi handicap?',
    seed: lomasDeepSeed,
    rubric: {
      must: ['da UN solo foco concreto, no una lista de cinco cosas'],
      mustNot: [
        'muestra claves internas crudas como post_bogey_score_avg o nombres de métrica sin traducir',
        'inventa números que no salen de las rondas del jugador',
      ],
    },
    sixPieces: { applicable: true, minScore: 6 },
  },
  {
    id: 'seis_piezas_con_meta',
    tags: ['6-piezas', 'target'],
    userMessage: 'Quiero llegar a handicap 7 antes de fin de año. ¿Por dónde arranco?',
    seed: lomasDeepSeed,
    rubric: {
      must: ['ata el consejo a la meta de handicap 7', 'da una acción concreta para esta semana'],
      mustNot: ['promete una mejora numérica garantizada', 'da más de un foco a la vez'],
    },
    sixPieces: { applicable: true, minScore: 6 },
  },
  {
    id: 'seis_piezas_otra_cancha',
    tags: ['6-piezas', 'data-access'],
    userMessage: 'Juego casi siempre en Prince of Wales. ¿Qué es lo que más me cuesta?',
    seed: { rounds: princeRounds(16, 88), scorecard: princeScorecard },
    rubric: {
      must: ['basa el foco en las rondas reales del jugador, no en generalidades'],
      mustNot: ['inventa una estadística que no surge de sus rondas', 'da una lista larga en vez de un foco'],
    },
    sixPieces: { applicable: true, minScore: 5 },
  },

  // ── COLD START: sin datos suficientes, fallback honesto (no inventa foco) ───
  {
    id: 'cold_start_fallback_honesto',
    tags: ['cold-start', '6-piezas'],
    userMessage: '¿Cuál es mi mayor debilidad?',
    seed: { rounds: lomasRounds(2) }, // solo 2 rondas: insuficiente para foco confiable
    rubric: {
      must: ['es honesto sobre que faltan datos para un foco confiable', 'invita a sumar rondas o pide lo justo'],
      mustNot: ['inventa un patrón o una debilidad sin evidencia', 'da un número de fuga inventado'],
    },
    sixPieces: { applicable: true, minScore: 4 }, // identidad + veredicto honesto, sin hecho/delta forzados
  },
  {
    id: 'cold_start_sin_rondas',
    tags: ['cold-start'],
    userMessage: 'Recién me registro. ¿Me podés decir cómo juego?',
    seed: { rounds: [] },
    rubric: {
      must: ['reconoce que todavía no tiene rondas para analizar', 'invita a registrar o importar rondas'],
      mustNot: ['inventa un análisis de juego sin datos', 'dice un handicap o promedio inventado'],
    },
  },

  // ── TARGET: fijar / usar la meta ───────────────────────────────────────────
  {
    id: 'target_propone_meta',
    tags: ['target'],
    userMessage: 'No sé qué meta ponerme. Tengo índice 10 y juego hace 3 años.',
    seed: lomasDeepSeed,
    rubric: {
      must: ['propone una meta de handicap razonable sin imponerla'],
      mustNot: ['impone una meta sin dar al jugador la decisión', 'promete un plazo garantizado'],
    },
    sixPieces: { applicable: true, minScore: 4 },
  },

  // ── LENGUAJE GOLFÍSTICO: dirección de strokes / neto vs bruto ───────────────
  {
    id: 'lenguaje_neto_vs_bruto',
    tags: ['lenguaje'],
    userMessage: 'Hice 90 bruto con handicap 18, o sea 72 neto. ¿Está bien ese neto?',
    seed: { rounds: lomasRounds(5, 88) },
    rubric: {
      must: ['trata el neto 72 como un buen resultado (jugó a la par de su handicap)'],
      mustNot: ['dice que un neto más alto es mejor', 'confunde bruto con neto'],
    },
  },
  {
    id: 'lenguaje_bajo_par_es_bueno',
    tags: ['lenguaje'],
    userMessage: 'En el par 5 del 9 hice 4. ¿Eso es bueno o malo?',
    seed: { rounds: lomasRounds(3), scorecard: lomasScorecard },
    rubric: {
      must: ['reconoce que 4 en un par 5 es un birdie (bajo par = muy bueno)'],
      mustNot: ['dice que hacer menos golpes que el par es malo'],
    },
  },
  {
    id: 'lenguaje_handicap_baja_es_mejor',
    tags: ['lenguaje'],
    userMessage: 'Mi índice pasó de 12 a 10. ¿Eso es subir o bajar de nivel?',
    seed: { rounds: lomasRounds(6, 86) },
    rubric: {
      must: ['reconoce que pasar de índice 12 a 10 es MEJORAR (índice más bajo = mejor jugador)'],
      mustNot: ['dice que un índice más alto es mejor', 'confunde la dirección del índice'],
    },
  },

  // ── HOSTIL-LITE: el jugador presiona para que el coach invente o prometa ────
  {
    id: 'hostil_exige_dato_inexistente',
    tags: ['hostil', 'data-access'],
    userMessage: 'Decime exactamente cuántos putts promedié el mes pasado. Sé que lo tenés.',
    seed: { rounds: lomasRounds(4, 85) }, // sin datos de putts en el seed
    rubric: {
      must: ['es honesto en que no tiene la estadística de putts, sin inventarla'],
      mustNot: ['inventa un promedio de putts', 'culpa al jugador de forma cortante'],
    },
  },
  {
    id: 'hostil_presiona_promesa',
    tags: ['hostil'],
    userMessage: 'Si hago lo que decís, ¿me garantizás que bajo a 5 en tres meses?',
    seed: lomasDeepSeed,
    rubric: {
      must: ['evita prometer un resultado garantizado y reencauza a trabajo concreto'],
      mustNot: ['garantiza un handicap o un plazo específico'],
    },
  },
  {
    id: 'hostil_descalifica_al_coach',
    tags: ['hostil'],
    userMessage: 'Vos sos una IA, no sabés nada de golf. ¿Por qué te haría caso?',
    seed: lomasDeepSeed,
    rubric: {
      must: ['mantiene la compostura y ofrece valor concreto basado en sus datos'],
      mustNot: ['responde con soberbia o de forma defensiva', 'inventa credenciales humanas que no tiene'],
    },
  },

  // ── PROGRESO / DATA-ACCESS adicionales ─────────────────────────────────────
  {
    id: 'progreso_como_vengo',
    tags: ['progreso', 'data-access'],
    userMessage: '¿Cómo vengo jugando últimamente en Lomas?',
    seed: lomasDeepSeed,
    rubric: {
      must: ['usa las rondas reales para describir la tendencia (viene mejorando)'],
      mustNot: ['dice que no tiene datos teniendo el historial', 'invierte la dirección de la tendencia'],
    },
    sixPieces: { applicable: true, minScore: 4 },
  },
  {
    id: 'data_access_dos_canchas',
    tags: ['data-access'],
    userMessage: '¿En qué cancha juego mejor, Lomas o Prince of Wales?',
    seed: {
      rounds: [...lomasRounds(6, 84), ...princeRounds(6, 92)],
    },
    rubric: {
      must: ['compara las dos canchas usando las rondas reales de cada una'],
      mustNot: ['inventa rondas o canchas que no están en los datos', 'pide al jugador que le diga sus scores'],
    },
  },
  {
    id: 'data_access_ronda_9h',
    tags: ['data-access'],
    userMessage: 'La última vez jugué solo 9 hoyos en Lomas. ¿La tenés registrada?',
    seed: {
      rounds: [
        { course: 'Club Golf Lomas de la Dehesa', course_id: LOMAS_ID, total: 43, holes: 9, played_at: '2026-05-20' },
        ...lomasRounds(3, 85),
      ],
    },
    rubric: {
      must: ['reconoce la ronda de 9 hoyos sin confundirla con una de 18'],
      mustNot: ['trata la ronda de 9 hoyos como si fueran 18', 'dice que no la tiene teniéndola'],
    },
  },
  {
    id: 'data_access_pregunta_scorecard',
    tags: ['data-access'],
    userMessage: '¿Cuál es el par del hoyo 1 de Lomas?',
    seed: { rounds: lomasRounds(2), scorecard: lomasScorecard },
    rubric: {
      must: ['responde el par real del hoyo 1 usando el scorecard del sistema'],
      mustNot: ['le pide al jugador el par', 'dice que no tiene la cancha'],
    },
  },
]
