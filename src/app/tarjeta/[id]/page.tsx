'use client'

/**
 * /tarjeta/[id] — Página PÚBLICA de tarjeta de golf.
 *
 * Cualquier persona puede ver esta tarjeta sin login.
 * Se genera cuando un jugador comparte su ronda.
 * Si el visitante no tiene cuenta, se le muestra un CTA de registro.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Scorecard, { type ScorecardHole } from '@/components/Scorecard'
import { ArrowLeft, Share2 } from 'lucide-react'

interface RoundData {
  id: string
  course_name: string
  course_id: string | null
  total_gross: number | null
  total_neto: number | null
  holes_played: number | null
  played_at: string | null
  tee_color: string | null
  scores: number[] | null
  notes: string | null
  user_id: string
}

interface CourseHole {
  numero: number
  par: number
  stroke_index: number
}

export default function TarjetaPublicaPage() {
  const params = useParams()
  const id = params.id as string

  const [round, setRound] = useState<RoundData | null>(null)
  const [playerName, setPlayerName] = useState<string>('')
  const [courseHoles, setCourseHoles] = useState<CourseHole[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()

      // Check auth state
      const { data: { user } } = await supabase.auth.getUser()
      setIsLoggedIn(!!user)

      // Fetch round
      const { data: r, error } = await supabase
        .from('historical_rounds')
        .select('id, course_name, course_id, total_gross, total_neto, holes_played, played_at, tee_color, scores, notes, user_id')
        .eq('id', id)
        .single()

      if (error || !r) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setRound(r as RoundData)

      // Fetch player name
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', r.user_id)
        .single()
      setPlayerName(profile?.name ?? 'Jugador')

      // Fetch course holes
      if (r.course_id) {
        const { data: holes } = await supabase
          .from('course_holes')
          .select('numero, par, stroke_index')
          .eq('course_id', r.course_id)
          .order('numero')

        if (holes && holes.length > 0) {
          setCourseHoles(holes as CourseHole[])
        }
      }

      setLoading(false)
    }
    load()
  }, [id])

  const handleShare = async () => {
    const url = window.location.href
    const text = round
      ? `${playerName} jugó ${round.total_gross} en ${round.course_name} — Golfers+`
      : 'Tarjeta de golf — Golfers+'

    if (navigator.share) {
      try { await navigator.share({ title: text, url }); return } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // Loading
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif' }}>
        <div style={{ color: '#9ca3af', fontSize: 14 }}>Cargando tarjeta...</div>
      </div>
    )
  }

  // Not found
  if (notFound || !round) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif', padding: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⛳</div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 24, color: '#1a1a2e', marginBottom: 8 }}>Tarjeta no encontrada</h1>
        <p style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', maxWidth: 300 }}>
          Esta tarjeta no existe o fue eliminada.
        </p>
        <Link href="/" style={{ color: '#c4992a', textDecoration: 'none', fontSize: 14, marginTop: 16, fontWeight: 600 }}>
          Ir a Golfers+
        </Link>
      </div>
    )
  }

  // Build scorecard data
  const totalHoles = round.holes_played ?? 18
  const scorecardHoles: ScorecardHole[] = courseHoles.length > 0
    ? courseHoles.slice(0, totalHoles)
    : Array.from({ length: totalHoles }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))

  const scoresRecord: Record<string, number> = {}
  if (round.scores) {
    round.scores.forEach((s: number, i: number) => {
      if (s > 0) scoresRecord[String(i + 1)] = s
    })
  }

  const dateStr = round.played_at
    ? new Date(round.played_at + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f8', fontFamily: '"DM Sans", sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '12px 16px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href={isLoggedIn ? '/perfil/historial' : '/'} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
            <ArrowLeft size={16} />
            {isLoggedIn ? 'Mi historial' : 'Golfers+'}
          </Link>
          <button onClick={handleShare} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 12px', color: '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Share2 size={14} />
            {copied ? 'Enlace copiado' : 'Compartir'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 60px' }}>
        {/* Course header */}
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>
            {round.course_name}
          </h1>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            {dateStr}
            {round.tee_color && ` · ${round.tee_color}`}
            {` · ${totalHoles} hoyos`}
          </div>
        </div>

        {/* Scorecard */}
        <Scorecard
          holes={scorecardHoles}
          scores={scoresRecord}
          courseHandicap={0}
          modo="gross"
          formato="stroke_play"
          playerName={playerName}
          courseName={round.course_name}
          date={dateStr}
        />

        {/* Notes */}
        {round.notes && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#ffffff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>Notas</div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{round.notes}</div>
          </div>
        )}

        {/* CTA para usuarios no logueados */}
        {!isLoggedIn && (
          <div style={{ marginTop: 24, padding: '20px', background: '#ffffff', borderRadius: 12, border: '1px solid #e5e7eb', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', marginBottom: 6 }}>
              Registra tu propio score
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.5 }}>
              Crea tu cuenta gratis y juega con Golfers+
            </div>
            <Link href="/register" style={{
              display: 'inline-block', padding: '10px 24px', background: '#c4992a',
              color: '#1a1a2e', fontWeight: 700, fontSize: 14, borderRadius: 10,
              textDecoration: 'none',
            }}>
              Unirme gratis
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
