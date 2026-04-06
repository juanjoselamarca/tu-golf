import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TournamentCardMenu from '@/components/TournamentCardMenu'
import { ExperiencePopupWrapper } from '@/components/ExperiencePopupWrapper'
import { HoleColorBar } from '@/components/HoleColorBar'
import { PostLoginRedirect } from '@/components/PostLoginRedirect'
import EnVivoWidget from '@/components/EnVivoWidget'
import ShareRoundButton from '@/components/ShareRoundButton'

interface Tournament {
  id: string
  name: string
  slug: string
  status: string
  date_start: string | null
  total_rounds?: number
  courses: { nombre: string } | null
}

interface RondaLibre {
  id: string
  codigo: string
  course_name: string
  fecha: string
  estado: string
}

interface ActivePlayerTournament {
  tournaments: Tournament | null
  // rounds linked to the player for progress tracking
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const params = await searchParams
  const isWelcome = params.welcome === 'true'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const userName     = user.user_metadata?.name || user.email?.split('@')[0] || 'Golfista'
  const userInitials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  void userInitials // used in avatar if needed

  // Calculate 7 days ago for recent round query
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

  const [
    { data: myTournaments },
    { data: playedRaw },
    { count: totalTournaments },
    { count: totalPlayers },
    { data: rondasRaw },
    { count: initialRounds },
    { data: activeTournamentsRaw },
    { data: recentRoundRaw },
    { count: rondasConDiferencial },
    { data: userProfile },
    { count: taigerSessionCount },
  ] = await Promise.all([
    supabase.from('tournaments').select('id, name, slug, status, date_start, courses(nombre)').eq('organizer_id', user.id).order('created_at', { ascending: false }),
    supabase.from('players').select('tournaments(id, name, slug, status, date_start, courses(nombre))').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('tournaments').select('*', { count: 'exact', head: true }).eq('organizer_id', user.id),
    supabase.from('players').select('id, tournaments!inner(organizer_id)', { count: 'exact', head: true }).eq('tournaments.organizer_id', user.id),
    supabase.from('rondas_libres').select('id, codigo, course_name, fecha, estado').eq('creador_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('historical_rounds').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    // 4.1 — Active tournaments the player is enrolled in
    supabase.from('players').select('tournaments!inner(id, name, slug, status, date_start, total_rounds, courses(nombre))').eq('user_id', user.id).in('tournaments.status', ['open', 'in_progress']),
    // 4.2 — Recent completed round (last 7 days)
    supabase.from('historical_rounds').select('id, total_gross, course_name, played_at, diferencial').eq('user_id', user.id).gte('played_at', sevenDaysAgoStr).order('played_at', { ascending: false }).limit(1),
    // 4.3 — Count rounds with diferencial for index progress
    supabase.from('historical_rounds').select('*', { count: 'exact', head: true }).eq('user_id', user.id).not('diferencial', 'is', null),
    // Profile with indice_golfers
    supabase.from('profiles').select('indice, indice_golfers, cpi_score, cpi_status').eq('id', user.id).single(),
    // tAIger session count
    supabase.from('taiger_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const today = new Date().toISOString().split('T')[0]
  const { data: todayRound } = await supabase
    .from('historical_rounds')
    .select('total_gross, course_name')
    .eq('user_id', user.id)
    .gte('played_at', today)
    .limit(1)
    .single()

  const tournaments       = (myTournaments as unknown as Tournament[]) || []
  const playedTournaments = ((playedRaw || []).map((p: unknown) => (p as { tournaments: Tournament | null }).tournaments).filter(Boolean)) as Tournament[]
  const rondasLibres      = (rondasRaw as RondaLibre[]) || []
  const latestTournament  = tournaments[0] || null

  // 4.1 — Extract active tournaments
  const activeTournaments = ((activeTournamentsRaw || []).map((p: unknown) => (p as ActivePlayerTournament).tournaments).filter(Boolean)) as Tournament[]

  // 4.2 — Recent completed round
  const recentRound = recentRoundRaw?.[0] as { id: string; total_gross: number | null; course_name: string | null; played_at: string | null; diferencial: number | null } | undefined

  // 4.3 — Index progress
  const rondasParaIndice = rondasConDiferencial ?? 0
  const indiceGolfers = userProfile?.indice_golfers as number | null
  const indiceActivo = indiceGolfers != null
  const totalRounds = initialRounds ?? 0
  const taigerUsed = (taigerSessionCount ?? 0) > 0

  // 4.4 — Next step logic (single, prioritized)
  const lastPlayedDaysAgo = recentRound?.played_at
    ? Math.floor((Date.now() - new Date(recentRound.played_at).getTime()) / 86400000)
    : null

  type NextStep = { title: string; description: string; href: string; cta: string } | null
  let nextStep: NextStep = null

  if (totalRounds === 0) {
    nextStep = {
      title: 'Tu primera ronda te espera',
      description: 'Juega con amigos o importa rondas anteriores para comenzar a medir tu juego.',
      href: '/ronda-libre/nueva',
      cta: 'Crear ronda',
    }
  } else if (rondasParaIndice < 3) {
    nextStep = {
      title: `${3 - rondasParaIndice} ronda${3 - rondasParaIndice !== 1 ? 's' : ''} más para tu Indice Golfers+`,
      description: 'Juega en canchas con slope y course rating para que podamos calcular tu indice automaticamente.',
      href: totalRounds < 3 ? '/importar' : '/ronda-libre/nueva',
      cta: totalRounds < 3 ? 'Importar historial' : 'Jugar ronda',
    }
  } else if (totalRounds < 5) {
    nextStep = {
      title: `${5 - totalRounds} ronda${5 - totalRounds !== 1 ? 's' : ''} más para activar tAIger+`,
      description: 'Con 5 rondas, tAIger+ detecta patrones en tu juego y arma un plan para mejorar.',
      href: '/importar',
      cta: 'Importar historial',
    }
  } else if (!taigerUsed) {
    nextStep = {
      title: 'Tienes datos suficientes para tAIger+',
      description: 'Tu coach con IA ya puede analizar tu juego. Pide tu primer analisis.',
      href: '/coach/sesion/nueva',
      cta: 'Hablar con tAIger+',
    }
  } else if (lastPlayedDaysAgo !== null && lastPlayedDaysAgo > 14) {
    nextStep = {
      title: `Hace ${lastPlayedDaysAgo} dias que no juegas`,
      description: 'Registra una ronda para mantener tu CPI activo y que tAIger+ tenga datos frescos.',
      href: '/ronda-libre/nueva',
      cta: 'Crear ronda',
    }
  }

  // Detect truly new user: no tournaments, no rondas, no rounds (or explicit welcome param from registration)
  const isNewUser = isWelcome || (tournaments.length === 0 && rondasLibres.length === 0 && (initialRounds ?? 0) === 0 && playedTournaments.length === 0)

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

        {/* 4.1 — Active tournaments the player is enrolled in */}
        {activeTournaments.length > 0 && (
          <>
            {activeTournaments.map((t) => {
              const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.open
              const fechaT = t.date_start ? new Date(t.date_start).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
              const totalRounds = t.total_rounds ?? 1
              return (
                <div key={t.id} style={{
                  background: 'rgba(196,153,42,0.05)', border: '1px solid rgba(196,153,42,0.2)',
                  borderLeft: '3px solid #c4992a', borderRadius: '14px', padding: '16px', marginBottom: '16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: st.color, background: st.bg, border: `1px solid ${st.color}40`, padding: '2px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Torneo {st.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', fontFamily: '"Playfair Display", serif', marginBottom: '4px' }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '4px' }}>
                    {t.courses?.nombre && <span>⛳ {t.courses.nombre}</span>}
                    {fechaT && <span style={{ marginLeft: '12px' }}>📅 {fechaT}</span>}
                  </div>
                  {totalRounds > 1 && (
                    <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '8px' }}>
                      {totalRounds} rondas en total
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <Link href={`/torneo/${t.slug}`} style={{ flex: 1, padding: '12px', background: '#C4992A', color: '#070D18', borderRadius: '10px', fontSize: '14px', fontWeight: 700, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                      Continuar →
                    </Link>
                    <Link href={`/torneo/${t.slug}`} style={{ padding: '10px 16px', background: 'transparent', border: '1px solid var(--border-md)', color: 'var(--text-3)', borderRadius: '10px', fontSize: '13px', textDecoration: 'none', display: 'block' }}>
                      Leaderboard
                    </Link>
                  </div>
                </div>
              )
            })}
          </>
        )}

        <div style={{ height: '1px', background: 'linear-gradient(90deg, #c4992a, transparent)', marginBottom: '24px' }} />

        {/* 4.3 — Index progress indicator */}
        {indiceActivo ? (
          <div style={{
            background: 'rgba(196,153,42,0.06)', border: '1px solid rgba(196,153,42,0.25)',
            borderRadius: '14px', padding: '20px', marginBottom: '20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '11px', color: '#c4992a', fontFamily: 'var(--font-dm-mono), monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Índice Golfers+ activo
            </div>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '42px', color: '#c4992a', fontWeight: 700, lineHeight: 1.1 }}>
              {indiceGolfers!.toFixed(1)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>
              Basado en {rondasParaIndice} ronda{rondasParaIndice !== 1 ? 's' : ''} registrada{rondasParaIndice !== 1 ? 's' : ''}
            </div>
            <Link href="/perfil/stats" style={{ display: 'inline-block', marginTop: '12px', color: '#c4992a', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
              Ver evolución →
            </Link>
          </div>
        ) : rondasParaIndice > 0 && rondasParaIndice < 3 ? (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.2)',
            borderRadius: '14px', padding: '20px', marginBottom: '20px',
          }}>
            <div style={{ fontSize: '11px', color: '#c4992a', fontFamily: 'var(--font-dm-mono), monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Progreso del índice
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
              {rondasParaIndice} de 3 rondas para activar tu Índice Golfers+
            </div>
            {/* Progress bar */}
            <div style={{ background: 'rgba(196,153,42,0.1)', borderRadius: '6px', height: '8px', overflow: 'hidden', marginBottom: '10px' }}>
              <div style={{ background: '#c4992a', height: '100%', borderRadius: '6px', width: `${(rondasParaIndice / 3) * 100}%`, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
              Juega {3 - rondasParaIndice} ronda{3 - rondasParaIndice !== 1 ? 's' : ''} más para desbloquear tu Índice Golfers+
            </div>
          </div>
        ) : null}

        {/* 4.2 — Recent completed round with share */}
        {recentRound && recentRound.total_gross != null && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.2)',
            borderRadius: '14px', padding: '16px', marginBottom: '20px',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono), monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Tu última ronda
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', fontFamily: '"Playfair Display", serif' }}>
                  {recentRound.total_gross}
                  {recentRound.diferencial != null && (
                    <span style={{ fontSize: '14px', fontWeight: 600, color: recentRound.diferencial <= 0 ? '#4ade80' : recentRound.diferencial <= 5 ? '#c4992a' : '#f87171', marginLeft: '8px' }}>
                      ({recentRound.diferencial >= 0 ? '+' : ''}{recentRound.diferencial})
                    </span>
                  )}
                  <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text-2)', marginLeft: '8px' }}>
                    en {recentRound.course_name ?? 'Cancha'}
                  </span>
                </div>
                {recentRound.played_at && (
                  <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>
                    {new Date(recentRound.played_at + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                )}
              </div>
              <ShareRoundButton
                scoreGross={recentRound.total_gross}
                scoreDiff={recentRound.diferencial ?? 0}
                courseName={recentRound.course_name ?? 'Cancha'}
              />
            </div>
          </div>
        )}

        {/* Next step — single contextual nudge */}
        {nextStep && !isNewUser && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(196,153,42,0.06) 0%, rgba(196,153,42,0.02) 100%)',
            border: '1px solid rgba(196,153,42,0.15)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text)',
                marginBottom: '6px',
                lineHeight: 1.3,
              }}>
                {nextStep.title}
              </div>
              <div style={{
                fontSize: '13px',
                color: 'var(--text-2)',
                lineHeight: 1.5,
              }}>
                {nextStep.description}
              </div>
            </div>
            <Link href={nextStep.href} style={{
              background: '#c4992a',
              color: '#070d18',
              fontWeight: 700,
              fontSize: '13px',
              padding: '12px 24px',
              borderRadius: '10px',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {nextStep.cta}
            </Link>
          </div>
        )}

        {/* 4.4 — Welcome empty state for brand new users */}
        {isNewUser && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{
              background: 'rgba(196,153,42,0.04)', border: '1px solid rgba(196,153,42,0.2)',
              borderRadius: '16px', padding: '32px 24px', textAlign: 'center', marginBottom: '24px',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>⛳</div>
              <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: 'var(--text)', marginBottom: '8px' }}>
                Bienvenido a Golfers+
              </div>
              <p style={{ fontSize: '15px', color: 'var(--text-2)', margin: '0 auto', maxWidth: '420px', lineHeight: 1.5 }}>
                Tu primer paso: crea una ronda o importa tu historial. Con 3+ rondas se activa tu Indice Golfers+ y el coaching con IA.
              </p>
            </div>

            <div className="dashboard-actions" style={{ gap: '16px' }}>
              {/* Crear primera ronda */}
              <Link href="/ronda-libre/nueva" style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'rgba(196,153,42,0.07)', border: '1px solid rgba(196,153,42,0.35)',
                  borderRadius: '14px', padding: '20px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏌️</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#c4992a', marginBottom: '6px' }}>Crea tu primera ronda</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>Juega con amigos, registra tu score en vivo</div>
                </div>
              </Link>

              {/* Importar historial */}
              <Link href="/importar" style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: '14px', padding: '20px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>📥</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>Importa tu historial</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>Trae tus rondas pasadas y activa tu Índice Golfers+</div>
                </div>
              </Link>

              {/* Golf Intelligence */}
              <Link href="/perfil/stats" style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: '14px', padding: '20px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>🧠</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>Explora Golf Intelligence</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>Estadísticas, tendencias y coaching con IA</div>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* 2 — Action cards (only show if not brand new — new users see welcome cards above) */}
        {!isNewUser && (
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
        )}

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
