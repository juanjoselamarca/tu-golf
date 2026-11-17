'use client'

/**
 * Chart de /perfil/stats — ÚNICO import estático de recharts en la app.
 * Este módulo se carga vía next/dynamic({ ssr: false }) desde StatsView, así
 * recharts (~100KB+ gz) queda FUERA del First Load JS de la ruta y se baja en
 * un chunk aparte después del primer pintado. No importar este archivo de
 * forma estática desde código de página.
 */

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip,
} from 'recharts'
import { formatOverUnder } from '@/golf/core/rules'
import type { PuntoScoreVsPar } from '@/golf/stats/rondas-normalizadas'
import { C } from './tokens'

const axisTick = { fill: C.muted, fontSize: 13 }

function fmtFecha(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}

/**
 * Ticks redondos del eje Y (múltiplos de 5, o de 10 si el rango es amplio) en vez de
 * los −2/+5/+12 que salen de dataMin−2..dataMax+2.
 */
export function ticksRedondos(valores: number[]): number[] {
  if (valores.length === 0) return [0]
  const min = Math.min(...valores, 0)
  const max = Math.max(...valores, 0)
  const paso = max - min > 30 ? 10 : 5
  const desde = Math.floor(min / paso) * paso
  const hasta = Math.ceil(max / paso) * paso
  const ticks: number[] = []
  for (let v = desde; v <= hasta; v += paso) ticks.push(v)
  return ticks
}

/**
 * "Tu score vs par": Y = vsPar de cada ronda del bucket de la pantalla, en orden
 * cronológico. Sin línea de promedio: el promedio vive en la cifra héroe. Las rondas
 * fuera de los números (bola compartida, match play, parciales, score imposible) no llegan acá.
 */
export function ScoreVsParChart({ puntos }: { puntos: PuntoScoreVsPar[] }) {
  const data = puntos.map(p => ({ ...p, fecha: fmtFecha(p.played_at) }))
  const ticks = ticksRedondos(puntos.map(p => p.vsPar))
  // Medio paso bajo el tick inferior: si no, su etiqueta choca con las fechas del eje X.
  const holgura = ticks.length > 1 ? (ticks[1] - ticks[0]) / 2 : 1
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <XAxis dataKey="fecha" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis
          tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false}
          ticks={ticks} domain={[ticks[0] - holgura, ticks[ticks.length - 1]]} tickFormatter={(v: number) => formatOverUnder(v)}
        />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
          formatter={(v) => [formatOverUnder(Number(v)), 'Vs par']}
        />
        <Line
          type="linear"
          dataKey="vsPar"
          stroke={C.gold}
          strokeWidth={1.5}
          dot={{ r: 3.5, fill: C.gold, strokeWidth: 0 }}
          activeDot={false}
          isAnimationActive={false}
          name="Vs par"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
