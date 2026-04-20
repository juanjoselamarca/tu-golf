// src/lib/mi-golf/insights.ts
import type { HistoricalRound, Insight } from './types'

type Input = {
  userId: string
  fecha: string
  historico: HistoricalRound[]
  taigerSessionCount: number
}

function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

type Generator = (inp: Input) => Insight | null

const genMejorHoyoDelMes: Generator = () => null

const genCanchaFavorita: Generator = ({ historico }) => {
  if (historico.length < 3) return null
  const contador = new Map<string, number>()
  for (const r of historico) {
    if (!r.course_name) continue
    contador.set(r.course_name, (contador.get(r.course_name) ?? 0) + 1)
  }
  let topNombre: string | null = null
  let topCount = 0
  contador.forEach((count, nombre) => {
    if (count > topCount) {
      topCount = count
      topNombre = nombre
    }
  })
  if (topCount < 2 || !topNombre) return null
  return {
    source: 'stat' as const,
    titulo: `Has jugado ${topCount} veces en ${topNombre}`,
    detalle: 'Es tu cancha más frecuente del último período.',
  }
}

const genRachaDiferencial: Generator = ({ historico }) => {
  const conDif = historico.filter((r) => r.diferencial != null).slice(0, 5)
  if (conDif.length < 3) return null
  const promedio = conDif.reduce((s, r) => s + (r.diferencial ?? 0), 0) / conDif.length
  return {
    source: 'comparativa',
    titulo: `Tu diferencial promedio en las últimas ${conDif.length} rondas es ${promedio.toFixed(1)}`,
    detalle: 'Tenlo en mente cuando elijas cancha y tees hoy.',
  }
}

const genCoachPrompt: Generator = ({ taigerSessionCount, historico }) => {
  if (historico.length >= 5 && taigerSessionCount === 0) {
    return {
      source: 'fallback',
      titulo: 'Tu coach con IA está listo',
      detalle: 'Con 5+ rondas, tAIger+ puede detectar patrones de tu juego.',
      href: '/coach',
    }
  }
  return null
}

const genFallbackGenerico: Generator = ({ historico }) => {
  if (historico.length === 0) {
    return {
      source: 'fallback',
      titulo: 'Registra tu primera ronda',
      detalle: 'Tus insights se desbloquean después de jugar o importar rondas.',
      href: '/ronda-libre/nueva',
    }
  }
  return {
    source: 'fallback',
    titulo: 'Sigue jugando',
    detalle: 'Cada ronda nueva afina tu índice y los insights de tAIger+.',
  }
}

const generadores: Generator[] = [
  genCanchaFavorita,
  genRachaDiferencial,
  genMejorHoyoDelMes,
  genCoachPrompt,
  genFallbackGenerico,
]

export function selectDailyInsight(inp: Input): Insight {
  const candidatos: Insight[] = []
  for (const g of generadores) {
    const out = g(inp)
    if (out) candidatos.push(out)
  }

  if (candidatos.length === 0) {
    return {
      source: 'fallback',
      titulo: 'Bienvenido a Golfers+',
      detalle: 'Tu próxima ronda te espera.',
    }
  }

  // Priorizar stat/comparativa sobre fallback
  const nonFallback = candidatos.filter((c) => c.source !== 'fallback')
  const toSelect = nonFallback.length > 0 ? nonFallback : candidatos

  const hash = hashCode(`${inp.userId}-${inp.fecha}`)
  const selected = toSelect[hash % toSelect.length]
  return selected
}
