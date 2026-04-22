// src/lib/mi-golf/types.ts

export type Tendencia = {
  direccion: 'up' | 'down' | 'flat'
  delta: number
  dias: number
} | null

export type InsightSource = 'stat' | 'comparativa' | 'benchmark' | 'fallback'

export type Insight = {
  source: InsightSource
  titulo: string
  detalle?: string
  href?: string
}

export type StatsForma = {
  promedioUltimas5: number | null
  mejorScore: { gross: number; vsPar: number } | null
  rondasJugadas: number
  canchaFavorita: { nombre: string; vecesJugada: number } | null
}

export type Tournament = {
  id: string
  name: string
  slug: string
  status: string
  date_start: string | null
  courses?: { nombre: string } | null
}

export type RondaLibre = {
  id: string
  codigo: string
  course_name: string
  fecha: string | null
  estado: string
}

export type HistoricalRound = {
  id: string
  total_gross: number | null
  course_name: string | null
  played_at: string | null
  diferencial: number | null
  holes_played: number | null
  // v6 Última Ronda Express: alimentan UltimaRondaHero.tsx (activity bar).
  // Opcionales para no romper fixtures existentes de mejor-del-mes/stats/tendencia.
  scores?: number[] | null
  parPerHole?: number[] | null
}

export type NivelNombre = 'Novato' | 'Amateur' | 'Intermedio' | 'Avanzado' | 'Scratch'

export type Nivel = {
  nombre: NivelNombre
  indice_min: number
  indice_max: number
  posicion_en_banda: number
  golpes_hasta_siguiente: number | null
  nombre_siguiente: NivelNombre | null
}

export type TaigerLineSource =
  | 'tendencia_mejora'
  | 'tendencia_empeora'
  | 'cerca_nivel'
  | 'taiger_usado'
  | 'taiger_listo'
  | 'fallback'

export type TaigerLine = {
  source: TaigerLineSource
  texto: string
  cta_texto: string
  cta_href: string
}

export type ComunidadMensaje = {
  texto: string
  href: string
} | null
