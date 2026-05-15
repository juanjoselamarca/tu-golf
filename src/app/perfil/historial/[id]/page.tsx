'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatLabel } from '@/golf/core/rules'
import Scorecard, { type ScorecardHole, type ScorecardProps } from '@/components/Scorecard'
import { trackEvent } from '@/lib/analytics'

/* ─── Types ────────────────────────────────────────────── */
interface HistoricalRound {
  id: string
  user_id: string
  course_name: string
  course_id?: string | null
  tee_color: string | null
  played_at: string
  scores: (number | null)[]
  total_gross: number | null
  holes_played: number | null
  notes: string | null
  formato_juego?: string
  modo_juego?: string
}

interface CourseHole {
  numero: number
  par: number | null
  stroke_index: number | null
}

/* ─── Helpers ──────────────────────────────────────────── */
function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/* ─── Page ─────────────────────────────────────────────── */
export default function HistorialDetallePage() {
  const params = useParams()
  const id = params.id as string

  const [round, setRound] = useState<HistoricalRound | null>(null)
  const [courseHoles, setCourseHoles] = useState<CourseHole[]>([])
  const [playerName, setPlayerName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) return

    const supabase = createClient()

    async function fetchData() {
      setLoading(true)
      setError(null)

      // 1. Fetch the round
      const { data: roundData, error: roundErr } = await supabase
        .from('historical_rounds')
        .select('*')
        .eq('id', id)
        .single()

      if (roundErr || !roundData) {
        setError('No se encontró la ronda')
        setLoading(false)
        return
      }

      setRound(roundData as HistoricalRound)

      // 2. Fetch course holes if course_id exists
      if (roundData.course_id) {
        const { data: holesData } = await supabase
          .from('course_holes')
          .select('numero, par, stroke_index')
          .eq('course_id', roundData.course_id)
          .order('numero')

        if (holesData && holesData.length > 0) {
          setCourseHoles(holesData as CourseHole[])
        }
      }

      // 3. Fetch player name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', roundData.user_id)
        .single()

      if (profile?.full_name) {
        setPlayerName(profile.full_name)
      }

      setLoading(false)
    }

    fetchData()
  }, [id])

  /* ─── Share ─────────────────────────────────────────── */
  const handleShare = async () => {
    const url = window.location.href
    const supabase = createClient()
    try {
      if (navigator.share) {
        await navigator.share({ title: `Tarjeta - ${round?.course_name}`, url })
        trackEvent(supabase, round?.user_id ?? null, 'historial_round_shared', { method: 'native' })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        trackEvent(supabase, round?.user_id ?? null, 'historial_round_shared', { method: 'clipboard' })
      }
    } catch {
      // User cancelled share dialog — no-op
    }
  }

  /* ─── Loading state ─────────────────────────────────── */
  if (loading) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <div style={{
          width: '32px', height: '32px', border: '3px solid #e5e7eb',
          borderTopColor: '#c4992a', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  /* ─── Error state ───────────────────────────────────── */
  if (error || !round) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px', textAlign: 'center', background: 'var(--bg)',
      }}>
        <p style={{ fontSize: '16px', color: 'var(--text-2)', marginBottom: '16px' }}>
          {error ?? 'Ronda no encontrada'}
        </p>
        <Link
          href="/perfil/historial"
          style={{
            color: '#c4992a', fontWeight: 600, fontSize: '14px',
            textDecoration: 'none',
          }}
        >
          Volver al historial
        </Link>
      </div>
    )
  }

  /* ─── Build scorecard data ──────────────────────────── */
  const totalHoles = round.holes_played ?? 18

  // Build a lookup from course holes
  const courseHoleMap: Record<number, CourseHole> = {}
  for (const h of courseHoles) {
    courseHoleMap[h.numero] = h
  }

  const scorecardHoles: ScorecardHole[] = Array.from({ length: totalHoles }, (_, i) => ({
    numero: i + 1,
    par: courseHoleMap[i + 1]?.par ?? null,
    stroke_index: courseHoleMap[i + 1]?.stroke_index ?? (i + 1),
  }))

  const scorecardScores: Record<string, number> = Object.fromEntries(
    (round.scores ?? [])
      .map((s: number | null, i: number) => [String(i + 1), s] as [string, number | null])
      .filter((pair): pair is [string, number] => pair[1] != null)
  )

  const dateStr = formatDateLong(round.played_at)
  const fmtLabel = formatLabel(
    round.formato_juego ?? 'stroke_play',
    round.modo_juego ?? null,
  )

  /* ─── Render ────────────────────────────────────────── */
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      padding: '0 0 40px',
    }}>
      {/* Header */}
      <div style={{
        maxWidth: '720px', margin: '0 auto',
        padding: '20px 16px 0',
      }}>
        {/* Back button */}
        <Link
          href="/perfil/historial"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            color: '#c4992a', fontWeight: 600, fontSize: '14px',
            textDecoration: 'none', marginBottom: '20px',
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>&larr;</span>
          Volver al historial
        </Link>

        {/* Round info */}
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '22px', fontWeight: 700, color: 'var(--text)',
            margin: '0 0 6px',
            lineHeight: 1.3,
          }}>
            {round.course_name}
          </h1>
          <p style={{
            fontSize: '14px', color: 'var(--text-2)', margin: 0,
            display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          }}>
            <span>{dateStr}</span>
            <span style={{ color: 'var(--text-3)' }}>&middot;</span>
            <span>{fmtLabel}</span>
            {round.tee_color && (
              <>
                <span style={{ color: 'var(--text-3)' }}>&middot;</span>
                <span>Tee {round.tee_color}</span>
              </>
            )}
            {round.holes_played && (
              <>
                <span style={{ color: 'var(--text-3)' }}>&middot;</span>
                <span>{round.holes_played} hoyos</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Scorecard */}
      <div style={{
        maxWidth: '720px', margin: '0 auto',
        padding: '0 16px',
      }}>
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        }}>
          <Scorecard
            holes={scorecardHoles}
            scores={scorecardScores}
            courseHandicap={0}
            modo="gross"
            formato={(round.formato_juego as ScorecardProps['formato']) ?? 'stroke_play'}
            playerName={playerName || undefined}
            courseName={round.course_name}
            date={dateStr}
            formatLabel={fmtLabel}
          />
        </div>

        {/* Notes */}
        {round.notes && (
          <div style={{
            marginTop: '16px', padding: '14px 16px',
            background: 'var(--bg-surface)', borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <p style={{
              fontSize: '12px', fontWeight: 600, color: 'var(--text-3)',
              margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              Notas
            </p>
            <p style={{
              fontSize: '14px', color: 'var(--text-2)', margin: 0,
              lineHeight: 1.5, whiteSpace: 'pre-wrap',
            }}>
              {round.notes}
            </p>
          </div>
        )}

        {/* Share button */}
        <div style={{
          marginTop: '20px', display: 'flex', justifyContent: 'center',
        }}>
          <button
            onClick={handleShare}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: copied ? '#16a34a' : '#c4992a',
              color: '#ffffff', fontWeight: 700, fontSize: '14px',
              padding: '12px 28px', borderRadius: '10px',
              border: 'none', cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {copied ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Enlace copiado
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                Compartir tarjeta
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
