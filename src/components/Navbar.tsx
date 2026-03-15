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

  /* ── auth ─────────────────────────────────────────────── */
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  /* ── scroll ────────────────────────────────────────────── */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* ── close dropdown on outside click ──────────────────── */
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

  // Hide on dedicated-navbar pages
  if (pathname.startsWith('/torneo/') || pathname.startsWith('/dashboard')) return null

  // User display info
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

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-7">
            {navLink('/', 'Inicio')}
            {navLink('/leaderboard', 'Leaderboard')}
            {user && navLink('/ronda-libre/nueva', '⛳ Ronda Libre')}
          </div>

          {/* Desktop auth */}
          <div className="hidden md:flex items-center gap-3">
            {/* Live demo link — always visible */}
            <Link
              href="/torneo/tpc-sawgrass-amateur-2025"
              className="flex items-center gap-1.5 text-sm font-medium font-sans text-ivory hover:text-ivory/80 transition-colors"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: '#c4992a' }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: '#c4992a' }} />
              </span>
              Ver torneo en vivo
            </Link>

            {user ? (
              /* Authenticated — Mi Dashboard + circle + name + dropdown */
              <>
                {pathname !== '/dashboard' && (
                  <Link
                    href="/dashboard"
                    className="text-sm font-medium font-sans text-ivory hover:text-gold transition-colors"
                  >
                    Mi Dashboard
                  </Link>
                )}
              <div ref={dropdownRef} className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 cursor-pointer"
                  style={{ background: 'none', border: 'none', padding: 0 }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: '#c4992a',
                      color: '#070d18',
                      fontWeight: 700,
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {userInitials}
                  </div>
                  <span className="text-ivory text-sm font-sans">{userName}</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    style={{
                      color: '#7a8fa8',
                      transition: 'transform 200ms',
                      transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  >
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Dropdown */}
                {dropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 8px)',
                      background: '#0e1c2f',
                      border: '1px solid rgba(196,153,42,0.2)',
                      borderRadius: '10px',
                      padding: '8px',
                      minWidth: '160px',
                      zIndex: 100,
                    }}
                  >
                    <Link
                      href="/dashboard"
                      onClick={() => setDropdownOpen(false)}
                      className="block px-4 py-2 text-sm font-sans text-ivory hover:text-gold rounded transition-colors"
                      style={{ textDecoration: 'none' }}
                    >
                      Mi dashboard
                    </Link>
                    <div style={{ height: '1px', background: 'rgba(196,153,42,0.15)', margin: '4px 0' }} />
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm font-sans text-gray-soft hover:text-ivory rounded transition-colors"
                      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
              </>
            ) : (
              /* Not authenticated */
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium font-sans text-ivory/70 hover:text-ivory transition-colors"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-semibold font-sans px-4 py-2 transition-all duration-200 hover:brightness-110"
                  style={{
                    background:   '#c4992a',
                    color:        '#070d18',
                    borderRadius: '8px',
                    fontSize:     '14px',
                    textDecoration: 'none',
                  }}
                >
                  Registrarse
                </Link>
              </>
            )}
          </div>

          {/* Hamburger */}
          <button
            className="md:hidden text-ivory/70 p-2 hover:text-ivory transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menú"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div
            className="md:hidden py-5 flex flex-col gap-4"
            style={{ borderTop: '1px solid rgba(196,153,42,0.2)' }}
          >
            <Link href="/" className="text-ivory/70 hover:text-ivory text-sm font-medium font-sans" onClick={() => setMenuOpen(false)}>Inicio</Link>
            <Link href="/leaderboard" className="text-ivory/70 hover:text-ivory text-sm font-medium font-sans" onClick={() => setMenuOpen(false)}>Leaderboard</Link>
            {user && <Link href="/ronda-libre/nueva" className="text-ivory/70 hover:text-ivory text-sm font-medium font-sans" onClick={() => setMenuOpen(false)}>⛳ Ronda Libre</Link>}
            <Link
              href="/torneo/tpc-sawgrass-amateur-2025"
              className="flex items-center gap-1.5 text-ivory text-sm font-medium font-sans"
              onClick={() => setMenuOpen(false)}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: '#c4992a' }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: '#c4992a' }} />
              </span>
              Ver torneo en vivo
            </Link>

            <div className="pt-3 flex flex-col gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {user ? (
                <>
                  <Link href="/dashboard" className="text-ivory/70 hover:text-ivory text-sm font-medium font-sans" onClick={() => setMenuOpen(false)}>Mi dashboard</Link>
                  <button
                    onClick={handleLogout}
                    className="text-ivory/70 hover:text-ivory text-sm font-medium font-sans text-left"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login"    className="text-ivory/70 hover:text-ivory text-sm font-medium font-sans" onClick={() => setMenuOpen(false)}>Iniciar sesión</Link>
                  <Link href="/register" className="text-gold hover:text-gold-light text-sm font-semibold font-sans" onClick={() => setMenuOpen(false)}>Registrarse</Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
