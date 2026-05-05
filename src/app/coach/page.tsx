'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Calendar } from '@/components/icons'
import { TaigerIcon } from '@/components/icons/TaigerIcon'
import { TaigerHero } from '@/components/coach/TaigerHero'

interface Session {
  id: string
  session_type: string
  created_at: string
  next_focus: string | null
}

const SESSION_LABELS: Record<string, string> = {
  post_round: 'Análisis post-ronda',
  weekly_plan: 'Plan semanal',
  pre_tournament: 'Pre-torneo',
  free: 'Consulta libre',
  onboarding: 'Onboarding',
}

export default function CoachDashboard() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [stats, setStats] = useState<{ rounds: number; patterns: number; cpi: number | null }>({ rounds: 0, patterns: 0, cpi: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?next=/coach'); return }

      const [sessionsRes, roundsRes, patternsRes, profileRes] = await Promise.all([
        supabase.from('taiger_sessions').select('id, session_type, created_at, next_focus').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('historical_rounds').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('player_patterns').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active'),
        supabase.from('profiles').select('cpi_score').eq('id', user.id).single(),
      ])

      setSessions((sessionsRes.data as Session[]) || [])
      setStats({
        rounds: roundsRes.count ?? 0,
        patterns: patternsRes.count ?? 0,
        cpi: profileRes.data?.cpi_score ?? null,
      })
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '12px', animation: 'tpulse 1.5s ease infinite', color: '#c4992a' }}><TaigerIcon size={48} /></div>
          <div style={{ color: '#c4992a', fontSize: '14px' }}>Cargando tAIger+...</div>
          <style>{`@keyframes tpulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`}</style>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 100px' }}>

      {/* Hero */}
      <TaigerHero subtitle="Tu coach de rendimiento con inteligencia artificial" />

      {/* Data summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
        {[
          { label: 'RONDAS', value: String(stats.rounds), color: stats.rounds >= 3 ? '#16a34a' : 'var(--text-2)' },
          { label: 'PATRONES', value: String(stats.patterns), color: stats.patterns > 0 ? '#c4992a' : 'var(--text-2)' },
          { label: 'CPI', value: stats.cpi != null ? stats.cpi.toFixed(0) : '—', color: stats.cpi != null ? '#c4992a' : 'var(--text-2)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.12)', borderRadius: '12px', padding: '14px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: '"Cormorant Garamond", serif' }}>{s.value}</div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', fontFamily: '"DM Mono", monospace', letterSpacing: '0.1em', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Data requirement notice */}
      {stats.rounds < 3 && (
        <div style={{
          background: 'rgba(196,153,42,0.06)', border: '1px solid rgba(196,153,42,0.2)',
          borderRadius: '14px', padding: '20px', marginBottom: '16px', textAlign: 'center',
        }}>
          <div style={{ marginBottom: '8px' }}></div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
            {`${stats.rounds} de 3 rondas para desbloquear tAIger+`}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '14px', maxWidth: '340px', marginLeft: 'auto', marginRight: 'auto' }}>
            tAIger+ es tu coach. Para darte consejo real necesita conocer tu juego. Registra {3 - stats.rounds === 1 ? '1 ronda más' : `${3 - stats.rounds} rondas más`} y desbloqueás análisis de patrones, plan semanal y consulta libre.
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/ronda-libre/nueva" style={{
              display: 'inline-block', background: '#c4992a', color: 'var(--brand-dark)',
              fontWeight: 700, fontSize: '13px', padding: '10px 20px', borderRadius: '10px',
              textDecoration: 'none',
            }}>
              Nueva ronda
            </Link>
            <Link href="/perfil/historial" style={{
              display: 'inline-block', background: 'transparent', color: '#c4992a',
              fontWeight: 600, fontSize: '13px', padding: '10px 20px', borderRadius: '10px',
              textDecoration: 'none', border: '1px solid rgba(196,153,42,0.4)',
            }}>
              Importar historial
            </Link>
          </div>
        </div>
      )}

      {/* TODO commit 2: CTA único de sesión continua */}

      {/* Session history */}
      {sessions.length > 0 ? (
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', fontFamily: '"DM Mono", monospace', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '12px' }}>
            Sesiones anteriores
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sessions.map(s => (
              <Link key={s.id} href={`/coach/sesion/${s.id}`} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.08)', borderRadius: '12px',
                padding: '14px 16px', textDecoration: 'none',
              }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                    {SESSION_LABELS[s.session_type] ?? s.session_type}
                  </div>
                  {s.next_focus && (
                    <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>
                      Foco: {s.next_focus}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>
                  {new Date(s.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.12)', borderRadius: '14px', padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6 }}>
            Aún no tienes sesiones. Inicia tu primera conversación con tAIger+ y descubre lo que la inteligencia artificial ve en tu juego.
          </div>
        </div>
      )}

    </div>
  )
}
