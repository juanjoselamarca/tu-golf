'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export default function Navbar() {
  const pathname = usePathname()
  const router   = useRouter()

  const [user,         setUser]         = useState<User | null>(null)
  const [menuOpen,     setMenuOpen]     = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [scrolled,     setScrolled]     = useState(false)
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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setDropdownOpen(false)
    router.push('/')
  }

  if (pathname.startsWith('/torneo/') || pathname.startsWith('/dashboard')) return null

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || ''
  const userInitials = userName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      className={`text-sm font-medium font-sans transition-colors duration-200 ${
        pathname === href
          ? 'text-gold border-b border-gold pb-0.5'
          : 'text-ivory/65 hover:text-ivory'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <>
      <nav
        className="sticky top-0 z-50 transition-all duration-300"
        style={{
          background:           scrolled ? 'rgba(7,13,24,0.97)' : 'rgba(7,13,24,0.82)',
          backdropFilter:       'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {/* Gold bottom border */}
        <div
          style={{
            position:   'absolute',
            bottom:     0,
            left:       0,
            right:      0,
            height:     '1px',
            background: 'linear-gradient(to right, transparent, rgba(196,153,42,0.45) 25%, rgba(196,153,42,0.45) 75%, transparent)',
          }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-0.5">
              <span className="font-display font-bold text-xl text-ivory leading-none">Tu</span>
              <span className="font-display font-bold text-xl text-gold  leading-none"> Golf</span>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-7">
              {navLink('/', 'Inicio')}
              {navLink('/leaderboard', 'Leaderboard')}
              {user && navLink('/ronda-libre/nueva', '⛳ Ronda Libre')}
            </div>

            {/* Desktop auth */}
            <div className="hidden md:flex items-center gap-3">
              {user ? (
                <div ref={dropdownRef} className="relative">
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 cursor-pointer"
                    style={{ background: 'none', border: 'none', padding: 0, minHeight: 0, minWidth: 0 }}
                  >
                    <div
                      style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: '#c4992a', color: '#070d18',
                        fontWeight: 700, fontSize: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {userInitials}
                    </div>
                    <span className="text-ivory text-sm font-sans">{userName}</span>
                    <svg
                      width="12" height="12" viewBox="0 0 12 12" fill="none"
                      style={{
                        color: '#7a8fa8',
                        transition: 'transform 200ms',
                        transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {dropdownOpen && (
                    <div
                      style={{
                        position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                        background: '#0e1c2f', border: '1px solid rgba(196,153,42,0.2)',
                        borderRadius: '10px', padding: '8px', minWidth: '180px', zIndex: 100,
                      }}
                    >
                      <Link href="/dashboard" onClick={() => setDropdownOpen(false)}
                        className="block px-4 py-2 text-sm font-sans text-ivory hover:text-gold rounded transition-colors"
                        style={{ textDecoration: 'none', minHeight: 0 }}>
                        Mi Dashboard
                      </Link>
                      <Link href="/perfil" onClick={() => setDropdownOpen(false)}
                        className="block px-4 py-2 text-sm font-sans text-ivory hover:text-gold rounded transition-colors"
                        style={{ textDecoration: 'none', minHeight: 0 }}>
                        Mi Perfil
                      </Link>
                      <Link href="/torneo/tpc-sawgrass-amateur-2025" onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-sans text-ivory hover:text-gold rounded transition-colors"
                        style={{ textDecoration: 'none', minHeight: 0 }}>
                        <span className="relative flex h-2 w-2 flex-shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: '#c4992a' }} />
                          <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: '#c4992a' }} />
                        </span>
                        Ver torneo en vivo
                      </Link>
                      <div style={{ height: '1px', background: 'rgba(196,153,42,0.15)', margin: '4px 0' }} />
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm font-sans text-gray-soft hover:text-ivory rounded transition-colors"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', minHeight: 0 }}
                      >
                        Cerrar sesión
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Link href="/login"
                    className="text-sm font-medium font-sans text-ivory/70 hover:text-ivory transition-colors"
                    style={{ minHeight: 0 }}>
                    Iniciar sesión
                  </Link>
                  <Link href="/register"
                    className="text-sm font-semibold font-sans px-4 py-2 transition-all duration-200 hover:brightness-110"
                    style={{ background: '#c4992a', color: '#070d18', borderRadius: '8px', fontSize: '14px', textDecoration: 'none', minHeight: 0 }}>
                    Registrarse
                  </Link>
                </>
              )}
            </div>

            {/* M2: Hamburger — mobile only */}
            <button
              className="md:hidden flex items-center justify-center text-ivory/70 hover:text-ivory transition-colors"
              style={{ width: '44px', height: '44px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '8px', padding: 0, minHeight: 0, minWidth: 0 }}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menú"
            >
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                }
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* M2: Bottom sheet overlay */}
      <div
        onClick={() => setMenuOpen(false)}
        className="md:hidden"
        style={{
          position:      'fixed',
          inset:         0,
          background:    'rgba(0,0,0,0.55)',
          zIndex:        98,
          opacity:       menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? 'auto' : 'none',
          transition:    'opacity 300ms',
        }}
      />

      {/* M2: Bottom sheet */}
      <div
        className="md:hidden"
        style={{
          position:      'fixed',
          bottom:        0,
          left:          0,
          right:         0,
          zIndex:        99,
          transform:     menuOpen ? 'translateY(0)' : 'translateY(100%)',
          transition:    'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
          background:    '#0e1c2f',
          borderTop:     '1px solid rgba(196,153,42,0.25)',
          borderRadius:  '20px 20px 0 0',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Drag handle */}
        <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.18)', borderRadius: '2px', margin: '12px auto 8px' }} />

        {/* Sheet header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 14px', borderBottom: '1px solid rgba(196,153,42,0.15)' }}>
          <span style={{ fontFamily: '"Playfair Display", serif', color: '#c4992a', fontWeight: 700, fontSize: '18px' }}>Tu Golf</span>
          <button
            onClick={() => setMenuOpen(false)}
            style={{ background: 'none', border: 'none', color: '#7a8fa8', fontSize: '26px', cursor: 'pointer', lineHeight: 1, padding: '4px 8px', minHeight: 0 }}
          >
            ×
          </button>
        </div>

        {/* Menu items */}
        <div style={{ padding: '4px 16px' }}>
          {[
            { href: '/',                   icon: '🏠', label: 'Inicio'        },
            { href: '/leaderboard',         icon: '📊', label: 'Leaderboard'  },
            ...(user ? [{ href: '/ronda-libre/nueva', icon: '⛳', label: 'Ronda Libre'   }] : []),
            ...(user ? [{ href: '/dashboard',          icon: '📋', label: 'Mi Dashboard' }] : []),
            ...(user ? [{ href: '/perfil',             icon: '👤', label: 'Mi Perfil'    }] : []),
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              style={{
                display:        'flex',
                alignItems:     'center',
                gap:            '16px',
                padding:        '14px 8px',
                minHeight:      '56px',
                borderBottom:   '1px solid rgba(255,255,255,0.04)',
                textDecoration: 'none',
                color:          pathname === item.href ? '#c4992a' : '#edeae4',
                fontSize:       '18px',
                fontWeight:     pathname === item.href ? 700 : 400,
              }}
            >
              <span style={{ fontSize: '22px', width: '28px', textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}

          {user ? (
            <button
              onClick={handleLogout}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '16px',
                padding:    '14px 8px',
                width:      '100%',
                minHeight:  '56px',
                background: 'none',
                border:     'none',
                cursor:     'pointer',
                color:      '#7a8fa8',
                fontSize:   '18px',
                textAlign:  'left',
              }}
            >
              <span style={{ fontSize: '22px', width: '28px', textAlign: 'center', flexShrink: 0 }}>🚪</span>
              Cerrar sesión
            </button>
          ) : (
            <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Link href="/login" onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '14px 16px', textAlign: 'center', color: '#edeae4', fontSize: '16px', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', minHeight: 0 }}>
                Iniciar sesión
              </Link>
              <Link href="/register" onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '14px 16px', textAlign: 'center', color: '#070d18', fontSize: '16px', fontWeight: 700, textDecoration: 'none', background: '#c4992a', borderRadius: '10px', minHeight: 0 }}>
                Registrarse
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
