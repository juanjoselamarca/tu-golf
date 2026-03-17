import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'
import TournamentCardMenu from '@/components/TournamentCardMenu'

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
const btnPrimary:     React.CSSProperties = { background: '#c4992a', color: '#070d18', fontWeight: 700, padding: '8px 16px', borderRadius: '8px', fontSize: '13px', textDecoration: 'none', border: 'none' }
const btnSecondary:   React.CSSProperties = { background: 'transparent', border: '1px solid rgba(196,153,42,0.4)', color: '#c4992a', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', textDecoration: 'none' }

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
  ] = await Promise.all([
    supabase.from('tournaments').select('id, name, slug, status, date_start, courses(nombre)').eq('organizer_id', user.id).order('created_at', { ascending: false }),
    supabase.from('players').select('tournaments(id, name, slug, status, date_start, courses(nombre))').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('tournaments').select('*', { count: 'exact', head: true }).eq('organizer_id', user.id),
    supabase.from('players').select('id, tournaments!inner(organizer_id)', { count: 'exact', head: true }).eq('tournaments.organizer_id', user.id),
    supabase.from('rondas_libres').select('id, codigo, course_name, fecha, estado').eq('creador_id', user.id).order('created_at', { ascending: false }).limit(5),
  ])

  const tournaments       = (myTournaments as unknown as Tournament[]) || []
  const playedTournaments = ((playedRaw || []).map((p: unknown) => (p as { tournaments: Tournament | null }).tournaments).filter(Boolean)) as Tournament[]
  const rondasLibres      = (rondasRaw as RondaLibre[]) || []
  const latestTournament  = tournaments[0] || null

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Navbar */}
      <nav style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', padding: '0 32px', height: '64px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50 }}>
        <Link href="/" style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: '#c4992a', fontWeight: 700, textDecoration: 'none' }}>
          ⛳ Tu Golf
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/perfil" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {userInitials}
            </div>
            <span style={{ color: 'var(--text)', fontSize: '14px' }}>{userName}</span>
          </Link>
          <LogoutButton />
        </div>
      </nav>

      <main style={{ padding: 'clamp(24px, 4vw, 48px) clamp(16px, 4vw, 32px)', maxWidth: '1100px', margin: '0 auto' }}>

        {/* 1 — Saludo */}
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '38px', color: 'var(--text)', marginBottom: '8px', lineHeight: 1.2 }}>
          Hola, {userName} 👋
        </h1>
        <p style={{ fontSize: '16px', color: 'var(--text-2)', marginBottom: '32px' }}>
          ¿Listo para tu próximo torneo?
        </p>

        <div style={{ height: '1px', background: 'linear-gradient(90deg, #c4992a, transparent)', marginBottom: '40px' }} />

        {/* 2 — Action cards */}
        <div className="dashboard-actions" style={{ gap: '20px', marginBottom: '56px' }}>
          {/* Ronda Libre — gold, prominent */}
          <div style={{ background: 'rgba(196,153,42,0.07)', border: '1px solid rgba(196,153,42,0.35)', borderRadius: '14px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '44px', marginBottom: '16px' }}>⛳</div>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#c4992a', marginBottom: '8px' }}>Ronda Libre</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '24px' }}>Juega con amigos, score en vivo, sin torneo formal</p>
            <Link href="/ronda-libre/nueva" style={{ ...btnPrimary, display: 'inline-block' }}>
              Nueva ronda →
            </Link>
          </div>

          {/* Organizar torneo */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '44px', marginBottom: '16px' }}>🏆</div>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: 'var(--text)', marginBottom: '8px' }}>Organizar un torneo</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '24px' }}>Crea y gestiona tu propio torneo en minutos.</p>
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
            GWI, scoring trend, evolución del índice
          </p>
          <span style={{ color: '#c4992a', fontSize: '13px', fontWeight: 600 }}>
            Ver estadísticas →
          </span>
        </Link>

        {/* 3 — Mis torneos como organizador */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, rgba(196,153,42,0.4), transparent)', marginBottom: '40px' }} />
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', marginBottom: '24px' }}>
          Mis torneos como organizador
        </h2>

        {tournaments.length === 0 ? (
          <div style={{ background: 'var(--bg-surface)', border: '1px dashed rgba(196,153,42,0.3)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
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
        <div style={{ height: '1px', background: 'linear-gradient(90deg, rgba(196,153,42,0.4), transparent)', margin: '56px 0 40px' }} />
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', marginBottom: '24px' }}>
          Torneos en que he jugado
        </h2>
        {playedTournaments.length === 0 ? (
          <div style={{ background: 'var(--bg-surface)', border: '1px dashed rgba(122,143,168,0.2)', borderRadius: '14px', padding: '32px', textAlign: 'center' }}>
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

        {/* 5 — Mis rondas libres */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, rgba(196,153,42,0.4), transparent)', margin: '56px 0 40px' }} />
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', marginBottom: '24px' }}>
          Mis rondas libres recientes
        </h2>
        {rondasLibres.length === 0 ? (
          <div style={{ background: 'var(--bg-surface)', border: '1px dashed rgba(122,143,168,0.2)', borderRadius: '14px', padding: '32px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-2)', fontSize: '15px', margin: 0 }}>
              Aún no has creado ninguna ronda libre.{' '}
              <Link href="/ronda-libre/nueva" style={{ color: '#c4992a', textDecoration: 'none' }}>Nueva ronda →</Link>
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {rondasLibres.map((r) => {
              const isEnCurso   = r.estado === 'en_curso'
              const fechaDisplay = r.fecha
                ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
                : ''
              return (
                <div key={r.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', color: 'var(--text)', fontWeight: 600 }}>{r.course_name}</span>
                      <span style={{ background: isEnCurso ? 'rgba(34,197,94,0.12)' : 'rgba(122,143,168,0.12)', color: isEnCurso ? '#22c55e' : '#7a8fa8', border: `1px solid ${isEnCurso ? 'rgba(34,197,94,0.3)' : 'rgba(122,143,168,0.3)'}`, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>
                        {isEnCurso ? 'En curso' : 'Finalizada'}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                      {fechaDisplay} &nbsp;·&nbsp;
                      <span style={{ fontFamily: 'monospace', color: '#c4992a', fontSize: '12px' }}>{r.codigo}</span>
                    </div>
                  </div>
                  <Link href={`/ronda-libre/${r.codigo}`} style={{ ...btnSecondary }}>Ver →</Link>
                </div>
              )
            })}
          </div>
        )}

        {/* 6 — Métricas (solo si hay torneos organizados) */}
        {(totalTournaments ?? 0) > 0 && (
          <>
            <div style={{ height: '1px', background: 'linear-gradient(90deg, rgba(196,153,42,0.4), transparent)', margin: '56px 0 40px' }} />
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
