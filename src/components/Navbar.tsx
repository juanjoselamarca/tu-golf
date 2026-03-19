'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { isAdminEmail } from '@/lib/admin'
import type { User } from '@supabase/supabase-js'

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [playSheetOpen, setPlaySheetOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Close sidebar & play sheet on route change
  useEffect(() => { setSidebarOpen(false); setPlaySheetOpen(false) }, [pathname])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setSidebarOpen(false)
    router.push('/')
  }

  // Only hide on login/register (navbar needed everywhere else)
  if (pathname === '/login' || pathname === '/register') return null

  // Score page gets minimal header (handled by score page itself)
  if (pathname.includes('/score')) return null

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || ''
  const userInitials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'

  const navItems = user ? [
    { href: '/', icon: '🏠', label: 'Inicio' },
    { href: '/dashboard', icon: '📊', label: 'Dashboard' },
    { href: '/ronda-libre/nueva', icon: '⛳', label: 'Nueva Ronda' },
    { href: '/leaderboard', icon: '🏆', label: 'Leaderboard' },
    { href: '/perfil', icon: '👤', label: 'Mi Perfil' },
    { href: '/perfil/stats', icon: '📈', label: 'Estadísticas' },
    { href: '/perfil/historial', icon: '📋', label: 'Historial' },
    { href: '/coach', icon: '🐯', label: 'tAIger+' },
    ...(isAdminEmail(user?.email) ? [{ href: '/admin', icon: '⚙️', label: 'Admin' }] : []),
  ] : [
    { href: '/', icon: '🏠', label: 'Inicio' },
    { href: '/leaderboard', icon: '🏆', label: 'Leaderboard' },
    { href: '/demo', icon: '✦', label: 'Ver Demo' },
  ]

  return (
    <>
      {/* ── Header bar — always visible ─────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(7,13,24,0.95)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(196,153,42,0.12)',
        height: '56px',
      }}>
        <div style={{
          maxWidth: '1280px', margin: '0 auto', padding: '0 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: '100%',
        }}>
          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '44px', height: '44px', background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, color: 'rgba(255,255,255,0.7)',
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Menú"
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Logo — always goes to landing */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '2px', textDecoration: 'none', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '20px', color: '#edeae4' }}>Golfers</span>
            <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '20px', color: '#C4992A' }}>+</span>
          </Link>

          {/* Right: avatar or login */}
          {user ? (
            <Link href="/perfil" style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: '#C4992A', color: '#070d18',
              fontWeight: 700, fontSize: '13px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none', flexShrink: 0,
            }}>
              {userInitials}
            </Link>
          ) : (
            <Link href="/login" style={{
              fontSize: '14px', fontWeight: 600, color: '#C4992A',
              textDecoration: 'none', padding: '8px 16px',
              border: '1px solid rgba(196,153,42,0.3)', borderRadius: '10px',
            }}>
              Entrar
            </Link>
          )}
        </div>
      </nav>

      {/* ── Sidebar overlay ─────────────────────────────── */}
      <div
        onClick={() => setSidebarOpen(false)}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 198,
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? 'auto' : 'none',
          transition: 'opacity 300ms ease',
        }}
      />

      {/* ── Sidebar ─────────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: '280px', zIndex: 199,
        background: '#0a1628',
        borderRight: '1px solid rgba(196,153,42,0.12)',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {/* Sidebar header */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid rgba(196,153,42,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: user ? '16px' : '0' }}>
            <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '20px' }}>
              <span style={{ color: '#edeae4' }}>Golfers</span>
              <span style={{ color: '#C4992A' }}>+</span>
            </span>
            <button onClick={() => setSidebarOpen(false)} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
              fontSize: '24px', cursor: 'pointer', padding: '4px 8px', lineHeight: 1,
            }}>×</button>
          </div>

          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: '#C4992A', color: '#070d18',
                fontWeight: 700, fontSize: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{userInitials}</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#edeae4' }}>{userName}</div>
                <div style={{ fontSize: '11px', color: '#94a8c0' }}>{user.email}</div>
              </div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {navItems.map(item => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)} style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '12px 12px', minHeight: '48px',
                borderRadius: '10px', marginBottom: '2px',
                textDecoration: 'none',
                background: isActive ? 'rgba(196,153,42,0.1)' : 'transparent',
                color: isActive ? '#C4992A' : '#edeae4',
                fontSize: '15px', fontWeight: isActive ? 600 : 400,
                transition: 'background 0.15s',
              }}>
                <span style={{ fontSize: '18px', width: '24px', textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Sidebar footer */}
        <div style={{
          padding: '12px 16px 20px',
          borderTop: '1px solid rgba(196,153,42,0.1)',
        }}>
          {user ? (
            <button onClick={handleLogout} style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '12px', width: '100%', minHeight: '48px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#94a8c0', fontSize: '14px', textAlign: 'left',
              borderRadius: '10px',
            }}>
              <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>🚪</span>
              Cerrar sesión
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Link href="/login" onClick={() => setSidebarOpen(false)} style={{
                display: 'block', padding: '12px 16px', textAlign: 'center',
                color: '#edeae4', fontSize: '15px', textDecoration: 'none',
                border: '1px solid rgba(196,153,42,0.3)', borderRadius: '10px',
              }}>
                Iniciar sesión
              </Link>
              <Link href="/register" onClick={() => setSidebarOpen(false)} style={{
                display: 'block', padding: '12px 16px', textAlign: 'center',
                color: '#070d18', fontSize: '15px', fontWeight: 700, textDecoration: 'none',
                background: '#C4992A', borderRadius: '10px',
              }}>
                Registrarse gratis
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Nav Bar (mobile only, logged in) ────── */}
      {user && (
        <>
          {/* CSS for mobile-only visibility */}
          <style>{`
            .bottom-nav-bar { display: none !important; }
            @media (max-width: 767px) {
              .bottom-nav-bar { display: flex !important; }
            }
          `}</style>

          <nav className="bottom-nav-bar" style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: `calc(56px + env(safe-area-inset-bottom, 0px))`,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            background: 'rgba(7,13,24,0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderTop: '1px solid rgba(196,153,42,0.12)',
            zIndex: 100,
            alignItems: 'center',
            justifyContent: 'space-around',
          }}>
            {/* Inicio */}
            {(() => {
              const active = pathname === '/'
              const clr = active ? '#c4992a' : 'rgba(255,255,255,0.4)'
              return (
                <Link href="/" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', minWidth: '44px', minHeight: '44px', textDecoration: 'none' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-dm-mono), monospace', color: clr, fontWeight: active ? 600 : 400 }}>Inicio</span>
                </Link>
              )
            })()}

            {/* Dashboard */}
            {(() => {
              const active = pathname === '/dashboard' || pathname.startsWith('/dashboard/')
              const clr = active ? '#c4992a' : 'rgba(255,255,255,0.4)'
              return (
                <Link href="/dashboard" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', minWidth: '44px', minHeight: '44px', textDecoration: 'none' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-dm-mono), monospace', color: clr, fontWeight: active ? 600 : 400 }}>Mi Golf</span>
                </Link>
              )
            })()}

            {/* FAB — Jugar */}
            <button
              onClick={() => setPlaySheetOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '48px', height: '48px', borderRadius: '50%',
                background: '#c4992a', border: 'none',
                marginBottom: '10px',
                boxShadow: '0 4px 16px rgba(196,153,42,0.35)',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
              aria-label="Jugar"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#070d18" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            {/* tAIger+ */}
            {(() => {
              const active = pathname === '/coach' || pathname.startsWith('/coach/')
              const clr = active ? '#c4992a' : 'rgba(255,255,255,0.4)'
              return (
                <Link href="/coach" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', minWidth: '44px', minHeight: '44px', textDecoration: 'none' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 00-3 3v1a3 3 0 006 0V5a3 3 0 00-3-3z" />
                    <path d="M19 10H5a2 2 0 00-2 2v1a7 7 0 0014 0v-1a2 2 0 00-2-2z" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                  </svg>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-dm-mono), monospace', color: clr, fontWeight: active ? 600 : 400 }}>Coach</span>
                </Link>
              )
            })()}

            {/* Perfil */}
            {(() => {
              const active = pathname === '/perfil' || pathname.startsWith('/perfil/')
              const clr = active ? '#c4992a' : 'rgba(255,255,255,0.4)'
              return (
                <Link href="/perfil" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', minWidth: '44px', minHeight: '44px', textDecoration: 'none' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-dm-mono), monospace', color: clr, fontWeight: active ? 600 : 400 }}>Perfil</span>
                </Link>
              )
            })()}
          </nav>

          {/* ── Play Bottom Sheet overlay ──────────────────── */}
          <div
            onClick={() => setPlaySheetOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 198,
              opacity: playSheetOpen ? 1 : 0,
              pointerEvents: playSheetOpen ? 'auto' : 'none',
              transition: 'opacity 300ms ease',
            }}
          />

          {/* ── Play Bottom Sheet ──────────────────────────── */}
          <div style={{
            position: 'fixed',
            bottom: 0, left: 0, right: 0,
            background: '#0a1628',
            borderRadius: '20px 20px 0 0',
            zIndex: 199,
            transform: playSheetOpen ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
            paddingBottom: 'env(safe-area-inset-bottom, 16px)',
          }}>
            {/* Pill drag indicator */}
            <div style={{
              display: 'flex', justifyContent: 'center', padding: '12px 0 4px',
            }}>
              <div style={{
                width: '36px', height: '4px', borderRadius: '2px',
                background: 'rgba(255,255,255,0.2)',
              }} />
            </div>

            {/* Title */}
            <div style={{ padding: '8px 24px 20px' }}>
              <h3 style={{
                fontFamily: '"Playfair Display", serif',
                fontSize: '20px', fontWeight: 700,
                color: '#edeae4', margin: 0,
              }}>
                ¿Cómo quieres jugar?
              </h3>
            </div>

            {/* Options */}
            <div style={{ padding: '0 20px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Ronda Libre */}
              <Link
                href="/ronda-libre/nueva"
                onClick={() => setPlaySheetOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px', padding: '16px',
                  minHeight: '64px', textDecoration: 'none',
                  cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
              >
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(196,153,42,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c4992a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 12h8M12 8v8" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#edeae4' }}>Ronda Libre</div>
                  <div style={{ fontSize: '12px', color: '#94a8c0', marginTop: '2px' }}>Juega con amigos, score en vivo</div>
                </div>
              </Link>

              {/* Organizar Torneo */}
              <Link
                href="/organizador/nuevo"
                onClick={() => setPlaySheetOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px', padding: '16px',
                  minHeight: '64px', textDecoration: 'none',
                  cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
              >
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a8c0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9H4.5a2.5 2.5 0 010-5C7 4 7 7 7 7" />
                    <path d="M18 9h1.5a2.5 2.5 0 000-5C17 4 17 7 17 7" />
                    <path d="M4 22h16" />
                    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                    <path d="M18 2H6v7a6 6 0 0012 0V2z" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#edeae4' }}>Organizar Torneo</div>
                  <div style={{ fontSize: '12px', color: '#94a8c0', marginTop: '2px' }}>Crea tu campeonato</div>
                </div>
              </Link>

              {/* Liga de Golf — disabled */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '14px', padding: '16px',
                minHeight: '64px', opacity: 0.4, cursor: 'default',
              }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a8c0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 15l-2 5h4l-2-5z" />
                    <circle cx="12" cy="8" r="6" />
                    <path d="M9 8h6" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#edeae4' }}>Liga de Golf</div>
                  <div style={{ fontSize: '12px', color: '#94a8c0', marginTop: '2px' }}>Próximamente</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
