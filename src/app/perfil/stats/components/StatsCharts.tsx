'use client'

/**
 * Charts de /perfil/stats — ÚNICO import estático de recharts en la app.
 * Este módulo se carga vía next/dynamic({ ssr: false }) desde StatsView, así
 * recharts (~100KB+ gz) queda FUERA del First Load JS de la ruta y se baja en
 * un chunk aparte después del primer pintado. No importar este archivo de
 * forma estática desde código de página.
 */

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, PieChart, Pie, Cell,
  ReferenceLine,
} from 'recharts'
import { C } from './tokens'

/* ── GWI gauge (dona 220°→-40°) ── */
export function GwiGauge({ value }: { value: number }) {
  const data = [
    { name: 'GWI', value },
    { name: 'Rest', value: 100 - value },
  ]
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          startAngle={220}
          endAngle={-40}
          innerRadius="78%"
          outerRadius="100%"
          dataKey="value"
          stroke="none"
        >
          <Cell fill={C.green} />
          <Cell fill={C.greenDim} />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  )
}

const tooltipStyles = {
  contentStyle: { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' },
  labelStyle: { color: C.ivory },
  itemStyle: { color: C.ivory },
}

const axisTick = { fill: C.muted, fontSize: 10 }

/* ── Evolución de score ── */
export function ScoreEvolutionChart({ data }: { data: { date: string; gross: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
        <Tooltip {...tooltipStyles} />
        <defs>
          <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.gold} stopOpacity={0.15} />
            <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Line
          type="monotone"
          dataKey="gross"
          stroke={C.gold}
          strokeWidth={2}
          dot={{ r: 3, fill: C.gold }}
          fill="url(#goldFill)"
          name="Gross"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* ── Tendencia de scoring (línea + promedio de referencia) ── */
export function ScoringTrendChart({ data, avgScore }: {
  data: { date: string; score: number; promedio: number }[]
  avgScore: number
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
        <Tooltip {...tooltipStyles} />
        <Line
          type="monotone"
          dataKey="score"
          stroke={C.gold}
          strokeWidth={2}
          dot={{ r: 3, fill: C.gold }}
          name="Score"
        />
        <ReferenceLine
          y={avgScore}
          stroke={C.muted}
          strokeDasharray="6 4"
          label={{ value: 'Promedio', fill: C.muted, fontSize: 10, position: 'insideTopRight' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
