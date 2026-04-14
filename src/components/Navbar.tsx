'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import NotificationHub from '@/components/NotificationHub'
import { Home, Trophy, Radio, TrendingUp, ClipboardList, Upload, Zap, Play, Bell } from '@/components/icons'
import { TaigerIcon } from '@/components/icons/TaigerIcon'
import { useTheme } from '@/contexts/ThemeContext'
import { getNavTheme } from './nav/nav-theme'

// KNOWN ISSUE (audit 2026-03-24): There is a potential race condition between
// getUser() and onAuthStateChange(). The setUser/setIsAdmin calls are not
// synchronized, so there can be a brief flash of incorrect state. This is a
// cosmetic issue only (no security impact — all protected routes check server-side).
// DO NOT MODIFY this component without thorough testing — a previous fix attempt
// caused a production outage. The fix requires a careful refactor with useRef guards.
export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [playSheetOpen, setPlaySheetOpen] = useState(false)
  const [notifHubOpen, setNotifHubOpen] = useState(false)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const t = getNavTheme(isDark)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) {
        supabase.from('profiles').select('role').eq('id', data.user.id).single()
          .then(({ data: profile }) => setIsAdmin(profile?.role === 'admin'))
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        supabase.from('profiles').select('role').eq('id', session.user.id).single()
          .then(({ data: profile }) => setIsAdmin(profile?.role === 'admin'))
      } else {
        setIsAdmin(false)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Close sidebar & play sheet on route change
  useEffect(() => { setSidebarOpen(false); setPlaySheetOpen(false); setAvatarMenuOpen(false) }, [pathname])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setSidebarOpen(false)
    setUser(null)
    setIsAdmin(false)
    // Hard redirect to clear all cached state
    window.location.href = '/'
  }

  // Hide on these routes (they have their own navigation)
  if (pathname === '/login' || pathname === '/register') return null
  if (pathname.includes('/score')) return null
  if (pathname.startsWith('/admin')) return null

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || ''
  const userInitials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'

  // Menú organizado en 3 bloques para usuarios autenticados
  const menuBlocks = user ? [
    {
      label: 'COMUNIDAD',
      items: [
        { href: '/en-vivo', icon: <Radio size={18} />, label: 'En Vivo', badge: 'LIVE' },
      ],
    },
    {
      label: 'MI JUEGO',
      items: [
        { href: '/perfil/stats', icon: <TrendingUp size={18} />, label: 'Mi CPI' },
        { href: '/perfil/historial', icon: <ClipboardList size={18} />, label: 'Rondas' },
        { href: '/coach', icon: <TaigerIcon size={18} />, label: 'tAIger+', badge: 'AI' },
        { href: '/importar', icon: <Upload size={18} />, label: 'Importar' },
      ],
    },
    {
      label: 'LABORATORIO',
      items: [
        { href: '/indices', icon: <Zap size={18} />, label: 'Intelligence' },
      ],
    },
  ] : []

  const navItemsGuest = [
    { href: '/', icon: <Home size={18} />, label: 'Inicio' },
    { href: '/leaderboard', icon: <Trophy size={18} />, label: 'Ranking' },
    { href: '/demo', icon: <Play size={18} />, label: 'Demo' },
    { href: '/indices', icon: <Zap size={18} />, label: 'Intelligence' },
  ]

  return (
    <>
      {/* ── Header bar — always visible ─────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: t.navBg,
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${t.navBorder}`,
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
              cursor: 'pointer', padding: 0, color: t.iconColor,
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
            <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '20px', color: t.logoText }}>Golfers</span>
            <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '20px', color: '#C4992A' }}>+</span>
          </Link>

          {/* Right: notification bell + avatar or login */}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
              <button
                onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
                style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: avatarMenuOpen ? t.avatarOpenBg : '#C4992A',
                  color: '#ffffff',
                  fontWeight: 700, fontSize: '13px', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'background 0.15s ease',
                }}
                aria-label="Mi cuenta"
              >
                {userInitials}
              </button>

              {/* Avatar dropdown */}
              {avatarMenuOpen && (
                <>
                  <div onClick={() => setAvatarMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
                  <div style={{
                    position: 'absolute', top: '44px', right: 0, zIndex: 200,
                    background: t.dropdownBg, border: `1px solid ${t.dropdownBorder}`,
                    borderRadius: '12px', padding: '8px', minWidth: '200px',
                    boxShadow: t.dropdownShadow,
                  }}>
                    <Link href="/perfil" onClick={() => setAvatarMenuOpen(false)} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                      color: t.menuText, fontSize: '14px', textDecoration: 'none', borderRadius: '8px',
                      minHeight: '44px',
                    }}>
                      <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>👤</span>Mi Perfil
                    </Link>
                    <button onClick={() => { setAvatarMenuOpen(false); setNotifHubOpen(true) }} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                      color: t.menuText, fontSize: '14px', background: 'none', border: 'none',
                      cursor: 'pointer', borderRadius: '8px', width: '100%', textAlign: 'left',
                      minHeight: '44px',
                    }}>
                      <span style={{ width: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Bell size={16} /></span>Notificaciones
                    </button>
                    {isAdmin && (
                      <Link href="/admin" onClick={() => setAvatarMenuOpen(false)} style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                        color: t.menuText, fontSize: '14px', textDecoration: 'none', borderRadius: '8px',
                        minHeight: '44px',
                      }}>
                        <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>⚙️</span>Administración
                      </Link>
                    )}
                    <div style={{ height: '1px', background: t.menuDivider, margin: '4px 0' }} />
                    <button onClick={() => { setAvatarMenuOpen(false); handleLogout() }} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                      color: t.menuMuted, fontSize: '14px', background: 'none', border: 'none',
                      cursor: 'pointer', borderRadius: '8px', width: '100%', textAlign: 'left',
                      minHeight: '44px',
                    }}>
                      <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>🚪</span>Cerrar sesión
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link href="/login" style={{
              fontSize: '14px', fontWeight: 600, color: t.loginBtnText,
              textDecoration: 'none', padding: '8px 16px',
              border: `1px solid ${t.loginBtnBorder}`, borderRadius: '10px',
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
          background: 'rgba(0,0,0,0.3)',
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
        background: t.sidebarBg,
        borderRight: `1px solid ${t.sidebarBorder}`,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {/* Sidebar header */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: `1px solid ${t.sidebarBorder}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: user ? '16px' : '0' }}>
            <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontSize: '20px' }}>
              <span style={{ color: t.logoText }}>Golfers</span>
              <span style={{ color: '#C4992A' }}>+</span>
            </span>
            <button onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú" style={{
              background: 'none', border: 'none', color: t.menuMuted,
              fontSize: '24px', cursor: 'pointer', padding: '4px 8px', lineHeight: 1,
            }}>×</button>
          </div>

          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: '#C4992A', color: '#ffffff',
                fontWeight: 700, fontSize: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{userInitials}</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: t.userName }}>{userName}</div>
                <div style={{ fontSize: '12px', color: t.userEmail }}>{user.email}</div>
              </div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {user ? (
            /* Menú en 3 bloques para usuarios autenticados */
            menuBlocks.map((block, blockIdx) => {
              if (block.items.length === 0) return null
              return (
                <div key={block.label}>
                  {blockIdx > 0 && <hr style={{ borderColor: t.sidebarBorder, margin: '12px 0', border: 'none', borderTop: `1px solid ${t.sidebarBorder}` }} />}
                  <p style={{
                    fontFamily: 'DM Mono, monospace', fontSize: '11px',
                    color: t.sectionLabel, letterSpacing: '0.12em',
                    textTransform: 'uppercase' as const, margin: '0 4px 6px',
                  }}>{block.label}</p>
                  {block.items.map(item => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    return (
                      <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 8px', minHeight: '44px',
                        borderRadius: '8px', marginBottom: '2px',
                        textDecoration: 'none',
                        background: isActive ? t.itemActiveBg : 'transparent',
                        color: isActive ? t.itemActive : t.itemText,
                        fontSize: '14px', fontWeight: isActive ? 600 : 500,
                        transition: 'background 0.15s',
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', flexShrink: 0 }}>{item.icon}</span>
                        <span style={{ flex: 1 }}>{item.label}</span>
                        {'badge' in item && (item as { badge?: string }).badge && (() => {
                          const b = (item as { badge?: string }).badge
                          const isLive = b === 'LIVE'
                          return (
                            <span style={{
                              fontSize: '9px', fontWeight: 700,
                              fontFamily: 'DM Mono, monospace',
                              letterSpacing: '0.08em',
                              padding: '2px 6px', borderRadius: '4px',
                              background: isLive ? 'rgba(74,222,128,0.15)' : 'rgba(196,153,42,0.15)',
                              color: isLive ? '#4ade80' : '#c4992a',
                              border: isLive ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(196,153,42,0.3)',
                            }}>{b}</span>
                          )
                        })()}
                      </Link>
                    )
                  })}
                </div>
              )
            })
          ) : (
            /* Lista simple para visitantes */
            navItemsGuest.map(item => {
              const isActive = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)} style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '12px 12px', minHeight: '48px',
                  borderRadius: '10px', marginBottom: '2px',
                  textDecoration: 'none',
                  background: isActive ? t.itemActiveBg : 'transparent',
                  color: isActive ? t.itemActive : t.itemText,
                  fontSize: '15px', fontWeight: isActive ? 600 : 500,
                  transition: 'background 0.15s',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', flexShrink: 0 }}>{item.icon}</span>
                  {item.label}
                </Link>
              )
            })
          )}

          {/* Dark mode toggle */}
          <div style={{ padding: '4px 8px', marginTop: '8px' }}>
            <hr style={{ border: 'none', borderTop: `1px solid ${t.sidebarBorder}`, margin: '0 0 12px' }} />
            <button
              onClick={toggleTheme}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 8px', minHeight: '44px',
                borderRadius: '8px', width: '100%',
                background: 'none', border: 'none',
                cursor: 'pointer', fontSize: '14px',
                color: t.menuMuted,
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: '18px', width: '24px', textAlign: 'center', flexShrink: 0 }}>
                {isDark ? '☀️' : '🌙'}
              </span>
              <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>
            </button>
          </div>
        </div>

        {/* Sidebar footer */}
        <div style={{
          padding: '12px 16px 20px',
          borderTop: `1px solid ${t.sidebarBorder}`,
        }}>
          {user ? (
            <div style={{ padding: '4px 12px', fontSize: '12px', color: t.menuMuted }}>
              {user.email}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Link href="/login" onClick={() => setSidebarOpen(false)} style={{
                display: 'block', padding: '12px 16px', textAlign: 'center',
                color: t.guestBtnText, fontSize: '15px', textDecoration: 'none',
                border: `1px solid ${t.guestBtnBorder}`, borderRadius: '10px',
              }}>
                Iniciar sesión
              </Link>
              <Link href="/register" onClick={() => setSidebarOpen(false)} style={{
                display: 'block', padding: '12px 16px', textAlign: 'center',
                color: t.registerText, fontSize: '15px', fontWeight: 700, textDecoration: 'none',
                background: t.registerBg, borderRadius: '10px',
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
          <nav style={{
            position: 'fixed',
            bottom: 0, left: 0, right: 0,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            background: t.bottomNavBg,
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            borderTop: `1px solid ${t.bottomNavBorder}`,
            zIndex: 100,
          }}>
            {/* Top border handled by borderTop on nav */}

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '52px', padding: '0 8px', maxWidth: '600px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

              {/* Inicio */}
              {(() => {
                const active = pathname === '/'
                const clr = active ? '#c4992a' : '#94a3b8'
                return (
                  <Link href="/" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', minWidth: '52px', height: '48px', textDecoration: 'none', position: 'relative' }}>
                    {active && <div style={{ position: 'absolute', top: '-1px', width: '20px', height: '2px', borderRadius: '1px', background: '#c4992a' }} />}
                    <svg width="21" height="21" viewBox="0 0 24 24" fill={active ? 'rgba(196,153,42,0.15)' : 'none'} stroke={clr} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-dm-mono), monospace', color: clr, fontWeight: active ? 600 : 400, letterSpacing: '0.02em' }}>Inicio</span>
                  </Link>
                )
              })()}

              {/* Live Scoring — dashboard with live indicator */}
              {(() => {
                const active = pathname === '/dashboard' || pathname.startsWith('/dashboard/')
                const clr = active ? '#c4992a' : '#94a3b8'
                return (
                  <Link href="/dashboard" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', minWidth: '52px', height: '48px', textDecoration: 'none', position: 'relative' }}>
                    {active && <div style={{ position: 'absolute', top: '-1px', width: '20px', height: '2px', borderRadius: '1px', background: '#c4992a' }} />}
                    <div style={{ position: 'relative' }}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill={active ? 'rgba(196,153,42,0.15)' : 'none'} stroke={clr} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
                      </svg>
                      {/* Live pulse dot — shows the app is alive */}
                      <div style={{
                        position: 'absolute', top: '-2px', right: '-3px',
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: '#16a34a',
                        boxShadow: '0 0 6px rgba(22,163,74,0.6)',
                        animation: 'livePulse 2s ease-in-out infinite',
                      }} />
                    </div>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-dm-mono), monospace', color: clr, fontWeight: active ? 600 : 400, letterSpacing: '0.02em' }}>Mi Golf</span>
                  </Link>
                )
              })()}

              {/* FAB — Live Score */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '-18px' }}>
                <button
                  onClick={() => setPlaySheetOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '52px', height: '52px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #c4992a 0%, #dbb44a 100%)',
                    border: '2px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 4px 20px rgba(196,153,42,0.4), 0 0 40px rgba(196,153,42,0.15)',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  aria-label="Jugar"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#070d18" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-dm-mono), monospace', color: '#c4992a', fontWeight: 600, marginTop: '3px', letterSpacing: '0.08em' }}>JUGAR</span>
              </div>

              {/* Coach AI */}
              {(() => {
                const active = pathname === '/coach' || pathname.startsWith('/coach/')
                const clr = active ? '#c4992a' : '#94a3b8'
                return (
                  <Link href="/coach" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', minWidth: '52px', height: '48px', textDecoration: 'none', position: 'relative' }}>
                    {active && <div style={{ position: 'absolute', top: '-1px', width: '20px', height: '2px', borderRadius: '1px', background: '#c4992a' }} />}
                    <svg width="21" height="21" viewBox="0 0 24 24" fill={active ? 'rgba(196,153,42,0.15)' : 'none'} stroke={clr} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      <path d="M8 9h8M8 13h4" />
                    </svg>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-dm-mono), monospace', color: clr, fontWeight: active ? 600 : 400, letterSpacing: '0.02em' }}>tAIger+</span>
                  </Link>
                )
              })()}

              {/* Perfil */}
              {(() => {
                const active = pathname === '/perfil' || pathname.startsWith('/perfil/')
                const clr = active ? '#c4992a' : '#94a3b8'
                return (
                  <Link href="/perfil" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', minWidth: '52px', height: '48px', textDecoration: 'none', position: 'relative' }}>
                    {active && <div style={{ position: 'absolute', top: '-1px', width: '20px', height: '2px', borderRadius: '1px', background: '#c4992a' }} />}
                    <svg width="21" height="21" viewBox="0 0 24 24" fill={active ? 'rgba(196,153,42,0.15)' : 'none'} stroke={clr} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-dm-mono), monospace', color: clr, fontWeight: active ? 600 : 400, letterSpacing: '0.02em' }}>Perfil</span>
                  </Link>
                )
              })()}

            </div>
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
      {/* ── Notification Hub ─────────────────────────── */}
      {notifHubOpen && (
        <NotificationHub onClose={() => setNotifHubOpen(false)} />
      )}
    </>
  )
}
