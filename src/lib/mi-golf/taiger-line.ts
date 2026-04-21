import type { NivelNombre, Tendencia, TaigerLine } from './types'

type Input = {
  tendencia: Tendencia
  golpesHastaSiguienteNivel: number | null
  nombreSiguienteNivel: NivelNombre | null
  taigerSessionCount: number
  totalRounds: number
}

const CTA_ANALISIS = { texto: 'Pedir análisis →', href: '/coach' }
const CTA_ACTIVAR = { texto: 'Hablar con tAIger →', href: '/coach' }
const CTA_REGISTRAR = { texto: 'Registrar ronda →', href: '/ronda-libre/nueva' }

export function getTaigerLine(inp: Input): TaigerLine {
  const {
    tendencia,
    golpesHastaSiguienteNivel,
    nombreSiguienteNivel,
    taigerSessionCount,
    totalRounds,
  } = inp

  if (tendencia && tendencia.direccion === 'up') {
    return {
      source: 'tendencia_mejora',
      texto: `Tu diferencial bajó ${tendencia.delta.toFixed(1)} en los últimos ${tendencia.dias} días.`,
      cta_texto: CTA_ANALISIS.texto,
      cta_href: CTA_ANALISIS.href,
    }
  }
  if (tendencia && tendencia.direccion === 'down') {
    return {
      source: 'tendencia_empeora',
      texto: `Tu diferencial subió ${tendencia.delta.toFixed(1)} en los últimos ${tendencia.dias} días.`,
      cta_texto: CTA_ANALISIS.texto,
      cta_href: CTA_ANALISIS.href,
    }
  }

  if (
    golpesHastaSiguienteNivel != null &&
    golpesHastaSiguienteNivel < 3 &&
    nombreSiguienteNivel
  ) {
    return {
      source: 'cerca_nivel',
      texto: `Estás ${golpesHastaSiguienteNivel.toFixed(1)} golpes de pasar a ${nombreSiguienteNivel}.`,
      cta_texto: CTA_ANALISIS.texto,
      cta_href: CTA_ANALISIS.href,
    }
  }

  if (taigerSessionCount > 0) {
    return {
      source: 'taiger_usado',
      texto: 'Revisá los patrones detectados en tu juego reciente.',
      cta_texto: 'Ver análisis →',
      cta_href: CTA_ANALISIS.href,
    }
  }

  if (totalRounds >= 5) {
    return {
      source: 'taiger_listo',
      texto: 'Tu coach con IA está listo para analizar tu juego.',
      cta_texto: CTA_ACTIVAR.texto,
      cta_href: CTA_ACTIVAR.href,
    }
  }

  return {
    source: 'fallback',
    texto: 'Registrá rondas para desbloquear insights personalizados.',
    cta_texto: CTA_REGISTRAR.texto,
    cta_href: CTA_REGISTRAR.href,
  }
}
