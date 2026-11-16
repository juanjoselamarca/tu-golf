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

interface DotProps { cx?: number; cy?: number; index?: number; payload?: PuntoScoreVsPar }

/** 18 hoyos = punto lleno; 9 hoyos = punto hueco (escala 18, más volátil). Precedente: coach/progreso AvanceChart. */
function PuntoRonda({ cx, cy, index, payload }: DotProps) {
  if (cx == null || cy == null || !payload) return <g key={index} />
  return payload.es9
    ? <circle key={index} cx={cx} cy={cy} r={3.5} fill="var(--bg-surface)" stroke={C.gold} strokeWidth={1.5} />
    : <circle key={index} cx={cx} cy={cy} r={3.5} fill={C.gold} />
}

/**
 * "Tu score vs par": Y = vsPar en escala de 18 hoyos (una de 9 vale el doble),
 * puntos en orden cronológico. Sin línea de promedio: el promedio
 * vive en la cifra héroe de StatsView (un solo bucket de hoyos). Las rondas fuera de los números
 * (bola compartida, match play, parciales, score imposible) no llegan acá.
 */
export function ScoreVsParChart({ puntos }: { puntos: PuntoScoreVsPar[] }) {
  const data = puntos.map(p => ({ ...p, fecha: fmtFecha(p.played_at) }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <XAxis dataKey="fecha" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis
          tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false}
          domain={['dataMin - 2', 'dataMax + 2']} tickFormatter={(v: number) => formatOverUnder(v)}
        />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
          formatter={(v, _n, item) => [
            `${formatOverUnder(Number(v))}${(item?.payload as PuntoScoreVsPar | undefined)?.es9 ? ' (9 hoyos ×2)' : ''}`,
            'Vs par',
          ]}
        />
        <Line
          type="linear"
          dataKey="vsPar18"
          stroke={C.gold}
          strokeWidth={1.5}
          dot={PuntoRonda}
          activeDot={false}
          isAnimationActive={false}
          name="Vs par"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
