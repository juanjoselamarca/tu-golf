import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'

interface Tournament {
  id: string
  name: string
  slug: string
  status: string
  date_start: string | null
  courses: { nombre: string } | null
}

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  draft:       { label: 'Borrador',    bg: 'rgba(122,143,168,0.15)', color: '#7a8fa8' },
  active:      { label: 'Activo',      bg: 'rgba(22,163,74,0.15)',   color: '#4ade80' },
  in_progress: { label: 'En curso',    bg: 'rgba(22,163,74,0.15)',   color: '#4ade80' },
  finished:    { label: 'Finalizado',  bg: 'rgba(196,153,42,0.15)', color: '#c4992a' },
  closed:      { label: 'Cerrado',     bg: 'rgba(196,153,42,0.15)', color: '#c4992a' },
  published:   { label: 'Publicado',   bg: 'rgba(196,153,42,0.15)', color: '#c4992a' },
  open:        { label: 'Inscripciones', bg: 'rgba(26,79,214,0.15)', color: '#7a9ef5' },
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const userName =
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Golfista'

  const userInitials = userName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const { data: myTournaments } = await supabase
    .from('tournaments')
    .select('id, name, slug, status, date_start, courses(nombre)')
    .eq('organizer_id', user.id)
    .order('created_at', { ascending: false })

  const tournaments = (myTournaments as unknown as Tournament[]) || []

  return (
    <div style={{ background: '#070d18', minHeight: '100vh' }}>
      {/* Navbar */}
      <nav
        style={{
          background: 'rgba(14,28,47,0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(196,153,42,0.15)',
          padding: '0 32px',
          height: '64px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <Link href="/" style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: '#c4992a', fontWeight: 700, textDecoration: 'none' }}>
          ⛳ Tu Golf
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {userInitials}
          </div>
          <span style={{ color: '#edeae4', fontSize: '14px' }}>{userName}</span>
          <LogoutButton />
        </div>
      </nav>

      {/* Content */}
      <main style={{ padding: '48px 32px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* Greeting */}
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '38px', color: '#edeae4', marginBottom: '8px', lineHeight: 1.2 }}>
          Hola, {userName} 👋
        </h1>
        <p style={{ fontSize: '16px', color: '#7a8fa8', marginBottom: '40px' }}>
          ¿Listo para tu próximo torneo?
        </p>

        {/* Gold divider */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, #c4992a, transparent)', marginBottom: '40px' }} />

        {/* Quick action cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '56px' }}>

          {/* Card 1 */}
          <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '14px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '44px', marginBottom: '16px' }}>🏆</div>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#edeae4', marginBottom: '8px' }}>Mis torneos</h2>
            <p style={{ fontSize: '14px', color: '#7a8fa8', marginBottom: '24px' }}>Aún no estás inscrito en ningún torneo.</p>
            <Link href="/leaderboard" style={{ display: 'inline-block', border: '1px solid rgba(196,153,42,0.5)', color: '#c4992a', background: 'transparent', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', textDecoration: 'none' }}>
              Explorar torneos →
            </Link>
          </div>

          {/* Card 2 */}
          <div style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '14px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '44px', marginBottom: '16px' }}>⛳</div>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#edeae4', marginBottom: '8px' }}>Organizar un torneo</h2>
            <p style={{ fontSize: '14px', color: '#7a8fa8', marginBottom: '24px' }}>Crea y gestiona tu propio torneo en minutos.</p>
            <Link href="/organizador/nuevo" style={{ display: 'inline-block', background: '#1a4fd6', color: 'white', fontWeight: 600, borderRadius: '8px', padding: '10px 20px', fontSize: '14px', textDecoration: 'none' }}>
              Crear torneo →
            </Link>
          </div>
        </div>

        {/* ── Mis torneos como organizador ─────────────────────── */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, rgba(196,153,42,0.4), transparent)', marginBottom: '40px' }} />

        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: '#edeae4', marginBottom: '24px' }}>
          Mis torneos como organizador
        </h2>

        {tournaments.length === 0 ? (
          <div style={{ background: '#0e1c2f', border: '1px dashed rgba(196,153,42,0.3)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
            <p style={{ color: '#7a8fa8', marginBottom: '20px', fontSize: '15px' }}>Aún no has creado ningún torneo.</p>
            <Link href="/organizador/nuevo" style={{ display: 'inline-block', background: '#c4992a', color: '#070d18', fontWeight: 700, borderRadius: '8px', padding: '12px 28px', fontSize: '15px', textDecoration: 'none' }}>
              Crear mi primer torneo →
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {tournaments.map((t) => {
              const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.draft
              const isActive = t.status === 'active' || t.status === 'in_progress'
              return (
                <div
                  key={t.id}
                  style={{ background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.15)', borderRadius: '12px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#edeae4', fontWeight: 600 }}>{t.name}</span>
                      <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}40`, padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>
                        {st.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#7a8fa8' }}>
                      {t.courses?.nombre && <span>⛳ {t.courses.nombre}</span>}
                      {t.date_start && <span style={{ marginLeft: '12px' }}>📅 {new Date(t.date_start).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <Link
                      href={`/organizador/${t.slug}/jugadores`}
                      style={{ background: 'rgba(122,143,168,0.1)', border: '1px solid rgba(122,143,168,0.25)', color: '#edeae4', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', textDecoration: 'none', fontWeight: 500 }}
                    >
                      Jugadores
                    </Link>
                    {isActive && (
                      <Link
                        href={`/organizador/${t.slug}/scoring`}
                        style={{ background: '#1a4fd6', color: 'white', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', textDecoration: 'none', fontWeight: 600 }}
                      >
                        Scoring
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
