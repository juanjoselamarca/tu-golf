import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'
import TournamentCardMenu from '@/components/TournamentCardMenu'
import { ExperiencePopupWrapper } from '@/components/ExperiencePopupWrapper'
import { HoleColorBar } from '@/components/HoleColorBar'
import { PostLoginRedirect } from '@/components/PostLoginRedirect'
import EnVivoWidget from '@/components/EnVivoWidget'

interface Tournament {
  id: string
  name: string
  slug: string
  status: string
  date_start: string | null
  courses: { nombre: string } | null
}

interface RondaLibre {
  id: string
  codigo: string
  course_name: string
  fecha: string
  estado: string
}

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  draft:       { label: 'Borrador',      bg: 'rgba(122,143,168,0.15)', color: 'var(--text-2)' },
  active:      { label: 'Activo',        bg: 'rgba(22,163,74,0.15)',   color: '#4ade80' },
  in_progress: { label: 'En curso',      bg: 'rgba(22,163,74,0.15)',   color: '#4ade80' },
  finished:    { label: 'Finalizado',    bg: 'rgba(196,153,42,0.15)', color: '#c4992a' },
  closed:      { label: 'Cerrado',       bg: 'rgba(196,153,42,0.15)', color: '#c4992a' },
  published:   { label: 'Publicado',     bg: 'rgba(196,153,42,0.15)', color: '#c4992a' },
  open:        { label: 'Inscripciones', bg: 'rgba(26,79,214,0.15)',  color: '#7a9ef5' },
}

// Button style helpers
const btnPrimary:     React.CSSProperties = { background: '#c4992a', color: '#070d18', fontWeight: 700, padding: '12px 20px', borderRadius: '10px', fontSize: '13px', textDecoration: 'none', border: 'none' }
const btnSecondary:   React.CSSProperties = { background: 'transparent', border: '1px solid rgba(196,153,42,0.4)', color: '#c4992a', padding: '12px 20px', borderRadius: '10px', fontSize: '13px', textDecoration: 'none' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const userName     = user.user_metadata?.name || user.email?.split('@')[0] || 'Golfista'
  const userInitials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)

  const [
    { data: myTournaments },
    { data: playedRaw },
    { count: totalTournaments },
    { count: totalPlayers },
    { data: rondasRaw },
    { count: initialRounds },
  ] = await Promise.all([
    supabase.from('tournaments').select('id, name, slug, status, date_start, courses(nombre)').eq('organizer_id', user.id).order('created_at', { ascending: false }),
    supabase.from('players').select('tournaments(id, name, slug, status, date_start, courses(nombre))').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('tournaments').select('*', { count: 'exact', head: true }).eq('organizer_id', user.id),
    supabase.from('players').select('id, tournaments!inner(organizer_id)', { count: 'exact', head: true }).eq('tournaments.organizer_id', user.id),
    supabase.from('rondas_libres').select('id, codigo, course_name, fecha, estado').eq('creador_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('historical_rounds').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const today = new Date().toISOString().split('T')[0]
  const { data: todayRound } = await supabase
    .from('historical_rounds')
    .select('total_gross, course_name')
    .eq('user_id', user.id)
    .gte('played_at', today)
    .limit(1)
    .single()

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('indice')
    .eq('id', user.id)
    .single()

  const tournaments       = (myTournaments as unknown as Tournament[]) || []
  const playedTournaments = ((playedRaw || []).map((p: unknown) => (p as { tournaments: Tournament | null }).tournaments).filter(Boolean)) as Tournament[]
  const rondasLibres      = (rondasRaw as RondaLibre[]) || []
  const latestTournament  = tournaments[0] || null

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <PostLoginRedirect />
      <ExperiencePopupWrapper />

      <main style={{ padding: 'clamp(24px, 4vw, 48px) clamp(16px, 4vw, 32px)', paddingBottom: '80px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* 1 — Saludo */}
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(26px, 6vw, 38px)', color: 'var(--text)', marginBottom: '8px', lineHeight: 1.2 }}>
          Hola, {userName}
        </h1>
        <p style={{ fontSize: '16px', color: 'var(--text-2)', marginBottom: '32px' }}>
          {todayRound
            ? `Jugaste ${todayRound.total_gross ?? '—'} golpes en ${todayRound.course_name ?? 'Cancha'}`
            : '¿Listo para mejorar tu juego hoy?'}
        </p>

        {/* Active ronda — FIRST, most prominent */}
        {(() => {
          const activa = rondasLibres.find(r => r.estado === 'en_curso')
          if (!activa) return null
          const fechaA = activa.fecha ? new Date(activa.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
          return (
            <div style={{
              background: 'rgba(196,153,42,0.05)', border: '1px solid rgba(196,153,42,0.2)',
              borderLeft: '3px solid #C4992A', borderRadius: '14px', padding: '16px', marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', animation: 'livePulse 2s ease-in-out infinite' }} />
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#22c55e', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ronda en curso</span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', fontFamily: '"Playfair Display", serif' }}>{activa.course_name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>{fechaA}</div>
              <HoleColorBar scores={[]} totalHoles={18} />
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <Link href={`/ronda-libre/${activa.codigo}/score`} style={{ flex: 1, padding: '14px', background: '#C4992A', color: '#070D18', borderRadius: '10px', fontSize: '15px', fontWeight: 700, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                  Continuar →
                </Link>
                <Link href={`/ronda-libre/${activa.codigo}`} style={{ padding: '12px 16px', background: 'transparent', border: '1px solid var(--border-md)', color: 'var(--text-3)', borderRadius: '10px', fontSize: '14px', textDecoration: 'none', display: 'block' }}>
                  Ver
                </Link>
              </div>
            </div>
          )
        })()}

        <div style={{ height: '1px', background: 'linear-gradient(90deg, #c4992a, transparent)', marginBottom: '24px' }} />

        {/* Onboarding card */}
        {!userProfile?.indice && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.2)',
            borderRadius: '14px', padding: '20px', marginBottom: '20px',
          }}>
            <div style={{ fontSize: '11px', color: '#c4992a', fontFamily: 'var(--font-dm-mono), monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Paso 1 de 2
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
              Agrega tu índice de golf
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '14px' }}>
              Lo necesito para calcular tu GWI™ y darte análisis precisos
            </div>
            <Link href="/perfil" style={{
              display: 'inline-block', background: '#c4992a', color: '#070d18',
              fontWeight: 700, fontSize: '13px', padding: '10px 20px', borderRadius: '10px',
              textDecoration: 'none',
            }}>
              Agregar mi índice →
            </Link>
          </div>
        )}

        {/* Import CTA — show when user has few rounds */}
        {(initialRounds ?? 0) < 5 && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.15)',
            borderRadius: '14px', padding: '20px', marginBottom: '20px',
          }}>
            <div style={{ fontSize: '11px', color: '#c4992a', fontFamily: 'var(--font-dm-mono), monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Activá tu CPI™ y tAIger+
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
              Importá tu historial de rondas
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '14px' }}>
              tAIger+ necesita conocer tu juego para darte análisis precisos
            </div>
            <Link href="/importar" style={{
              display: 'inline-block', background: '#c4992a', color: '#070d18',
              fontWeight: 700, fontSize: '13px', padding: '10px 20px', borderRadius: '10px',
              textDecoration: 'none',
            }}>
              Importar historial →
            </Link>
          </div>
        )}

        {/* 2 — Action cards */}
        <div className="dashboard-actions" style={{ gap: '20px', marginBottom: '32px' }}>
          {/* Ronda Libre — gold, prominent */}
          <div style={{ background: 'rgba(196,153,42,0.07)', border: '1px solid rgba(196,153,42,0.35)', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>⛳</div>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#c4992a', marginBottom: '8px' }}>Ronda Libre</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '16px' }}>Juega con amigos, score en vivo, sin torneo formal</p>
            <Link href="/ronda-libre/nueva" style={{ ...btnPrimary, display: 'inline-block' }}>
              Nueva ronda →
            </Link>
          </div>

          {/* Organizar torneo */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>🏆</div>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: 'var(--text)', marginBottom: '8px' }}>Organizar un torneo</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '16px' }}>Crea y gestiona tu propio torneo en minutos.</p>
            <Link href="/organizador/nuevo" style={{ display: 'inline-block', background: '#c4992a', color: '#070d18', fontWeight: 600, borderRadius: '8px', padding: '10px 20px', fontSize: '14px', textDecoration: 'none' }}>
              Crear torneo →
            </Link>
          </div>
        </div>

        {/* Stats card */}
        <Link href="/perfil/stats" style={{
          display: 'block', textDecoration: 'none',
          background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.2)',
          borderRadius: '14px', padding: '20px', marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <span style={{ fontSize: '24px' }}>📊</span>
            <span style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 600 }}>Mis estadísticas</span>
          </div>
          <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: '0 0 12px' }}>
            GWI, tendencia de scoring, evolución del índice
          </p>
          <span style={{ color: '#c4992a', fontSize: '13px', fontWeight: 600 }}>
            Ver estadísticas →
          </span>
        </Link>

        {/* 3 — Mis torneos como organizador */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, rgba(196,153,42,0.4), transparent)', marginBottom: '24px' }} />
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', marginBottom: '24px' }}>
          Mis torneos como organizador
        </h2>

        {tournaments.length === 0 ? (
          <div style={{ background: 'rgba(196,153,42,0.03)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
            <p style={{ color: 'var(--text-2)', marginBottom: '20px', fontSize: '15px' }}>Aún no has creado ningún torneo.</p>
            <Link href="/organizador/nuevo" style={{ ...btnPrimary, display: 'inline-block', padding: '12px 28px', fontSize: '15px' }}>
              Crear mi primer torneo →
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {tournaments.map((t) => {
              const st       = STATUS_LABEL[t.status] ?? STATUS_LABEL.draft
              const isActive = t.status === 'active' || t.status === 'in_progress'
              return (
                <div key={t.id} style={{ background: 'var(--bg-card-light)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', boxShadow: 'var(--shadow-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: 'var(--text)', fontWeight: 600 }}>{t.name}</span>
                      <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}40`, padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                      {t.courses?.nombre && <span>⛳ {t.courses.nombre}</span>}
                      {t.date_start && <span style={{ marginLeft: '12px' }}>📅 {new Date(t.date_start).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                    </div>
                  </div>
                  <TournamentCardMenu slug={t.slug} isActive={isActive} />
                </div>
              )
            })}
          </div>
        )}

        {/* 4 — Torneos en que he jugado */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, rgba(196,153,42,0.4), transparent)', margin: '32px 0 24px' }} />
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', marginBottom: '24px' }}>
          Torneos en que he jugado
        </h2>
        {playedTournaments.length === 0 ? (
          <div style={{ background: 'rgba(196,153,42,0.03)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '14px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏌️</div>
            <p style={{ color: 'var(--text-2)', fontSize: '15px', margin: 0 }}>Aún no has jugado en ningún torneo.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {playedTournaments.map((t) => {
              const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.draft
              return (
                <div key={t.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: 'var(--text)', fontWeight: 600 }}>{t.name}</span>
                      <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}40`, padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                      {t.courses?.nombre && <span>⛳ {t.courses.nombre}</span>}
                      {t.date_start && <span style={{ marginLeft: '12px' }}>📅 {new Date(t.date_start).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                    </div>
                  </div>
                  <Link href={`/torneo/${t.slug}`} style={{ ...btnSecondary }}>Ver leaderboard →</Link>
                </div>
              )
            })}
          </div>
        )}

        {/* En Vivo widget — invisible si no hay rondas activas */}
        <EnVivoWidget />

        {/* 5 — Mis rondas libres */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, rgba(196,153,42,0.4), transparent)', margin: '32px 0 24px' }} />
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', marginBottom: '24px' }}>
          Mis rondas libres recientes
        </h2>
        {rondasLibres.length === 0 ? (
          <div style={{ background: 'rgba(196,153,42,0.03)', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '14px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>⛳</div>
            <p style={{ color: 'var(--text-2)', fontSize: '15px', margin: 0 }}>
              Aún no has creado ninguna ronda libre.{' '}
              <Link href="/ronda-libre/nueva" style={{ color: '#c4992a', textDecoration: 'none' }}>Nueva ronda →</Link>
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {rondasLibres.map((r) => {
              const isEnCurso = r.estado === 'en_curso'
              if (isEnCurso) return null
              const fechaDisplay = r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
              return (
                <div key={r.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 600 }}>{r.course_name}</span>
                        <span style={{ background: isEnCurso ? 'rgba(34,197,94,0.12)' : 'rgba(122,143,168,0.12)', color: isEnCurso ? '#22c55e' : 'var(--text-3)', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>
                          {isEnCurso ? 'En curso' : 'Finalizada'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                        {fechaDisplay} · <span style={{ fontFamily: 'monospace', color: '#c4992a', fontSize: '11px' }}>{r.codigo}</span>
                      </div>
                    </div>
                    <Link href={`/ronda-libre/${r.codigo}`} style={{ ...btnSecondary, flexShrink: 0 }}>Ver →</Link>
                  </div>
                  <HoleColorBar scores={[]} totalHoles={18} />
                </div>
              )
            })}
          </div>
        )}

        {/* 6 — Métricas (solo si hay torneos organizados) */}
        {(totalTournaments ?? 0) > 0 && (
          <>
            <div style={{ height: '1px', background: 'linear-gradient(90deg, rgba(196,153,42,0.4), transparent)', margin: '32px 0 24px' }} />
            <div className="dashboard-metrics-grid">
              {[
                { label: 'Torneos organizados', value: totalTournaments ?? 0, icon: '🏆' },
                { label: 'Jugadores inscritos',  value: totalPlayers ?? 0,    icon: '👥' },
                { label: 'Último torneo',        value: latestTournament?.name || '—', icon: '📅', small: true },
              ].map((m) => (
                <div key={m.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>{m.icon}</div>
                  <div style={{ fontFamily: '"Playfair Display", serif', fontSize: m.small ? '14px' : '28px', color: '#c4992a', fontWeight: 700, marginBottom: '4px', lineHeight: 1.2 }}>{m.value}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>{m.label}</div>
                </div>
              ))}
            </div>
          </>
        )}

      </main>
    </div>
  )
}
