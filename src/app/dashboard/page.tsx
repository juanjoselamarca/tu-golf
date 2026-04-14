import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Flag, Calendar, Trophy, Upload, PersonStanding } from '@/components/icons'
import TournamentCardMenu from '@/components/TournamentCardMenu'
import { ExperiencePopupWrapper } from '@/components/ExperiencePopupWrapper'
import { PostLoginRedirect } from '@/components/PostLoginRedirect'
import EnVivoWidget from '@/components/EnVivoWidget'

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
const btnPrimary:     React.CSSProperties = { background: '#c4992a', color: '#1a1a2e', fontWeight: 700, padding: '12px 20px', borderRadius: '10px', fontSize: '13px', textDecoration: 'none', border: 'none' }
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

  // Derived values for the new layout
  const activeRonda = rondasLibres.find(r => r.estado === 'en_curso')
  const finishedRondas = rondasLibres.filter(r => r.estado !== 'en_curso')
  const daysAgoText = recentRound?.played_at
    ? (() => {
        const days = Math.floor((Date.now() - new Date(recentRound.played_at + 'T12:00:00').getTime()) / 86400000)
        return days === 0 ? 'hoy' : days === 1 ? 'hace 1 dia' : `hace ${days} dias`
      })()
    : null

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <PostLoginRedirect />
      <ExperiencePopupWrapper />

      <main style={{ padding: '24px 16px 80px', maxWidth: '640px', margin: '0 auto' }}>

        {/* ============================================= */}
        {/* SECTION 1: Estado de forma — PROTAGONIST      */}
        {/* ============================================= */}
        <section style={{ marginBottom: '24px' }}>
          <h1 style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '28px',
            color: 'var(--text)',
            margin: '0 0 16px',
            lineHeight: 1.2,
          }}>
            {userName}
          </h1>

          {indiceActivo ? (
            <div style={{
              background: 'var(--bg-card-light)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: '"Playfair Display", serif',
                  fontSize: '32px',
                  fontWeight: 700,
                  color: '#c4992a',
                  lineHeight: 1,
                }}>
                  {indiceGolfers!.toFixed(1)}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                  Indice Golfers+
                </span>
              </div>
              {recentRound && recentRound.total_gross != null && (
                <div style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}>
                  <div>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                      {recentRound.total_gross} golpes
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-2)', marginLeft: '8px' }}>
                      {recentRound.course_name ?? 'Cancha'}
                    </span>
                  </div>
                  {daysAgoText && (
                    <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                      {daysAgoText}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : rondasParaIndice > 0 && rondasParaIndice < 3 ? (
            <div style={{
              background: 'var(--bg-card-light)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px',
            }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                {rondasParaIndice} de 3 rondas para tu Indice Golfers+
              </div>
              <div style={{
                background: 'rgba(196,153,42,0.1)',
                borderRadius: '6px',
                height: '6px',
                overflow: 'hidden',
              }}>
                <div style={{
                  background: '#c4992a',
                  height: '100%',
                  borderRadius: '6px',
                  width: `${(rondasParaIndice / 3) * 100}%`,
                }} />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '6px' }}>
                Juega {3 - rondasParaIndice} ronda{3 - rondasParaIndice !== 1 ? 's' : ''} mas en canchas con slope/rating
              </div>
            </div>
          ) : totalRounds === 0 ? (
            <div style={{
              background: 'var(--bg-card-light)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px',
              fontSize: '14px',
              color: 'var(--text-2)',
            }}>
              Juega 3 rondas para calcular tu Indice Golfers+
            </div>
          ) : null}
        </section>

        {/* ============================================= */}
        {/* SECTION 2: Acciones rapidas — compact row     */}
        {/* ============================================= */}
        <section style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {activeRonda ? (
              <Link
                href={`/ronda-libre/${activeRonda.codigo}/score`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: '#c4992a', color: '#1a1a2e',
                  fontWeight: 700, fontSize: '13px',
                  padding: '0 16px', minHeight: '44px',
                  borderRadius: '22px', textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <Flag size={16} />
                Continuar ronda
              </Link>
            ) : (
              <Link
                href="/ronda-libre/nueva"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: '#c4992a', color: '#1a1a2e',
                  fontWeight: 700, fontSize: '13px',
                  padding: '0 16px', minHeight: '44px',
                  borderRadius: '22px', textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <Flag size={16} />
                Nueva ronda
              </Link>
            )}
            <Link
              href="/coach"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontWeight: 600, fontSize: '13px',
                padding: '0 16px', minHeight: '44px',
                borderRadius: '22px', textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <PersonStanding size={16} />
              tAIger Coach
            </Link>
            <Link
              href="/importar"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontWeight: 600, fontSize: '13px',
                padding: '0 16px', minHeight: '44px',
                borderRadius: '22px', textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <Upload size={16} />
              Importar
            </Link>
          </div>
        </section>

        {/* ============================================= */}
        {/* SECTION 3: Torneos — only if exists            */}
        {/* ============================================= */}
        {(activeTournaments.length > 0 || tournaments.length > 0) && (
          <section style={{ marginBottom: '24px' }}>
            {/* Active tournaments as player */}
            {activeTournaments.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: tournaments.length > 0 ? '16px' : '0' }}>
                {activeTournaments.map((t) => {
                  const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.open
                  const fechaT = t.date_start
                    ? new Date(t.date_start).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                    : ''
                  return (
                    <Link key={t.id} href={`/torneo/${t.slug}`} style={{ textDecoration: 'none' }}>
                      <div style={{
                        background: 'var(--bg-card-light)',
                        border: '1px solid var(--border)',
                        borderLeft: '3px solid #c4992a',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: '15px', fontWeight: 600, color: 'var(--text)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {t.name}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>
                            {t.courses?.nombre}{fechaT ? ` · ${fechaT}` : ''}
                          </div>
                        </div>
                        <span style={{
                          background: st.bg, color: st.color,
                          border: `1px solid ${st.color}40`,
                          padding: '2px 10px', borderRadius: '20px',
                          fontSize: '11px', fontWeight: 600,
                          whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                          {st.label}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}

            {/* Tournaments as organizer */}
            {tournaments.length > 0 && (
              <div style={{
                background: 'var(--bg-card-light)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '14px 16px',
              }}>
                <div style={{
                  fontSize: '13px', fontWeight: 600, color: 'var(--text-2)',
                  marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  Mis torneos
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {tournaments.map((t) => {
                    const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.draft
                    const isActive = t.status === 'active' || t.status === 'in_progress'
                    return (
                      <div key={t.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: '8px', paddingBottom: '8px',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                          <Link href={`/torneo/${t.slug}`} style={{
                            fontSize: '14px', fontWeight: 600, color: 'var(--text)',
                            textDecoration: 'none',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {t.name}
                          </Link>
                          <span style={{
                            background: st.bg, color: st.color,
                            padding: '1px 8px', borderRadius: '20px',
                            fontSize: '10px', fontWeight: 600, flexShrink: 0,
                          }}>
                            {st.label}
                          </span>
                        </div>
                        <TournamentCardMenu slug={t.slug} isActive={isActive} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============================================= */}
        {/* SECTION 4: Actividad reciente — compact feed   */}
        {/* ============================================= */}
        {finishedRondas.length > 0 && (
          <section style={{ marginBottom: '24px' }}>
            <div style={{
              background: 'var(--bg-card-light)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '14px 16px',
            }}>
              <div style={{
                fontSize: '13px', fontWeight: 600, color: 'var(--text-2)',
                marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                Actividad reciente
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {finishedRondas.slice(0, 5).map((r, i) => {
                  const fechaDisplay = r.fecha
                    ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                    : ''
                  return (
                    <Link key={r.id} href={`/ronda-libre/${r.codigo}`} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: '8px', textDecoration: 'none',
                      padding: '10px 0',
                      borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                    }}>
                      <span style={{
                        fontSize: '14px', color: 'var(--text)', fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {r.course_name}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-2)', flexShrink: 0 }}>
                        {fechaDisplay}
                      </span>
                    </Link>
                  )
                })}
              </div>
              <Link href="/perfil/historial" style={{
                display: 'block', textAlign: 'center',
                marginTop: '10px', paddingTop: '10px',
                borderTop: '1px solid var(--border)',
                fontSize: '13px', fontWeight: 600, color: '#c4992a',
                textDecoration: 'none',
              }}>
                Ver todo
              </Link>
            </div>
          </section>
        )}

        {/* ============================================= */}
        {/* SECTION 5: En Vivo — only if exists            */}
        {/* ============================================= */}
        <EnVivoWidget />

      </main>
    </div>
  )
}
