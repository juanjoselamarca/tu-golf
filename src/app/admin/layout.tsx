'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminTopBar } from '@/components/admin/AdminTopBar'
import { adminColors } from '@/components/admin/admin-tokens'

const MOBILE_NAV_ITEMS = [
  { href: '/admin',            icon: '\u26A1', label: 'Command' },
  { href: '/admin/analytics',  icon: '\uD83D\uDCCA', label: 'Analytics' },
  { href: '/admin/golf-ops',   icon: '\u26F3',  label: 'Golf Ops' },
  { href: '/admin/finanzas',   icon: '\uD83D\uDCB0', label: 'Finanzas' },
  { href: '/admin/sistema',    icon: '\uD83D\uDD27', label: 'Sistema' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authorized, setAuthorized] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Auth check — keep existing logic
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

  // Responsive sidebar state
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
      {/* Global styles and fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: adminColors.bg }}>
        {/* Sidebar — hidden on mobile */}
        {!isMobile && (
          <AdminSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(c => !c)}
          />
        )}

        {/* Content area */}
        <div style={{
          marginLeft: contentMarginLeft,
          transition: 'margin-left 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}>
          <AdminTopBar />

          <main style={{
            flex: 1,
            padding: isMobile ? '16px 12px 80px 12px' : '24px 24px 24px 24px',
            maxWidth: '1400px',
            width: '100%',
            margin: '0 auto',
            boxSizing: 'border-box',
          }}>
            {children}
          </main>
        </div>

        {/* Mobile bottom nav */}
        {isMobile && (
          <nav style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            height: '64px', background: adminColors.bgDeep,
            borderTop: `1px solid ${adminColors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-around',
            zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom)',
          }}>
            {MOBILE_NAV_ITEMS.map(item => {
              const active = isActive(item.href)
              return (
                <Link key={item.href} href={item.href} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                  textDecoration: 'none', padding: '6px 8px',
                  color: active ? adminColors.gold : adminColors.grayDim,
                  fontSize: '10px', fontWeight: active ? 600 : 400,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  <span style={{ fontSize: '20px' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        )}
      </div>
    </>
  )
}
