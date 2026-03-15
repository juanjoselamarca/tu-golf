'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { QRCodeSVG } from 'qrcode.react'

/* ── Types ─────────────────────────────────────────────── */
interface Jugador {
  id: string
  nombre: string
  user_id: string | null
  scores: Record<string, number>
}

interface RondaLibre {
  id: string
  codigo: string
  course_name: string
  tees: string
  holes: number
  fecha: string
  estado: string
  ronda_libre_jugadores: Jugador[]
}

/* ── Score helpers ─────────────────────────────────────── */
const scoreColor = (diff: number): string => {
  if (diff <= -2) return '#3b82f6'
  if (diff === -1) return '#22c55e'
  if (diff === 0)  return '#edeae4'
  if (diff === 1)  return '#c4992a'
  return '#dc2626'
}

const scoreLabel = (diff: number): string => {
  if (diff <= -2) return 'Eagle'
  if (diff === -1) return 'Birdie'
  if (diff === 0)  return 'Par'
  if (diff === 1)  return 'Bogey'
  if (diff === 2)  return 'Doble'
  return `+${diff}`
}

export default function ScorePage() {
  const params  = useParams()
  const router  = useRouter()
  const codigo  = params.codigo as string

  const [ronda,      setRonda]      = useState<RondaLibre | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [jugadorIdx, setJugadorIdx] = useState(0)
  const [scores,     setScores]     = useState<Record<string, Record<number, number>>>({})
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [showQR,     setShowQR]     = useState(false)
  const [parMap,     setParMap]     = useState<Record<number, number>>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Load ronda ─────────────────────────────────────── */
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()

      const { data } = await supabase
        .from('rondas_libres')
        .select('id, codigo, course_name, tees, holes, fecha, estado, ronda_libre_jugadores(id, nombre, user_id, scores)')
        .eq('codigo', codigo)
        .single()

      if (!data) { router.push('/dashboard'); return }

      const r = data as unknown as RondaLibre
      setRonda(r)

      // Build initial scores from DB
      const initialScores: Record<string, Record<number, number>> = {}
      for (const j of r.ronda_libre_jugadores) {
        initialScores[j.id] = {}
        if (j.scores) {
          for (const [k, v] of Object.entries(j.scores)) {
            initialScores[j.id][parseInt(k)] = v as number
          }
        }
      }
      setScores(initialScores)

      // Build par map (default par 4)
      const pm: Record<number, number> = {}
      for (let i = 1; i <= r.holes; i++) pm[i] = 4
      setParMap(pm)

      setLoading(false)
    }
    load()
  }, [codigo, router])

  /* ── Auto-save with debounce ─────────────────────────── */
  const saveScores = useCallback(async (jugadorId: string, holeScores: Record<number, number>) => {
    setSaving(true)
    setSaved(false)
    const supabase = createClient()
    const scoresObj: Record<string, number> = {}
    for (const [k, v] of Object.entries(holeScores)) {
      scoresObj[k] = v
    }
    await supabase
      .from('ronda_libre_jugadores')
      .update({ scores: scoresObj })
      .eq('id', jugadorId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [])

  const handleScoreChange = (jugadorId: string, hole: number, value: number) => {
    setScores((prev) => {
      const next = { ...prev, [jugadorId]: { ...(prev[jugadorId] ?? {}), [hole]: value } }
      // Debounce save
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        saveScores(jugadorId, next[jugadorId])
      }, 1000)
      return next
    })
    setSaved(false)
  }

  const handleManualSave = async () => {
    if (!ronda) return
    const j = ronda.ronda_libre_jugadores[jugadorIdx]
    if (!j) return
    await saveScores(j.id, scores[j.id] ?? {})
  }

  /* ── Totals ─────────────────────────────────────────── */
  const computeTotals = (jugadorId: string) => {
    const s = scores[jugadorId] ?? {}
    let gross = 0, parTotal = 0
    let outGross = 0, outPar = 0
    let inGross = 0, inPar = 0
    let holesPlayed = 0

    for (let h = 1; h <= (ronda?.holes ?? 18); h++) {
      const score = s[h]
      const par   = parMap[h] ?? 4
      if (score != null) {
        gross += score
        parTotal += par
        holesPlayed++
        if (h <= 9)  { outGross += score; outPar += par }
        else         { inGross  += score; inPar  += par }
      }
    }

    return { gross, parTotal, outGross, outPar, inGross, inPar, holesPlayed }
  }

  if (loading) {
    return (
      <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a8fa8' }}>
        Cargando ronda...
      </div>
    )
  }

  if (!ronda) return null

  const jugadores = ronda.ronda_libre_jugadores
  const activeJugador = jugadores[jugadorIdx]
  const { gross, parTotal: parTotalScore, outGross, outPar, inGross, inPar, holesPlayed } = computeTotals(activeJugador?.id ?? '')
  const vsPar = gross - parTotalScore
  const qrUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/ronda-libre/${codigo}`
    : `https://tu-golf.vercel.app/ronda-libre/${codigo}`

  const fechaDisplay = ronda.fecha
    ? new Date(ronda.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  return (
    <div style={{ background: '#070d18', minHeight: '100vh' }}>

      {/* ── Fixed Header ────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(14,28,47,0.97)', borderBottom: '1px solid rgba(196,153,42,0.15)', padding: '14px 16px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div>
              <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', color: '#edeae4', fontWeight: 600 }}>
                {ronda.course_name}
              </div>
              <div style={{ fontSize: '12px', color: '#7a8fa8', marginTop: '2px' }}>
                {fechaDisplay} &nbsp;·&nbsp;
                <span style={{ fontFamily: 'monospace', color: '#c4992a', fontWeight: 600 }}>{ronda.codigo}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <Link
                href={`/ronda-libre/${codigo}`}
                style={{ background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a', padding: '6px 12px', borderRadius: '7px', fontSize: '12px', textDecoration: 'none', fontWeight: 500 }}
              >
                Ver scores
              </Link>
              <button
                onClick={() => setShowQR(true)}
                style={{ background: 'rgba(196,153,42,0.08)', border: '1px solid rgba(196,153,42,0.3)', color: '#c4992a', padding: '6px 12px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
              >
                QR
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Player tabs ─────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid rgba(196,153,42,0.1)', background: '#0e1c2f' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', overflowX: 'auto' }}>
          {jugadores.map((j, i) => {
            const active = jugadorIdx === i
            return (
              <button
                key={j.id}
                onClick={() => setJugadorIdx(i)}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderBottom: active ? '2px solid #c4992a' : '2px solid transparent',
                  background: 'transparent',
                  color: active ? '#c4992a' : '#7a8fa8',
                  fontWeight: active ? 700 : 400,
                  fontSize: '14px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                }}
              >
                {j.nombre}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Scorecard ───────────────────────────────────── */}
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '16px' }}>

        {/* Holes */}
        <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.12)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '60px 50px 1fr', padding: '10px 16px', borderBottom: '1px solid rgba(196,153,42,0.1)', background: 'rgba(196,153,42,0.05)' }}>
            <span style={{ fontSize: '11px', color: '#7a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hoyo</span>
            <span style={{ fontSize: '11px', color: '#7a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Par</span>
            <span style={{ fontSize: '11px', color: '#7a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Score</span>
          </div>

          {activeJugador && Array.from({ length: ronda.holes }, (_, i) => i + 1).map((hole) => {
            const par     = parMap[hole] ?? 4
            const score   = scores[activeJugador.id]?.[hole]
            const diff    = score != null ? score - par : 0
            const color   = score != null ? scoreColor(diff) : '#7a8fa8'
            const label   = score != null ? scoreLabel(diff) : ''

            return (
              <div
                key={hole}
                style={{ display: 'grid', gridTemplateColumns: '60px 50px 1fr', padding: '10px 16px', borderBottom: '1px solid rgba(122,143,168,0.07)', alignItems: 'center' }}
              >
                <span style={{ fontSize: '15px', color: '#edeae4', fontWeight: 600 }}>{hole}</span>
                <span style={{ fontSize: '15px', color: '#7a8fa8' }}>{par}</span>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                  <button
                    onClick={() => {
                      const current = scores[activeJugador.id]?.[hole] ?? par
                      if (current > 1) handleScoreChange(activeJugador.id, hole, current - 1)
                    }}
                    style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(122,143,168,0.3)', background: 'transparent', color: '#edeae4', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    −
                  </button>

                  <div style={{ textAlign: 'center', minWidth: '52px' }}>
                    <div style={{ fontSize: '22px', fontWeight: 700, color, lineHeight: 1 }}>
                      {score ?? '—'}
                    </div>
                    {score != null && (
                      <div style={{ fontSize: '10px', color, marginTop: '2px' }}>{label}</div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      const current = scores[activeJugador.id]?.[hole] ?? (par - 1)
                      handleScoreChange(activeJugador.id, hole, current + 1)
                    }}
                    style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(122,143,168,0.3)', background: 'transparent', color: '#edeae4', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}

          {/* Totals */}
          {holesPlayed > 0 && (
            <div style={{ background: 'rgba(196,153,42,0.05)', borderTop: '1px solid rgba(196,153,42,0.15)' }}>
              {ronda.holes === 18 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid rgba(196,153,42,0.1)' }}>
                    <span style={{ fontSize: '13px', color: '#7a8fa8' }}>Out (1-9)</span>
                    <span style={{ fontSize: '13px', color: '#edeae4', fontWeight: 600 }}>
                      {outGross > 0 ? outGross : '—'}
                      {outGross > 0 && (
                        <span style={{ marginLeft: '8px', color: scoreColor(outGross - outPar), fontSize: '12px' }}>
                          ({outGross - outPar > 0 ? '+' : ''}{outGross - outPar})
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid rgba(196,153,42,0.1)' }}>
                    <span style={{ fontSize: '13px', color: '#7a8fa8' }}>In (10-18)</span>
                    <span style={{ fontSize: '13px', color: '#edeae4', fontWeight: 600 }}>
                      {inGross > 0 ? inGross : '—'}
                      {inGross > 0 && (
                        <span style={{ marginLeft: '8px', color: scoreColor(inGross - inPar), fontSize: '12px' }}>
                          ({inGross - inPar > 0 ? '+' : ''}{inGross - inPar})
                        </span>
                      )}
                    </span>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px' }}>
                <span style={{ fontSize: '14px', color: '#edeae4', fontWeight: 700 }}>Total ({holesPlayed}/{ronda.holes})</span>
                <span style={{ fontSize: '15px', fontWeight: 700 }}>
                  <span style={{ color: '#edeae4' }}>{gross}</span>
                  <span style={{ marginLeft: '10px', color: scoreColor(vsPar) }}>
                    ({vsPar > 0 ? '+' : ''}{vsPar})
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Save section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '13px', color: saving ? '#7a8fa8' : saved ? '#22c55e' : 'transparent' }}>
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : '.'}
          </div>
          <button
            onClick={handleManualSave}
            disabled={saving}
            style={{ background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '15px', padding: '12px 28px', borderRadius: '9px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            Guardar tarjeta
          </button>
        </div>
      </div>

      {/* ── QR Modal ─────────────────────────────────────── */}
      {showQR && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setShowQR(false)}
        >
          <div
            style={{ background: '#0e1c2f', borderRadius: '16px', padding: '32px', textAlign: 'center', border: '1px solid rgba(196,153,42,0.3)', maxWidth: '320px', width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', display: 'inline-block', marginBottom: '16px' }}>
              <QRCodeSVG value={qrUrl} size={200} />
            </div>
            <p style={{ color: '#edeae4', marginBottom: '6px', fontSize: '14px', margin: '0 0 6px' }}>Escanea para unirte</p>
            <p style={{ color: '#7a8fa8', fontSize: '12px', marginBottom: '16px', wordBreak: 'break-all', margin: '0 0 16px' }}>{qrUrl}</p>
            <button
              onClick={() => setShowQR(false)}
              style={{ background: '#c4992a', color: '#070d18', border: 'none', borderRadius: '8px', padding: '10px 28px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
