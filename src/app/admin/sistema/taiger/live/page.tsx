'use client'

/**
 * Live Feed del cerebro de tAIger+ — radar de torre de control.
 *
 * Polling cada 3s con ?since=<lastId> para traer solo lo nuevo.
 * Cada evento entra desde arriba con animación slideInTop.
 * Eventos importantes (alucinación detectada, plan asignado, error de tool)
 * son cards grandes con borde de color. Los rutinarios (tool_called OK,
 * round_processed) son líneas finas para no saturar.
 *
 * Spec: solicitud Juanjo 2026-05-06.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'
import type { NarratorOutput } from '@/lib/coach-event-narrator'

interface FeedItem {
  id: number
  user_id: string
  user_name: string
  type: string
  related_session_id: string | null
  related_plan_id: string | null
  created_at: string
  narration: NarratorOutput
  raw_payload: Record<string, unknown>
}

const POLL_MS = 3000
const KEEP_LAST = 200 // máximo en pantalla, evita memory creep

export default function LiveFeedPage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [lastId, setLastId] = useState<number>(0)
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState<'all' | 'important' | 'errors'>('all')
  const [error, setError] = useState<string | null>(null)
  const [serverTime, setServerTime] = useState<string | null>(null)
  const fetchInFlight = useRef(false)

  async function fetchOnce(since?: number) {
    if (fetchInFlight.current) return
    fetchInFlight.current = true
    try {
      const url = since != null && since > 0
        ? `/api/admin/taiger/live-feed?since=${since}&limit=50`
        : `/api/admin/taiger/live-feed?limit=50`
      const r = await fetch(url, { credentials: 'include' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      const incoming: FeedItem[] = d.items ?? []
      setServerTime(d.server_time)
      if (incoming.length > 0) {
        setItems(prev => {
          const merged = [...incoming.slice().reverse(), ...prev]
          // dedup por id (en caso de doble fetch)
          const seen = new Set<number>()
          const out: FeedItem[] = []
          for (const it of merged) {
            if (seen.has(it.id)) continue
            seen.add(it.id)
            out.push(it)
            if (out.length >= KEEP_LAST) break
          }
          return out
        })
        if (typeof d.max_id === 'number' && d.max_id > 0) setLastId(d.max_id)
      }
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      fetchInFlight.current = false
    }
  }

  // Initial load
  useEffect(() => {
    fetchOnce()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Polling
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => fetchOnce(lastId), POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, lastId])

  const visible = items.filter(it => {
    if (filter === 'important') return it.narration.important
    if (filter === 'errors') return it.narration.level === 'danger'
    return true
  })

  return (
    <div style={pageStyle}>
      <style>{`
        @keyframes slideInTop { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .feed-item { animation: slideInTop 280ms ease-out; }
        @keyframes pulse-dot { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        .live-dot { animation: pulse-dot 1.5s ease-in-out infinite; }
      `}</style>

      <div style={headerRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ ...adminFonts.sectionTitle, fontSize: '1.5rem', margin: 0 }}>
            Cerebro de tAIger+ — En vivo
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: paused ? adminColors.gray : adminColors.green, fontSize: 12 }}>
            <span className={paused ? '' : 'live-dot'} style={{
              width: 8, height: 8, borderRadius: 4,
              background: paused ? adminColors.gray : adminColors.green,
              display: 'inline-block',
            }} />
            {paused ? 'pausado' : 'en vivo'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['all', 'important', 'errors'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={filterBtn(filter === f)}>
              {f === 'all' ? 'Todo' : f === 'important' ? 'Solo importantes' : 'Solo errores'}
            </button>
          ))}
          <button onClick={() => setPaused(p => !p)} style={pauseBtn}>
            {paused ? '▶ Reanudar' : '⏸ Pausar'}
          </button>
        </div>
      </div>

      <div style={{ color: adminColors.gray, fontSize: 12, marginBottom: 16 }}>
        Polling cada 3 segundos · {visible.length} de {items.length} eventos · {serverTime ? `servidor ${new Date(serverTime).toLocaleTimeString('es-CL')}` : ''}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 12, color: adminColors.gray }}>
        <Link href="/admin/sistema/taiger" style={navLink}>← Resumen agregado</Link>
        <span>·</span>
        <Link href="/admin/sistema/taiger/dashboard" style={navLink}>Efectividad de planes →</Link>
      </div>

      {error && (
        <div style={{ ...adminCard, padding: 12, marginBottom: 12, borderColor: adminColors.red, color: adminColors.red, fontSize: 13 }}>
          Error: {error}
        </div>
      )}

      {visible.length === 0 && (
        <div style={{ ...adminCard, padding: 32, textAlign: 'center' as const, color: adminColors.gray }}>
          {items.length === 0
            ? 'Aún no hay eventos. Conversá con tAIger+ desde la app y los verás aparecer acá.'
            : 'Sin eventos que coincidan con el filtro.'}
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(it => (
          <FeedCard key={it.id} item={it} />
        ))}
      </ul>
    </div>
  )
}

function FeedCard({ item }: { item: FeedItem }) {
  const { narration } = item
  const color = levelColor(narration.level)
  const time = new Date(item.created_at)
  const timeStr = time.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const ago = relativeAgo(time)

  if (narration.important) {
    return (
      <li className="feed-item" style={{
        ...adminCard, padding: 14, borderLeft: `3px solid ${color}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, lineHeight: 1 }}>{narration.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: adminColors.ivory, fontWeight: 600 }}>{narration.title}</div>
              {narration.subtitle && (
                <div style={{ fontSize: 12, color: adminColors.gray, marginTop: 4 }}>{narration.subtitle}</div>
              )}
              <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 11, color: adminColors.gray }}>
                <Link href={`/admin/sistema/taiger/${item.user_id}`} style={navLink}>{item.user_name}</Link>
                <span>· {timeStr}</span>
                <span>· {ago}</span>
              </div>
            </div>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li className="feed-item" style={{
      padding: '6px 12px',
      borderBottom: `1px solid ${adminColors.border}`,
      fontSize: 12,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      color: adminColors.gray,
    }}>
      <div style={{ display: 'flex', gap: 8, minWidth: 0, flex: 1 }}>
        <span style={{ color }}>{narration.icon}</span>
        <span style={{ color: adminColors.ivory }}>{narration.title}</span>
        {narration.subtitle && <span style={{ color: adminColors.gray }}>· {narration.subtitle}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Link href={`/admin/sistema/taiger/${item.user_id}`} style={navLinkMuted}>{item.user_name}</Link>
        <span>· {timeStr}</span>
      </div>
    </li>
  )
}

function relativeAgo(date: Date): string {
  const ms = Date.now() - date.getTime()
  if (ms < 60000) return `hace ${Math.floor(ms / 1000)}s`
  if (ms < 3600000) return `hace ${Math.floor(ms / 60000)} min`
  if (ms < 86400000) return `hace ${Math.floor(ms / 3600000)} hs`
  return `hace ${Math.floor(ms / 86400000)} días`
}

function levelColor(level: NarratorOutput['level']): string {
  switch (level) {
    case 'success': return adminColors.green
    case 'warning': return adminColors.yellow
    case 'danger': return adminColors.red
    case 'info': return adminColors.blue
    default: return adminColors.gray
  }
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  background: adminColors.bg,
  color: adminColors.ivory,
  minHeight: '100vh',
  maxWidth: 1080,
  margin: '0 auto',
}

const headerRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: 8, gap: 12, flexWrap: 'wrap',
}

const navLink: React.CSSProperties = { color: adminColors.gold, textDecoration: 'none' }
const navLinkMuted: React.CSSProperties = { color: adminColors.gray, textDecoration: 'underline', textDecorationColor: adminColors.border }

function filterBtn(active: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    fontSize: 12,
    border: `1px solid ${active ? adminColors.gold : adminColors.border}`,
    background: active ? adminColors.goldDim : 'transparent',
    color: active ? adminColors.gold : adminColors.gray,
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  }
}

const pauseBtn: React.CSSProperties = {
  padding: '6px 12px', fontSize: 12, border: `1px solid ${adminColors.border}`,
  background: 'transparent', color: adminColors.ivory, borderRadius: 4, cursor: 'pointer',
}
