'use client'

/**
 * EditorialOverlay — la capa de UI editorial encima del Canvas 3D.
 *
 * Decisiones de diseño:
 *  - Playfair Display grande para el score (estética Augusta/Masters).
 *  - Gold gradient sobre el score = ASR-quality WOW visual.
 *  - Curva mental como sparkline lateral (no chart pesado) — los últimos
 *    5 hoyos como historia: el birdie del 6 se ve y la caída del 7 también.
 *  - Narrativa con stagger animado de Framer Motion: cada línea entra
 *    con delay creciente, sensación de coach hablándote en lugar de leer
 *    una lista de bullet points.
 *  - Vignette pasiva para que el ojo caiga al centro del 3D.
 */
import { motion } from 'framer-motion'
import type { RoundStory } from '@/lib/sample-round'

export default function EditorialOverlay({ story }: { story: RoundStory }) {
  const overParText = (() => {
    const diff = story.hole.playerScore - story.hole.par
    if (diff === 0) return 'PAR'
    if (diff < 0) return `${Math.abs(diff)} UNDER`
    return `+${diff} OVER`
  })()

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between">
      {/* Vignette pasiva */}
      <div className="vignette absolute inset-0" />

      {/* Header — club + fecha */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.9, ease: 'easeOut' }}
        className="relative z-10 flex items-center justify-between px-10 pt-8 text-bone-100"
      >
        <div>
          <p className="text-[10px] tracking-[0.3em] text-bone-100/60 uppercase">
            {story.course.date}
          </p>
          <p className="editorial text-2xl mt-1">{story.course.name}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] tracking-[0.3em] text-bone-100/60 uppercase">Jugador</p>
          <p className="editorial text-xl mt-1">{story.player.name}</p>
          <p className="text-[11px] text-bone-100/50 mt-0.5">
            Hándicap {story.player.handicap.toFixed(1)} · Índice {story.player.index.toFixed(1)}
          </p>
        </div>
      </motion.header>

      {/* Score editorial gigante — centro derecho */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.2, duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 self-end pr-16 -mt-32"
      >
        <p className="text-[11px] tracking-[0.4em] text-gold-400 uppercase mb-2 text-right">
          Hoyo {story.hole.number} · Par {story.hole.par} · {story.hole.yardsFromPlayerTee} yds
        </p>
        <p className="editorial gold-gradient text-[10rem] leading-none font-semibold text-right">
          {story.hole.playerScore}
        </p>
        <p className="editorial-italic text-2xl text-bone-100/80 text-right -mt-2">
          {overParText}
        </p>
        <p className="text-[11px] text-bone-100/50 text-right mt-3 max-w-xs ml-auto">
          Promedio del field: {story.hole.fieldAverage.toFixed(1)} · Ranking del hoyo:{' '}
          {story.hole.rankOfHole}/{story.hole.totalHolesInRound}
        </p>
      </motion.div>

      {/* Footer izquierdo — narrativa staggered */}
      <div className="relative z-10 px-10 pb-12 max-w-2xl">
        {story.narrative.map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 2.4 + i * 0.7, duration: 0.7, ease: 'easeOut' }}
            className={
              i === 0
                ? 'editorial text-3xl text-bone-100 mb-2 leading-tight'
                : 'editorial-italic text-base text-bone-100/75 mb-2 leading-relaxed'
            }
          >
            {line}
          </motion.p>
        ))}
      </div>

      {/* Curva mental — sparkline lateral derecha */}
      <motion.div
        initial={{ opacity: 0, x: 32 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.8, duration: 1.0, ease: 'easeOut' }}
        className="absolute right-10 top-1/2 -translate-y-1/2 z-10"
      >
        <p className="text-[10px] tracking-[0.3em] text-gold-400 uppercase mb-3 text-right">
          Curva mental
        </p>
        <MentalSparkline curve={story.mentalCurve} />
      </motion.div>
    </div>
  )
}

function MentalSparkline({ curve }: { curve: RoundStory['mentalCurve'] }) {
  const W = 140
  const H = 100
  const max = 100
  const points = curve.map((m, i) => {
    const x = (i / (curve.length - 1)) * W
    const y = H - (m.confidence / max) * H
    return `${x},${y}`
  })
  return (
    <svg width={W} height={H + 24} className="block">
      <defs>
        <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9a14a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#6b1f2a" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${H} ${points.join(' ')} ${W},${H}`}
        fill="url(#confGrad)"
        stroke="none"
      />
      <polyline points={points.join(' ')} fill="none" stroke="#c9a14a" strokeWidth="2" />
      {curve.map((m, i) => {
        const x = (i / (curve.length - 1)) * W
        const y = H - (m.confidence / max) * H
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={i === curve.length - 1 ? 4 : 2.5} fill="#c9a14a" />
            <text
              x={x}
              y={H + 16}
              fontSize={9}
              fill="#ebe3d3"
              textAnchor="middle"
              opacity={0.55}
            >
              {m.hole}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
