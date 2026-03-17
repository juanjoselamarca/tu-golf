'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { isAdmin } from '@/lib/admin'
import type { User } from '@supabase/supabase-js'

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setDropdownOpen(false)
    setMenuOpen(false)
    router.push('/')
  }

  // Hide on: scorecards, login, register, dashboard (has own nav), torneo pages
  if (
    pathname.includes('/score') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname.startsWith('/torneo/') ||
    pathname.startsWith('/dashboard')
  ) return null

  const isDarkPage = pathname === '/' || pathname === '/leaderboard'

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || ''
  const userInitials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'

  const navBg = isDarkPage
    ? (scrolled ? 'rgba(7,13,24,0.92)' : 'rgba(7,13,24,0.6)')
    : (scrolled ? 'rgba(255,255,255,0.97)' : 'rgba(255,255,255,0.92)')
  const navBorder = isDarkPage ? '1px solid rgba(196,153,42,0.15)' : '1px solid #E5E7EB'
  const navShadow = isDarkPage ? 'none' : '0 1px 3px rgba(0,0,0,0.06)'
  const logoTuColor = isDarkPage ? '#FFFFFF' : '#111827'
  const linkColor = isDarkPage ? 'rgba(255,255,255,0.75)' : '#4B5563'
  const linkActiveColor = '#C4992A'
  const avatarTextColor = isDarkPage ? '#edeae4' : '#111827'

  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: navBg,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: navBorder,
        boxShadow: navShadow,
        transition: 'all 0.3s',
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '2px', textDecoration: 'none' }}>
            <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '20px', color: logoTuColor }}>Tu</span>
            <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '20px', color: '#C4992A' }}> Golf</span>
          </Link>

          {/* Desktop links */}
          <div className="nav-desktop-links" style={{ display: 'none', alignItems: 'center', gap: '28px' }}>
            {[
              { href: '/', label: 'Inicio' },
              { href: '/leaderboard', label: 'Leaderboard' },
              ...(user ? [{ href: '/ronda-libre/nueva', label: 'Ronda Libre' }] : []),
              ...(user ? [{ href: '/coach', label: 'Mi Coach' }] : []),
            ].map(link => (
              <Link key={link.href} href={link.href} style={{
                fontSize: '14px', fontWeight: 500, textDecoration: 'none',
                color: pathname === link.href ? linkActiveColor : linkColor,
                borderBottom: pathname === link.href ? '2px solid #C4992A' : '2px solid transparent',
                paddingBottom: '2px', transition: 'color 0.2s',
                minHeight: 0, minWidth: 0,
              }}>
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop auth */}
          <div className="nav-desktop-auth" style={{ display: 'none', alignItems: 'center', gap: '12px' }}>
            {user ? (
              <div ref={dropdownRef} style={{ position: 'relative' }}>
                <button onClick={() => setDropdownOpen(!dropdownOpen)} style={{
                  background: 'none', border: 'none', padding: '6px',
                  minHeight: '44px', minWidth: '44px',
                  display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: '#C4992A', color: '#070d18',
                    fontWeight: 700, fontSize: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{userInitials}</div>
                  <span style={{ fontSize: '14px', color: avatarTextColor }}>{userName}</span>
                </button>

                {dropdownOpen && (
                  <div style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                    background: isDarkPage ? '#0e1c2f' : '#FFFFFF',
                    border: isDarkPage ? '1px solid rgba(196,153,42,0.2)' : '1px solid #E5E7EB',
                    borderRadius: '10px', padding: '8px', minWidth: '200px', zIndex: 100,
                    boxShadow: isDarkPage ? 'none' : '0 4px 12px rgba(0,0,0,0.10)',
                  }}>
                    {[
                      { href: '/dashboard', label: 'Mi Dashboard' },
                      { href: '/perfil', label: 'Mi Perfil' },
                      { href: '/perfil/stats', label: 'Mis Estadísticas' },
                      { href: '/perfil/historial', label: 'Mi Historial' },
                    ].map(item => (
                      <Link key={item.href} href={item.href} onClick={() => setDropdownOpen(false)} style={{
                        display: 'block', padding: '8px 16px', fontSize: '14px',
                        color: isDarkPage ? '#edeae4' : '#4B5563',
                        textDecoration: 'none', borderRadius: '6px', minHeight: 0,
                      }}>{item.label}</Link>
                    ))}
                    {isAdmin(user?.email) && (
                      <>
                        <div style={{ height: '1px', background: isDarkPage ? 'rgba(196,153,42,0.15)' : '#E5E7EB', margin: '4px 0' }} />
                        <Link href="/admin" onClick={() => setDropdownOpen(false)} style={{
                          display: 'block', padding: '8px 16px', color: '#C4992A',
                          textDecoration: 'none', fontSize: '14px', minHeight: 0,
                        }}>Admin</Link>
                      </>
                    )}
                    <div style={{ height: '1px', background: isDarkPage ? 'rgba(196,153,42,0.15)' : '#E5E7EB', margin: '4px 0' }} />
                    <button onClick={handleLogout} style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 16px', fontSize: '14px',
                      color: isDarkPage ? '#7a8fa8' : '#9CA3AF',
                      background: 'none', border: 'none', cursor: 'pointer', minHeight: 0,
                    }}>Cerrar sesión</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/login" style={{
                  fontSize: '14px', fontWeight: 500,
                  color: isDarkPage ? 'rgba(255,255,255,0.7)' : '#4B5563',
                  textDecoration: 'none', minHeight: 0,
                }}>Iniciar sesión</Link>
                <Link href="/register" style={{
                  fontSize: '14px', fontWeight: 600,
                  background: '#C4992A', color: '#070d18',
                  padding: '8px 16px', borderRadius: '8px',
                  textDecoration: 'none', minHeight: 0,
                }}>Registrarse</Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button className="nav-mobile-hamburger" onClick={() => setMenuOpen(!menuOpen)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '44px', height: '44px', background: 'none', border: 'none',
            cursor: 'pointer', padding: 0, minHeight: 0, minWidth: 0,
            color: isDarkPage ? 'rgba(255,255,255,0.7)' : '#4B5563',
          }} aria-label="Menú">
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile sheet overlay */}
      <div onClick={() => setMenuOpen(false)} className="md:hidden" style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 98, opacity: menuOpen ? 1 : 0,
        pointerEvents: menuOpen ? 'auto' : 'none', transition: 'opacity 300ms',
      }} />

      {/* Mobile sheet */}
      <div className="md:hidden" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99,
        transform: menuOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        background: '#FFFFFF', borderTop: '1px solid #E5E7EB',
        borderRadius: '20px 20px 0 0',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
      }}>
        <div style={{ width: '36px', height: '4px', background: '#D1D5DB', borderRadius: '2px', margin: '12px auto 8px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 14px', borderBottom: '1px solid #E5E7EB' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', color: '#C4992A', fontWeight: 700, fontSize: '18px' }}>Tu Golf</span>
          <button onClick={() => setMenuOpen(false)} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '26px', cursor: 'pointer', lineHeight: 1, padding: '4px 8px', minHeight: 0 }}>×</button>
        </div>
        <div style={{ padding: '4px 16px' }}>
          {[
            { href: '/', icon: '🏠', label: 'Inicio' },
            { href: '/leaderboard', icon: '📊', label: 'Leaderboard' },
            ...(user ? [
              { href: '/ronda-libre/nueva', icon: '⛳', label: 'Ronda Libre' },
              { href: '/coach', icon: '🐯', label: 'Mi Coach' },
              { href: '/dashboard', icon: '📋', label: 'Mi Dashboard' },
              { href: '/perfil', icon: '👤', label: 'Mi Perfil' },
            ] : []),
            ...(user && isAdmin(user?.email) ? [{ href: '/admin', icon: '⚙️', label: 'Admin' }] : []),
          ].map(item => (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              padding: '14px 8px', minHeight: '56px',
              borderBottom: '1px solid rgba(0,0,0,0.04)', textDecoration: 'none',
              color: pathname === item.href ? '#C4992A' : '#111827',
              fontSize: '16px', fontWeight: pathname === item.href ? 600 : 400,
            }}>
              <span style={{ fontSize: '20px', width: '28px', textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
          {user ? (
            <button onClick={handleLogout} style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              padding: '14px 8px', width: '100%', minHeight: '56px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9CA3AF', fontSize: '16px', textAlign: 'left',
            }}>
              <span style={{ fontSize: '20px', width: '28px', textAlign: 'center', flexShrink: 0 }}>🚪</span>
              Cerrar sesión
            </button>
          ) : (
            <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Link href="/login" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '14px 16px', textAlign: 'center', color: '#111827', fontSize: '16px', textDecoration: 'none', border: '1px solid #E5E7EB', borderRadius: '10px', minHeight: 0 }}>
                Iniciar sesión
              </Link>
              <Link href="/register" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '14px 16px', textAlign: 'center', color: '#070d18', fontSize: '16px', fontWeight: 700, textDecoration: 'none', background: '#C4992A', borderRadius: '10px', minHeight: 0 }}>
                Registrarse
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      {user && (
        <div className="nav-bottom-bar" style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          height: '56px', background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid #E5E7EB',
          display: 'none', justifyContent: 'space-around', alignItems: 'center',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
          {[
            { href: '/', icon: '🏠', label: 'Inicio' },
            { href: '/leaderboard', icon: '📊', label: 'Ranking' },
            { href: '/ronda-libre/nueva', icon: '⛳', label: 'Ronda' },
            { href: '/coach', icon: '🐯', label: 'Coach' },
          ].map(item => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href.replace('/nueva', '')))
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: '2px',
                minWidth: '60px', minHeight: '44px',
                color: active ? '#C4992A' : '#9CA3AF',
                textDecoration: 'none', fontSize: '10px', fontWeight: active ? 600 : 400,
              }}>
                <span style={{ fontSize: '20px' }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </div>
      )}

      <style>{`
        @media (min-width: 768px) {
          .nav-desktop-links { display: flex !important; }
          .nav-desktop-auth { display: flex !important; }
          .nav-mobile-hamburger { display: none !important; }
        }
        @media (max-width: 767px) {
          .nav-bottom-bar { display: flex !important; }
        }
      `}</style>
    </>
  )
}
