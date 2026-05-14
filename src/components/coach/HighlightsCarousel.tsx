'use client'

import { Children, useEffect, useRef, useState, type CSSProperties } from 'react'

interface Props {
  label: string
  children: React.ReactNode
}

export function HighlightsCarousel({ label, children }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const total = Children.count(children)
  const [current, setCurrent] = useState(1)

  useEffect(() => {
    const track = trackRef.current
    if (!track || total <= 1) return
    let frame = 0
    const handleScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const firstChild = track.firstElementChild as HTMLElement | null
        if (!firstChild) return
        const childWidth = firstChild.offsetWidth + 12 // gap del track
        if (childWidth <= 0) return
        const idx = Math.round(track.scrollLeft / childWidth) + 1
        setCurrent(Math.min(Math.max(1, idx), total))
      })
    }
    track.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      track.removeEventListener('scroll', handleScroll)
      cancelAnimationFrame(frame)
    }
  }, [total])

  const labelStyle: CSSProperties = {
    padding: '0 20px',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '10.5px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'var(--text-3)',
    fontWeight: 600,
    fontFamily: '"DM Mono", monospace',
  }
  const trackStyle: CSSProperties = {
    display: 'flex',
    gap: '12px',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    padding: '0 20px 12px',
    WebkitOverflowScrolling: 'touch',
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={labelStyle}>
        <span>{label}</span>
        {total > 1 && (
          <span style={{ fontFamily: '"DM Mono", monospace', letterSpacing: 0, textTransform: 'none', fontWeight: 500, color: 'var(--text-3)' }}>
            {current}/{total}
          </span>
        )}
      </div>
      <div ref={trackRef} style={trackStyle} className="hide-scrollbar">
        {children}
      </div>
    </div>
  )
}
