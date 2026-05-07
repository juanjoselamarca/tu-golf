'use client'

/**
 * CitedMarkdown — wrapper de ReactMarkdown que envuelve números citados
 * por el coach con un superscript clickeable que muestra la fuente.
 *
 * Heurística: si el coach menciona un número en su respuesta que matchea
 * exactamente el total_gross de la ronda consultada (vía tool), lo envuelve
 * con un <CitedNumber> que al hover/tap muestra "{cancha} · {fecha}".
 *
 * Conservador: solo números >= 30 (zona típica de scoring). Hoyo y handicap
 * (1-30) se ignoran para evitar false positives. Si la heurística falla, el
 * texto se renderiza idéntico al original.
 *
 * Spec: solicitud Juanjo 2026-05-07 — citas con fuente.
 */

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { RoundSummary } from './RoundMiniChart'

interface Props {
  text: string
  round?: RoundSummary | null
}

export function CitedMarkdown({ text, round }: Props) {
  // Si no hay datos de fuente, render plano
  if (!round || !round.total_gross || round.total_gross < 30) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p>{citeChildren(children, round)}</p>,
        li: ({ children }) => <li>{citeChildren(children, round)}</li>,
        strong: ({ children }) => <strong>{citeChildren(children, round)}</strong>,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

function citeChildren(children: React.ReactNode, round: RoundSummary): React.ReactNode {
  return React.Children.map(children, (child, idx) => {
    if (typeof child === 'string') {
      return <React.Fragment key={idx}>{citeString(child, round)}</React.Fragment>
    }
    return child
  })
}

function citeString(s: string, round: RoundSummary): React.ReactNode {
  const total = round.total_gross
  if (total == null) return s

  // Buscamos el número exacto del total_gross como palabra aislada.
  // Ej: total=85 → matches "85" pero no "185" ni "850".
  const re = new RegExp(`\\b${total}\\b`, 'g')
  const parts: Array<string | React.ReactElement> = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  let citationCount = 0

  while ((m = re.exec(s)) !== null) {
    if (m.index > lastIndex) parts.push(s.slice(lastIndex, m.index))
    parts.push(
      <CitedNumber
        key={`${m.index}-${citationCount++}`}
        number={total}
        source={formatSource(round)}
      />,
    )
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < s.length) parts.push(s.slice(lastIndex))

  if (parts.length === 1 && typeof parts[0] === 'string') return s
  return <>{parts}</>
}

function formatSource(round: RoundSummary): string {
  const course = round.course_name ?? 'una ronda'
  if (round.played_at) {
    const d = new Date(round.played_at)
    const fecha = d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
    return `${course} · ${fecha}`
  }
  return course
}

function CitedNumber({ number, source }: { number: number; source: string }) {
  const [open, setOpen] = React.useState(false)

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ fontWeight: 600 }}>{number}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={`Fuente del dato: ${source}`}
        style={{
          marginLeft: 1,
          padding: '0 3px',
          fontSize: '0.65em',
          fontWeight: 600,
          verticalAlign: 'super',
          color: '#8A6A16',
          background: 'rgba(196,153,42,0.15)',
          border: '1px solid rgba(196,153,42,0.30)',
          borderRadius: 4,
          cursor: 'help',
          lineHeight: 1.3,
        }}
      >
        fuente
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '120%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-card-light, #ffffff)',
            color: 'var(--text)',
            border: '1px solid rgba(196,153,42,0.35)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {source}
        </span>
      )}
    </span>
  )
}
