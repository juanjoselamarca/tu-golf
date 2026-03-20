'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

interface Pattern {
  pattern_name: string
  confidence: number
  status: string
}

interface Session {
  id: string
  session_type: string
  created_at: string
  next_focus: string | null
}

interface ContextData {
  patterns: Pattern[]
  stats: Record<string, unknown>
  player: { name: string; handicap: number | null; total_rounds: number }
  player_name?: string
  rounds_count?: number
}

export default function CoachDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [context, setContext] = useState<ContextData | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [monthCount, setMonthCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check onboarding
      const { data: psych } = await supabase
        .from('player_psych_profile')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!psych?.onboarding_completed) { router.replace('/coach/onboarding'); return }

      // Sessions this month
      const startOfMonth = new Date()
      startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
      const { count } = await supabase
        .from('taiger_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .neq('session_type', 'onboarding')
        .gte('created_at', startOfMonth.toISOString())
      setMonthCount(count ?? 0)

      // Recent sessions
      const { data: recentSessions } = await supabase
        .from('taiger_sessions')
        .select('id, session_type, created_at, next_focus')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)
      setSessions(recentSessions ?? [])

      // Fetch context from API
      try {
        const res = await fetch('/api/taiger/context')
        if (res.ok) {
          const data = await res.json()
          setContext(data)
        }
      } catch {
        // Context API not available yet
      }

      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return (
    <div style={{ padding: '40px 20px', color: '#94a8c0', textAlign: 'center' }}>
      Cargando tu perfil...
    </div>
  )

  const sessionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      round_analysis: 'Análisis de ronda',
      weekly_plan: 'Plan semanal',
      free: 'Consulta libre',
      onboarding: 'Onboarding',
    }
    return labels[type] || type
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 80px' }}>

      {/* BACK */}
      <Link href="/" style={{
        color: 'var(--text-2, #94a8c0)', fontSize: '13px', textDecoration: 'none',
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        marginBottom: '16px', minHeight: '44px',
      }}>
        ← Inicio
      </Link>

      {/* HEADER */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ color: '#c4992a', fontSize: '24px', fontFamily: '"Playfair Display", serif', fontWeight: 700, margin: '0 0 4px' }}>
          🐯 tAIger+
        </h1>
        <p style={{ color: '#94a8c0', fontSize: '14px', margin: 0 }}>
          Tu coach de rendimiento · Golfers+{context?.player?.name ? ` · ${context.player.name}` : ''}
        </p>
      </div>

      {/* NIVEL DE ANÁLISIS */}
      {context && (() => {
        const totalRounds = context.player?.total_rounds ?? context.rounds_count ?? 0
        const level = totalRounds === 0 ? 0 : totalRounds < 5 ? 1 : totalRounds < 10 ? 2 : totalRounds < 20 ? 3 : totalRounds < 40 ? 4 : 5
        const configs = [
          { border: 'rgba(196,153,42,0.3)', text: 'tAIger+ aprende tu juego con cada ronda que registres.', label: 'Orientativo', link: true },
          { border: 'rgba(196,153,42,0.4)', text: `Con ${totalRounds} rondas tengo señales tempranas. Registra más rondas para patrones confirmados.`, label: 'Básico', link: true },
          { border: 'rgba(196,153,42,0.5)', text: `Con ${totalRounds} rondas detecto tendencias reales. Con 10 rondas los análisis serán mucho más precisos.`, label: 'Básico' },
          { border: '#c4992a', text: `Con ${totalRounds} rondas los patrones que veo son estadísticamente sólidos.`, label: 'Avanzado' },
          { border: '#c4992a', text: `Con ${totalRounds} rondas tengo un perfil profundo de tu juego.`, label: 'Experto', glow: true },
          { border: '#c4992a', text: `Con ${totalRounds} rondas tengo más datos que la mayoría de coaches tienen de sus atletas.`, label: 'Élite', glow: true },
        ]
        const cfg = configs[level]
        return (
          <div style={{
            background: '#0e1c2f', borderLeft: `3px solid ${cfg.border}`,
            borderRadius: '10px', padding: '14px 16px', marginBottom: '24px',
            boxShadow: cfg.glow ? '0 0 12px rgba(196,153,42,0.15)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '14px' }}>🐯</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(196,153,42,0.15)', color: '#c4992a', fontWeight: 600 }}>
                Nivel {cfg.label}
              </span>
            </div>
            <p style={{ color: '#edeae4', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
              {cfg.text}
            </p>
            {cfg.link && (
              <Link href="/perfil/historial" style={{ color: '#c4992a', fontSize: '12px', marginTop: '8px', display: 'inline-block', textDecoration: 'none' }}>
                Agregar tarjeta histórica →
              </Link>
            )}
          </div>
        )
      })()}

      {/* PATRONES */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#edeae4', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
          Patrones en tu juego
        </h2>
        {context?.patterns && context.patterns.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {context.patterns.map((p, i) => (
              <div key={i} style={{
                background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.2)',
                borderRadius: '10px', padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ color: '#edeae4', fontSize: '14px', fontWeight: 600 }}>{p.pattern_name}</span>
                  <span style={{
                    fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                    background: p.status === 'active' ? 'rgba(196,153,42,0.15)' : 'rgba(122,143,168,0.15)',
                    color: p.status === 'active' ? '#c4992a' : '#94a8c0',
                  }}>
                    {p.status === 'active' ? 'Activo' : 'Resuelto'}
                  </span>
                </div>
                <div style={{ background: 'rgba(122,143,168,0.15)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                  <div style={{
                    background: '#c4992a', height: '100%', borderRadius: '4px',
                    width: `${Math.round(p.confidence * 100)}%`, transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{ color: '#94a8c0', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                  Confianza: {Math.round(p.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.2)',
            borderRadius: '10px', padding: '20px 16px', textAlign: 'center',
          }}>
            <p style={{ color: '#edeae4', fontSize: '14px', margin: '0 0 12px' }}>
              Necesito al menos 5 rondas para detectar patrones. Llevas {context?.player?.total_rounds ?? context?.rounds_count ?? 0}.
            </p>
            <div style={{ background: 'rgba(122,143,168,0.15)', borderRadius: '4px', height: '8px', overflow: 'hidden', maxWidth: '200px', margin: '0 auto' }}>
              <div style={{
                background: '#c4992a', height: '100%', borderRadius: '4px',
                width: `${Math.min(((context?.player?.total_rounds ?? context?.rounds_count ?? 0) / 5) * 100, 100)}%`, transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )}
      </section>

      {/* FOCO DE TRABAJO */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#edeae4', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
          Mi Foco de Trabajo
        </h2>
        {sessions.length > 0 ? (
          <div style={{
            background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.2)',
            borderRadius: '14px', padding: '20px 16px',
          }}>
            <div style={{ fontSize: '11px', color: '#94a8c0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
              Actualizado por tAIger+
            </div>
            {/* Show priorities from last session's next_focus or patterns */}
            {(() => {
              const lastFocus = sessions[0]?.next_focus
              const priorities: string[] = []

              // Priority 1: from last session focus
              if (lastFocus) priorities.push(lastFocus.substring(0, 80))

              // Priority 2: from detected pattern
              const activePattern = (context?.patterns ?? []).find((p: Pattern) => p.status === 'active')
              if (activePattern) {
                const patternLabels: Record<string, string> = {
                  back_nine_collapse: 'Gestión del back 9',
                  post_bogey_spiral: 'Reset mental post-error',
                  first_hole_anxiety: 'Confianza en el hoyo 1',
                  three_putt_frequency: 'Control de distancia en putting',
                }
                priorities.push(patternLabels[activePattern.pattern_name] ?? 'Patrón detectado')
              }

              // Priority 3: default based on rounds
              if (priorities.length < 3) priorities.push('Rutina pre-shot consistente')

              return priorities.slice(0, 3).map((p: string, i: number) => (
                <div key={i} style={{
                  padding: '10px 0',
                  borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}>
                  <div style={{ fontSize: '10px', color: '#c4992a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
                    Prioridad {i + 1}
                  </div>
                  <div style={{ fontSize: '14px', color: '#edeae4' }}>{p}</div>
                </div>
              ))
            })()}
            <Link href="/coach/sesion/nueva" style={{
              display: 'block', textAlign: 'center', marginTop: '16px',
              padding: '12px', background: 'rgba(196,153,42,0.1)',
              border: '1px solid rgba(196,153,42,0.25)', borderRadius: '10px',
              color: '#c4992a', fontSize: '14px', fontWeight: 600, textDecoration: 'none',
            }}>
              Nueva sesión con tAIger+ →
            </Link>
          </div>
        ) : (
          <div style={{
            background: 'linear-gradient(135deg, rgba(14,28,47,0.95) 0%, rgba(23,49,41,0.90) 100%)', border: '1px solid rgba(196,153,42,0.25)',
            borderRadius: '14px', padding: '28px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '14px' }}>🐯</div>
            <h3 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#edeae4', margin: '0 0 8px', fontWeight: 700 }}>
              Tu coach te está esperando
            </h3>
            <p style={{ color: '#94a8c0', fontSize: '14px', margin: '0 0 8px', lineHeight: 1.5 }}>
              tAIger+ analiza tu juego, detecta patrones y te da un plan de mejora personalizado.
            </p>
            <p style={{ color: '#94a8c0', fontSize: '13px', margin: '0 0 20px' }}>
              Solo necesitas contarle sobre tu última ronda.
            </p>
            <Link href="/coach/sesion/nueva" style={{
              display: 'inline-block', padding: '14px 28px',
              background: '#c4992a', color: '#070d18', borderRadius: '10px',
              fontSize: '15px', fontWeight: 700, textDecoration: 'none',
            }}>
              Empezar mi primera sesión →
            </Link>
          </div>
        )}
      </section>

      {/* NUEVA SESIÓN */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#edeae4', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
          ¿En qué trabajamos hoy?
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { label: '🏌️ Analizar mi última ronda', href: '/coach/sesion/nueva' },
            { label: '📅 Armar mi plan de práctica', href: '/coach/sesion/nueva?tipo=weekly_plan' },
            { label: '💬 Preguntarle algo a tAIger+', href: '/coach/sesion/nueva?tipo=free' },
          ].map((btn) => (
            <Link key={btn.href} href={btn.href} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', minHeight: '56px', background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.3)',
              borderRadius: '10px', color: '#edeae4', fontSize: '16px', fontWeight: 500,
              textDecoration: 'none', transition: 'all 0.2s ease',
            }}>
              {btn.label}
            </Link>
          ))}
        </div>
      </section>

      {/* HISTORIAL */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#edeae4', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
          Mis sesiones con tAIger+
        </h2>
        {sessions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sessions.map((s) => (
              <Link key={s.id} href={`/coach/sesion/${s.id}`} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.2)',
                borderRadius: '10px', padding: '12px 16px', textDecoration: 'none',
              }}>
                <div>
                  <span style={{ color: '#edeae4', fontSize: '14px' }}>{formatDate(s.created_at)}</span>
                  <span style={{
                    fontSize: '11px', marginLeft: '8px', padding: '2px 8px', borderRadius: '10px',
                    background: 'rgba(196,153,42,0.12)', color: '#c4992a',
                  }}>
                    {sessionTypeLabel(s.session_type)}
                  </span>
                </div>
                <span style={{ color: '#94a8c0', fontSize: '13px' }}>Ver análisis →</span>
              </Link>
            ))}
          </div>
        ) : (
          <div style={{
            background: '#0e1c2f', border: '1px dashed rgba(196,153,42,0.2)',
            borderRadius: '10px', padding: '24px 16px', textAlign: 'center',
          }}>
            <p style={{ color: '#94a8c0', fontSize: '14px', margin: '0 0 12px' }}>
              Aún no tienes sesiones con tAIger+
            </p>
            <Link href="/coach/sesion/nueva" style={{
              color: '#c4992a', fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}>
              Iniciar primera sesión →
            </Link>
          </div>
        )}
      </section>

      {/* FREEMIUM COUNTER */}
      <section style={{
        background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.2)',
        borderRadius: '10px', padding: '16px', textAlign: 'center',
      }}>
        {monthCount < 3 ? (
          <>
            <p style={{ color: '#edeae4', fontSize: '14px', margin: '0 0 10px' }}>
              {monthCount}/3 sesiones del plan gratuito este mes
            </p>
            <div style={{ background: 'rgba(122,143,168,0.15)', borderRadius: '4px', height: '8px', overflow: 'hidden', maxWidth: '200px', margin: '0 auto' }}>
              <div style={{
                background: '#c4992a', height: '100%', borderRadius: '4px',
                width: `${(monthCount / 3) * 100}%`, transition: 'width 0.5s ease',
              }} />
            </div>
          </>
        ) : (
          <p style={{ color: '#94a8c0', fontSize: '14px', margin: 0 }}>
            Has usado tus 3 análisis gratuitos este mes. Plan Pro próximamente.
          </p>
        )}
      </section>

    </div>
  )
}
