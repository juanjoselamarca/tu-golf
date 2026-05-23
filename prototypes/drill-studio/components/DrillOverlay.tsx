'use client'

/**
 * DrillOverlay — la capa editorial sobre el Canvas 3D.
 *
 * 3 zonas:
 *  - Header: categoria + título del drill (Playfair gold)
 *  - Sidebar derecha: schedule semanal + progress circular + briefing
 *  - Footer izquierda: diagnosis del patrón + coach voice player
 *
 * Vibe Augusta / Apple Fitness+ — editorial pero no abrumador.
 */
import { motion } from 'framer-motion'
import type { DrillData } from '@/lib/sample-drill'
import CoachVoice from './CoachVoice'

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export default function DrillOverlay({ drill }: { drill: DrillData }) {
  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col">
      {/* Vignette pasiva — refuerza el foco al centro */}
      <div className="vignette absolute inset-0" />

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.0, delay: 0.3, ease: 'easeOut' }}
        className="relative z-10 flex items-start justify-between px-12 pt-10"
      >
        <div>
          <p className="text-[10px] tracking-[0.4em] text-gold-400 uppercase mb-2">
            Plan del coach · {drill.category}
          </p>
          <h1 className="editorial text-5xl text-bone-100 leading-none">
            {drill.title.split('·')[0].trim()}
          </h1>
          <p className="editorial-italic text-xl text-bone-200 mt-2">
            {drill.subtitle}
          </p>
        </div>

        {/* Right header — mini brand mark */}
        <div className="text-right">
          <p className="editorial gold-text text-2xl leading-none">Golfers+</p>
          <p className="text-[9px] tracking-[0.3em] text-bone-200/60 uppercase mt-1">
            Drill Studio · Prototipo
          </p>
        </div>
      </motion.header>

      {/* Right sidebar — schedule + progress + briefing */}
      <motion.aside
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1.1, delay: 1.4, ease: 'easeOut' }}
        className="relative z-10 self-end mr-12 mt-auto mb-auto max-w-xs w-full"
      >
        <div className="thin-rule mb-5" />

        <p className="text-[10px] tracking-[0.4em] text-gold-400 uppercase mb-3">
          Esta semana
        </p>

        {/* Calendario 7 días */}
        <div className="flex gap-2 mb-7">
          {DAYS.map((d, i) => {
            const marked = drill.schedule.daysMarked.includes(i)
            return (
              <div key={i} className="flex flex-col items-center flex-1">
                <span className="text-[9px] tracking-[0.2em] text-bone-200/55 uppercase mb-1.5">
                  {d}
                </span>
                <div
                  className={
                    marked
                      ? 'w-7 h-7 rounded-full flex items-center justify-center'
                      : 'w-7 h-7 rounded-full border border-bone-100/15 flex items-center justify-center'
                  }
                  style={
                    marked
                      ? {
                          background:
                            'radial-gradient(circle at 30% 30%, #ebd285, #c9a14a 70%, #876523)',
                          boxShadow: '0 0 8px rgba(201,161,74,0.35)',
                        }
                      : undefined
                  }
                >
                  {marked && (
                    <span className="text-[10px] font-semibold text-ink-900">●</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Progress circular */}
        <div className="flex items-center gap-4 mb-7">
          <ProgressRing
            value={drill.schedule.completedThisWeek}
            total={drill.schedule.totalThisWeek}
          />
          <div>
            <p className="text-[10px] tracking-[0.3em] text-gold-400 uppercase">
              Progreso
            </p>
            <p className="editorial text-2xl text-bone-100 leading-none mt-1">
              {drill.schedule.completedThisWeek} <span className="text-bone-200/55">/</span>{' '}
              {drill.schedule.totalThisWeek}
            </p>
            <p className="text-[10px] text-bone-200/60 mt-1">
              {drill.schedule.repetitionsPerDay} putts × {drill.schedule.daysPerWeek} días
            </p>
          </div>
        </div>

        <div className="thin-rule mb-4" />

        {/* Briefing */}
        <p className="text-[10px] tracking-[0.4em] text-gold-400 uppercase mb-3">
          Foco
        </p>
        <ul className="space-y-2">
          {drill.briefing.map((line, i) => (
            <li
              key={i}
              className="editorial-italic text-sm text-bone-100/85 leading-snug flex gap-2"
            >
              <span className="text-gold-400">·</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </motion.aside>

      {/* Footer — diagnosis + coach voice */}
      <motion.footer
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.0, delay: 2.0, ease: 'easeOut' }}
        className="relative z-10 px-12 pb-10 max-w-2xl"
      >
        <p className="text-[10px] tracking-[0.4em] text-gold-400 uppercase mb-2">
          Patrón detectado
        </p>
        <p className="editorial text-lg text-bone-100 leading-snug mb-5 max-w-xl">
          {drill.patternDiagnosis}
        </p>
        <div className="thin-rule mb-5 max-w-xs" />
        <CoachVoice drill={drill} />
      </motion.footer>
    </div>
  )
}

function ProgressRing({ value, total }: { value: number; total: number }) {
  const radius = 22
  const circ = 2 * Math.PI * radius
  const pct = total > 0 ? value / total : 0
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="flex-shrink-0">
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke="rgba(235,227,211,0.15)"
        strokeWidth="3"
      />
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke="#c9a14a"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        transform="rotate(-90 28 28)"
      />
      <text
        x="28"
        y="32"
        textAnchor="middle"
        fontSize="11"
        fill="#ebe3d3"
        fontFamily="Playfair Display, Georgia, serif"
      >
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}
