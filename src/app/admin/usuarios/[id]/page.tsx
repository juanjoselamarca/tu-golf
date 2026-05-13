'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { adminColors, adminCard, adminFonts } from '@/components/admin/admin-tokens'
import { inferHoles } from '@/golf/core/holes'

interface UserProfile {
  id: string; name: string; email: string; role: string
  indice: number | null; indice_golfers: number | null
  nivel: number | null; nivel_updated_at: string | null
  cpi_score: number | null; cpi_status: string | null; cpi_trend: number | null
  created_at: string; avatar_url: string | null
  handicap: number | null
}

interface HistoricalRound {
  id: string; course_name: string; total_gross: number
  diferencial: number | null; played_at: string; source: string
}

interface TournamentPlayed {
  id: string; status: string
  tournaments: { name: string; slug: string; date_start: string | null } | null
  rounds: { total_gross: number; total_net: number; status: string }[]
}

interface TaigerSession {
  id: string; session_type: string; created_at: string
  rating: number | null
}

interface PlayerPattern {
  pattern_type: string; confidence: number; status: string
  data_points: number; last_updated: string
}

interface RondaLibre {
  id: string; created_at: string
  rondas_libres: { codigo: string; course_name: string; fecha: string } | null
  scores: Record<string, number>
}

const NIVEL_LABELS: Record<number, string> = {
  1: 'Rookie', 2: 'En Cancha', 3: 'Activo', 4: 'Scratch+', 5: 'Golfer+',
}

const PATTERN_LABELS: Record<string, string> = {
  back_nine_collapse: 'Colapso back 9',
  front_nine_struggles: 'Dificultades front 9',
  first_hole_anxiety: 'Ansiedad hoyo 1',
  par_3_weakness: 'Debilidad par 3',
  short_game_weakness: 'Juego corto debil',
  post_bogey_spiral: 'Espiral post-bogey',
  three_putt_frequency: 'Frecuencia 3 putts',
  driving_inconsistency: 'Driving inconsistente',
  pressure_deterioration: 'Deterioro bajo presion',
}

export default function UserDetailPage() {
  const { id } = useParams() as { id: string }
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [rounds, setRounds] = useState<HistoricalRound[]>([])
  const [tournaments, setTournaments] = useState<TournamentPlayed[]>([])
  const [sessions, setSessions] = useState<TaigerSession[]>([])
  const [patterns, setPatterns] = useState<PlayerPattern[]>([])
  const [rondas, setRondas] = useState<RondaLibre[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()

      const [profileRes, roundsRes, tourneysRes, sessionsRes, patternsRes, rondasRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase.from('historical_rounds')
          .select('id, course_name, total_gross, diferencial, played_at, source, holes_played, scores')
          .eq('user_id', id).order('played_at', { ascending: false }).limit(50),
        supabase.from('players')
          .select('id, status, tournaments(name, slug, date_start), rounds(total_gross, total_net, status)')
          .eq('user_id', id).order('created_at', { ascending: false }).limit(20),
        supabase.from('taiger_sessions')
          .select('id, session_type, created_at, rating')
          .eq('user_id', id).order('created_at', { ascending: false }).limit(30),
        supabase.from('player_patterns')
          .select('pattern_type, confidence, status, data_points, last_updated')
          .eq('user_id', id).order('confidence', { ascending: false }),
        supabase.from('ronda_libre_jugadores')
          .select('id, created_at, scores, rondas_libres(codigo, course_name, fecha)')
          .eq('user_id', id).order('created_at', { ascending: false }).limit(20),
      ])

      setProfile(profileRes.data as unknown as UserProfile)
      setRounds((roundsRes.data as unknown as HistoricalRound[]) || [])
      setTournaments((tourneysRes.data as unknown as TournamentPlayed[]) || [])
      setSessions((sessionsRes.data as unknown as TaigerSession[]) || [])
      setPatterns((patternsRes.data as unknown as PlayerPattern[]) || [])
      setRondas((rondasRes.data as unknown as RondaLibre[]) || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: adminColors.gray }}>
        Cargando usuario...
      </div>
    )
  }

  if (!profile) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: adminColors.gray }}>
        Usuario no encontrado
      </div>
    )
  }

  const totalRondas = rounds.length + rondas.length
  // avgScore/bestScore: filtrar a un bucket (18h preferido, fallback 9h)
  // antes de promediar. Mezclar 9h con 18h contamina el promedio bruto.
  const rondas18Admin = rounds.filter(r => inferHoles(r as { holes_played?: number | null; scores?: number[] | null }) === 18)
  const rondas9Admin = rounds.filter(r => inferHoles(r as { holes_played?: number | null; scores?: number[] | null }) === 9)
  const bucketAdmin = rondas18Admin.length >= rondas9Admin.length ? rondas18Admin : rondas9Admin
  const avgScoreBucket: 9 | 18 | null = bucketAdmin.length === 0 ? null : (bucketAdmin === rondas18Admin ? 18 : 9)
  const avgScore = bucketAdmin.length > 0 ? Math.round(bucketAdmin.reduce((s, r) => s + r.total_gross, 0) / bucketAdmin.length) : null
  const bestScore = bucketAdmin.length > 0 ? Math.min(...bucketAdmin.map(r => r.total_gross)) : null
  const avgRating = sessions.filter(s => s.rating).length > 0
    ? (sessions.filter(s => s.rating).reduce((s, r) => s + (r.rating || 0), 0) / sessions.filter(s => s.rating).length).toFixed(1)
    : null

  return (
    <div>
      {/* Back link */}
      <Link href="/admin/usuarios" style={{ color: adminColors.gray, fontSize: '13px', textDecoration: 'none', marginBottom: '16px', display: 'inline-block' }}>
        ← Volver a usuarios
      </Link>

      {/* Profile header */}
      <div style={{ ...adminCard, display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: adminColors.goldDim, color: adminColors.gold,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '24px', fontWeight: 700, flexShrink: 0,
        }}>
          {(profile.name || '?')[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ ...adminFonts.sectionTitle, fontSize: '22px', margin: 0 }}>{profile.name || '—'}</h1>
          <p style={{ ...adminFonts.mono, margin: '4px 0 0' }}>{profile.email}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <span style={{ background: adminColors.goldDim, color: adminColors.gold, padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, border: '1px solid rgba(196,153,42,0.3)' }}>
              {profile.role || 'player'}
            </span>
            {profile.nivel && (
              <span style={{ background: adminColors.blueDim, color: adminColors.blue, padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, border: '1px solid rgba(59,130,246,0.3)' }}>
                {NIVEL_LABELS[profile.nivel] || `Lv${profile.nivel}`}
              </span>
            )}
            <span style={{ ...adminFonts.mono, fontSize: '11px' }}>
              Registro: {new Date(profile.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Handicap', value: profile.indice != null ? profile.indice.toFixed(1) : '—' },
          { label: 'Indice G+', value: profile.indice_golfers != null ? profile.indice_golfers.toFixed(1) : '—' },
          { label: 'CPI', value: profile.cpi_score != null ? profile.cpi_score.toFixed(1) : '—' },
          { label: 'Rondas', value: totalRondas },
          { label: 'Torneos', value: tournaments.length },
          { label: 'Sesiones IA', value: sessions.length },
          { label: avgScoreBucket ? `Promedio (${avgScoreBucket}h)` : 'Promedio', value: avgScore ?? '—' },
          { label: avgScoreBucket ? `Mejor (${avgScoreBucket}h)` : 'Mejor', value: bestScore ?? '—' },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...adminCard, padding: '14px', textAlign: 'center' }}>
            <div style={{ ...adminFonts.kpiSmall, fontSize: '1.1rem' }}>{kpi.value}</div>
            <div style={{ ...adminFonts.label, marginTop: '2px', fontSize: '10px' }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Patterns */}
      {patterns.length > 0 && (
        <div style={{ ...adminCard, marginBottom: '20px' }}>
          <h2 style={{ ...adminFonts.sectionTitle, fontSize: '16px', margin: '0 0 12px' }}>Patrones detectados</h2>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {patterns.map(p => (
              <div key={p.pattern_type} style={{
                background: p.status === 'active' ? adminColors.yellowDim : adminColors.greenDim,
                border: `1px solid ${p.status === 'active' ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
                borderRadius: '8px', padding: '8px 12px',
              }}>
                <div style={{ ...adminFonts.body, fontSize: '13px', fontWeight: 500, color: p.status === 'active' ? adminColors.yellow : adminColors.green }}>
                  {PATTERN_LABELS[p.pattern_type] || p.pattern_type}
                </div>
                <div style={{ ...adminFonts.mono, fontSize: '10px', marginTop: '2px' }}>
                  {(p.confidence * 100).toFixed(0)}% confianza · {p.data_points} datos · {p.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two columns: Rounds + Tournaments */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '20px' }}>

        {/* Historical Rounds */}
        <div style={{ ...adminCard, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${adminColors.border}` }}>
            <h2 style={{ ...adminFonts.sectionTitle, fontSize: '16px', margin: 0 }}>Historial de rondas ({rounds.length})</h2>
          </div>
          {rounds.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: adminColors.grayDim }}>Sin rondas registradas</div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${adminColors.border}` }}>
                    <th style={{ ...adminFonts.label, padding: '8px 16px', textAlign: 'left' }}>Fecha</th>
                    <th style={{ ...adminFonts.label, padding: '8px 16px', textAlign: 'left' }}>Cancha</th>
                    <th style={{ ...adminFonts.label, padding: '8px 16px', textAlign: 'center' }}>Gross</th>
                    <th style={{ ...adminFonts.label, padding: '8px 16px', textAlign: 'center' }}>Dif.</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${adminColors.border}` }}>
                      <td style={{ padding: '10px 16px', ...adminFonts.mono, fontSize: '12px' }}>
                        {new Date(r.played_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                      </td>
                      <td style={{ padding: '10px 16px', ...adminFonts.body, fontSize: '13px' }}>
                        {r.course_name || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', ...adminFonts.body, fontWeight: 600, color: adminColors.gold }}>
                        {r.total_gross}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', ...adminFonts.mono }}>
                        {r.diferencial != null ? r.diferencial.toFixed(1) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Tournaments */}
        <div style={{ ...adminCard, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${adminColors.border}` }}>
            <h2 style={{ ...adminFonts.sectionTitle, fontSize: '16px', margin: 0 }}>Torneos ({tournaments.length})</h2>
          </div>
          {tournaments.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: adminColors.grayDim }}>Sin torneos jugados</div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {tournaments.map(t => {
                const round = t.rounds?.[0]
                return (
                  <div key={t.id} style={{ padding: '12px 20px', borderBottom: `1px solid ${adminColors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ ...adminFonts.body, fontWeight: 500 }}>{t.tournaments?.name || '—'}</div>
                      <div style={{ ...adminFonts.mono, fontSize: '11px' }}>
                        {t.tournaments?.date_start ? new Date(t.tournaments.date_start).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {round ? (
                        <span style={{ ...adminFonts.body, color: adminColors.gold, fontWeight: 600 }}>{round.total_gross}</span>
                      ) : (
                        <span style={{ color: adminColors.grayDim }}>—</span>
                      )}
                      <div style={{
                        fontSize: '10px', fontWeight: 600, marginTop: '2px',
                        color: t.status === 'approved' ? adminColors.green : adminColors.gray,
                      }}>
                        {t.status}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Two columns: tAIger Sessions + Rondas Libres */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>

        {/* tAIger Sessions */}
        <div style={{ ...adminCard, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${adminColors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ ...adminFonts.sectionTitle, fontSize: '16px', margin: 0 }}>Sesiones tAIger ({sessions.length})</h2>
            {avgRating && <span style={{ ...adminFonts.mono, fontSize: '12px' }}>Rating prom: {avgRating}/5</span>}
          </div>
          {sessions.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: adminColors.grayDim }}>Sin sesiones de coaching</div>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {sessions.map(s => (
                <div key={s.id} style={{ padding: '10px 20px', borderBottom: `1px solid ${adminColors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{
                      background: adminColors.goldDim, color: adminColors.gold,
                      padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                    }}>
                      {s.session_type}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {s.rating && <span style={{ ...adminFonts.body, color: adminColors.yellow }}>{'★'.repeat(s.rating)}</span>}
                    <span style={{ ...adminFonts.mono, fontSize: '11px' }}>
                      {new Date(s.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rondas Libres */}
        <div style={{ ...adminCard, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${adminColors.border}` }}>
            <h2 style={{ ...adminFonts.sectionTitle, fontSize: '16px', margin: 0 }}>Rondas libres ({rondas.length})</h2>
          </div>
          {rondas.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: adminColors.grayDim }}>Sin rondas libres</div>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {rondas.map(r => {
                const scoreValues = Object.values(r.scores || {}).filter(v => typeof v === 'number')
                const total = scoreValues.reduce((s, v) => s + v, 0)
                return (
                  <div key={r.id} style={{ padding: '10px 20px', borderBottom: `1px solid ${adminColors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ ...adminFonts.body, fontSize: '13px' }}>{r.rondas_libres?.course_name || '—'}</div>
                      <div style={{ ...adminFonts.mono, fontSize: '11px' }}>
                        {r.rondas_libres?.fecha ? new Date(r.rondas_libres.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ ...adminFonts.body, color: adminColors.gold, fontWeight: 600 }}>
                        {total > 0 ? total : '—'}
                      </span>
                      <div style={{ ...adminFonts.mono, fontSize: '10px' }}>{scoreValues.length} hoyos</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
