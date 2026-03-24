'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const NAV_ITEMS = [
  { href: '/admin',              icon: '\u{1F4CA}', label: 'Overview' },
  { href: '/admin/usuarios',     icon: '\u{1F465}', label: 'Usuarios' },
  { href: '/admin/crecimiento',  icon: '\u{1F4C8}', label: 'Crecimiento' },
  { href: '/admin/golf',         icon: '\u26F3',     label: 'Golf' },
  { href: '/admin/taiger',       icon: '\u{1F42F}', label: 'tAIger' },
  { href: '/admin/monetizacion', icon: '\u{1F4B0}', label: 'Monetizaci\u00F3n' },
  { href: '/admin/geografia',    icon: '\u{1F30D}', label: 'Geograf\u00EDa' },
  { href: '/admin/sistema',      icon: '\u{1F527}', label: 'Sistema' },
  { href: '/admin/configuracion', icon: '\u2699\uFE0F', label: 'Config' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authorized, setAuthorized] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [now, setNow] = useState('')

  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // Fallback to session
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) { router.replace('/dashboard'); return }
        const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
        if (p?.role !== 'admin') { router.replace('/dashboard'); return }
        setAuthorized(true)
        return
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') {
        router.replace('/dashboard')
        return
      }
      setAuthorized(true)
    }
    check()
  }, [router])

  useEffect(() => {
    const update = () => setNow(new Date().toLocaleString('es-CL'))
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  if (!authorized) return (
    <div style={{ background: '#050b14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a8c0' }}>
      Verificando acceso...
    </div>
  )

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  const sidebar = (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '12px' }}>
      {NAV_ITEMS.map(item => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setSidebarOpen(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px', borderRadius: '8px',
            color: isActive(item.href) ? '#c4992a' : '#94a8c0',
            background: isActive(item.href) ? 'rgba(196,153,42,0.15)' : 'transparent',
            borderLeft: isActive(item.href) ? '3px solid #c4992a' : '3px solid transparent',
            textDecoration: 'none', fontSize: '14px', fontWeight: isActive(item.href) ? 600 : 400,
            transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: '16px' }}>{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#050b14' }}>
      {/* Desktop sidebar */}
      <aside style={{
        width: '240px', flexShrink: 0,
        background: '#070d18', borderRight: '1px solid #132540',
        display: 'none', position: 'fixed', top: 0, bottom: 0, left: 0,
        zIndex: 40, overflowY: 'auto',
      }} className="admin-sidebar">
        <div style={{ padding: '20px 16px', borderBottom: '1px solid #132540' }}>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#edeae4', marginBottom: '4px' }}>
            Golfers+
          </div>
          <span style={{ background: '#c4992a', color: '#070d18', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.1em' }}>
            ADMIN
          </span>
        </div>
        {sidebar}
        <div style={{ padding: '16px', borderTop: '1px solid #132540', marginTop: 'auto' }}>
          <Link href="/dashboard" style={{ color: '#94a8c0', fontSize: '12px', textDecoration: 'none' }}>
            &larr; Volver al Dashboard
          </Link>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={() => setSidebarOpen(false)} />
          <aside style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '280px',
            background: '#070d18', borderRight: '1px solid #132540', overflowY: 'auto',
          }}>
            <div style={{ padding: '20px 16px', borderBottom: '1px solid #132540', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#edeae4' }}>Golfers+</div>
                <span style={{ background: '#c4992a', color: '#070d18', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>ADMIN</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', color: '#94a8c0', fontSize: '24px', cursor: 'pointer' }}>&times;</button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, marginLeft: 0 }} className="admin-main">
        {/* Top bar */}
        <header style={{
          background: '#070d18', borderBottom: '1px solid #132540',
          padding: '12px 20px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setSidebarOpen(true)}
              style={{ background: 'none', border: 'none', color: '#94a8c0', fontSize: '20px', cursor: 'pointer', display: 'block' }}
              className="admin-hamburger"
            >
              &#9776;
            </button>
            <span style={{ color: '#edeae4', fontSize: '14px', fontWeight: 600 }}>Golfers+ Admin</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: '#94a8c0', fontSize: '12px' }}>{now}</span>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'rgba(196,153,42,0.2)', border: '1px solid #c4992a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#c4992a', fontSize: '12px', fontWeight: 700,
            }}>
              JL
            </div>
          </div>
        </header>

        {/* Mobile tab bar */}
        <div className="admin-mobile-tabs" style={{
          display: 'none',
          overflowX: 'auto',
          gap: '8px',
          padding: '12px 16px',
          borderBottom: '1px solid #132540',
          WebkitOverflowScrolling: 'touch',
        }}>
          {NAV_ITEMS.map(item => (
            <Link key={item.href} href={item.href} style={{
              flexShrink: 0,
              height: '36px',
              padding: '0 14px',
              borderRadius: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: isActive(item.href) ? 600 : 400,
              background: isActive(item.href) ? '#c4992a' : 'rgba(255,255,255,0.05)',
              color: isActive(item.href) ? '#070d18' : '#94a8c0',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ fontSize: '14px' }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>

        <main style={{ padding: '24px 20px', maxWidth: '1400px' }}>
          {children}
        </main>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .admin-sidebar { display: flex !important; flex-direction: column; }
          .admin-main { margin-left: 240px !important; }
          .admin-hamburger { display: none !important; }
        }
        @media (max-width: 1023px) {
          .admin-mobile-tabs { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
