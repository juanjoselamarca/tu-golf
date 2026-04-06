'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminTopBar } from '@/components/admin/AdminTopBar'
import { adminColors } from '@/components/admin/admin-tokens'

const NAV_ITEMS = [
  { href: '/admin',            icon: '\u26A1', label: 'Command' },
  { href: '/admin/usuarios',   icon: '\uD83D\uDC65', label: 'Usuarios' },
  { href: '/admin/analytics',  icon: '\uD83D\uDCCA', label: 'Analytics' },
  { href: '/admin/golf-ops',   icon: '\u26F3',  label: 'Golf Ops' },
  { href: '/admin/finanzas',   icon: '\uD83D\uDCB0', label: 'Finanzas' },
  { href: '/admin/sistema',    icon: '\uD83D\uDD27', label: 'Sistema' },
]

const SECTION_NAMES: Record<string, string> = {
  '/admin': 'Command Center',
  '/admin/usuarios': 'Usuarios',
  '/admin/analytics': 'Analytics',
  '/admin/golf-ops': 'Golf Ops',
  '/admin/finanzas': 'Finanzas',
  '/admin/sistema': 'Sistema',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authorized, setAuthorized] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Auth check
  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) { router.replace('/dashboard'); return }
        const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
        if (p?.role !== 'admin') { router.replace('/dashboard'); return }
        setAuthorized(true)
        return
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.replace('/dashboard'); return }
      setAuthorized(true)
    }
    check()
  }, [router])

  // Responsive
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth
      setIsMobile(w < 768)
      setSidebarCollapsed(w < 1024)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  const currentSection = SECTION_NAMES[pathname] || Object.entries(SECTION_NAMES).find(([k]) => k !== '/admin' && pathname.startsWith(k))?.[1] || 'Admin'

  if (!authorized) return (
    <div style={{
      background: adminColors.bg, minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: adminColors.gray, fontFamily: "'DM Sans', sans-serif",
    }}>
      Verificando acceso...
    </div>
  )

  const sidebarWidth = sidebarCollapsed ? 64 : 220
  const contentMarginLeft = isMobile ? 0 : sidebarWidth

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      <div style={{ minHeight: '100vh', background: adminColors.bg }}>
        {/* Sidebar — desktop/tablet only */}
        {!isMobile && (
          <AdminSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
        )}

        {/* Content area */}
        <div style={{
          marginLeft: contentMarginLeft,
          transition: 'margin-left 0.2s ease',
          display: 'flex', flexDirection: 'column', minHeight: '100vh',
        }}>
          {/* Mobile header — replaces TopBar on mobile */}
          {isMobile ? (
            <header style={{
              position: 'sticky', top: 0, zIndex: 40,
              background: adminColors.bgDeep,
              borderBottom: `1px solid ${adminColors.border}`,
              padding: '0 16px',
            }}>
              {/* Row 1: Logo + back button */}
              <div style={{
                height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontFamily: "'Playfair Display', serif", fontSize: '16px',
                    color: adminColors.ivory, fontWeight: 700,
                  }}>Golfers+</span>
                  <span style={{
                    background: adminColors.gold, color: adminColors.bgDeep,
                    fontSize: '8px', fontWeight: 800, padding: '2px 6px',
                    borderRadius: '4px', letterSpacing: '0.1em',
                  }}>ADMIN</span>
                </div>
                <Link href="/dashboard" style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  color: adminColors.gray, fontSize: '13px', textDecoration: 'none',
                  background: `rgba(148,168,192,0.1)`, padding: '6px 12px', borderRadius: '8px',
                }}>
                  <span style={{ fontSize: '14px' }}>{'\u2190'}</span>
                  <span>App</span>
                </Link>
              </div>

              {/* Row 2: Section name + live status (compact) */}
              <div style={{
                height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderTop: `1px solid ${adminColors.border}`,
              }}>
                <span style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: '14px',
                  color: adminColors.gold, fontWeight: 600,
                }}>{currentSection}</span>
                <AdminTopBar compact />
              </div>
            </header>
          ) : (
            <AdminTopBar />
          )}

          <main style={{
            flex: 1,
            padding: isMobile ? '16px 14px 90px 14px' : '24px',
            maxWidth: '1400px', width: '100%', margin: '0 auto', boxSizing: 'border-box',
          }}>
            {children}
          </main>
        </div>

        {/* Mobile bottom nav */}
        {isMobile && (
          <nav style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: adminColors.bgDeep,
            borderTop: `1px solid ${adminColors.border}`,
            display: 'flex', alignItems: 'stretch', justifyContent: 'space-around',
            zIndex: 50,
            paddingBottom: 'env(safe-area-inset-bottom)',
            height: '60px',
          }}>
            {NAV_ITEMS.map(item => {
              const active = isActive(item.href)
              return (
                <Link key={item.href} href={item.href} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: '3px',
                  textDecoration: 'none', flex: 1,
                  color: active ? adminColors.gold : adminColors.grayDim,
                  fontSize: '10px', fontWeight: active ? 700 : 400,
                  fontFamily: "'DM Sans', sans-serif",
                  borderTop: active ? `2px solid ${adminColors.gold}` : '2px solid transparent',
                  transition: 'color 0.15s',
                }}>
                  <span style={{ fontSize: '22px', lineHeight: 1 }}>{item.icon}</span>
                  <span style={{ letterSpacing: '0.02em' }}>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        )}
      </div>
    </>
  )
}
