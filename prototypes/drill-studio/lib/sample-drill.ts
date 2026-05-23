/**
 * Drill ejemplo — putting 1.5m. Cuando este prototipo migre a la app
 * real, esta data viene del motor de coach (`computePlanOutcomeForRound`
 * + `coach_plans` con metric=three_putts_per_round o similar).
 */

export interface DrillData {
  id: string
  category: 'putting' | 'approach' | 'bunker' | 'iron' | 'tee_shot' | 'mental'
  title: string
  subtitle: string
  /** El "qué" — corto, editorial. */
  briefing: string[]
  /** El "por qué" — patrón detectado. */
  patternDiagnosis: string
  /** Tracking semanal. */
  schedule: {
    daysPerWeek: number
    repetitionsPerDay: number
    completedThisWeek: number
    totalThisWeek: number
    daysMarked: number[] // 0-6 = lun-dom
  }
  /** Líneas de coaching narradas con TTS. */
  voiceScript: string[]
}

export const PUTTING_15M_DRILL: DrillData = {
  id: 'putt-15m-setup',
  category: 'putting',
  title: 'Putt corto · 1.5 metros',
  subtitle: 'Setup repetible · Stroke pendular',
  briefing: [
    'Hombros paralelos a la línea del putt.',
    'Stroke pendular — los hombros mueven, las manos no.',
    'Foco en el setup, no en el resultado.',
  ],
  patternDiagnosis:
    'Detectamos 4 three-putts en tus últimas 3 rondas. El 80% fueron desde menos de 2m. El problema no es lectura — es repetibilidad de setup.',
  schedule: {
    daysPerWeek: 3,
    repetitionsPerDay: 20,
    completedThisWeek: 0,
    totalThisWeek: 60,
    daysMarked: [1, 3, 5], // martes, jueves, sábado
  },
  voiceScript: [
    'Drill número uno. Putt corto, un metro y medio.',
    'Foco: setup repetible. La distancia es corta — la falla está en cómo apoyas los hombros.',
    'Veinte putts. Tres días esta semana. Martes, jueves, sábado.',
    'Cuando puedas hacer los veinte sin un solo error de setup, pasamos al siguiente nivel.',
  ],
}
