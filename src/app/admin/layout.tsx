'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const NAV_ITEMS = [
  { href: '/admin',              icon: '📊', label: 'Overview' },
  { href: '/admin/usuarios',     icon: '👥', label: 'Usuarios' },
  { href: '/admin/crecimiento',  icon: '📈', label: 'Crecimiento' },
  { href: '/admin/golf',         icon: '⛳', label: 'Golf' },
  { href: '/admin/taiger',       icon: '🐯', label: 'tAIger' },
  { href: '/admin/monetizacion', icon: '💰', label: 'Monetización' },
  { href: '/admin/geografia',    icon: '🌍', label: 'Geografía' },
  { href: '/admin/sistema',      icon: '🔧', label: 'Sistema' },
  { href: '/admin/configuracion', icon: '⚙️', label: 'Config' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authorized, setAuthorized] = useState(false)
  const [now, setNow] = useState('')

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

  return (
    <div style={{ minHeight: '100vh', background: '#050b14' }}>
      {/* ── Header ── */}
      <header style={{
        background: '#070d18', borderBottom: '1px solid #132540',
        padding: '12px 16px', position: 'sticky', top: 0, zIndex: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link href="/dashboard" style={{ color: '#94a8c0', textDecoration: 'none', fontSize: '14px' }}>←</Link>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', color: '#edeae4', fontWeight: 700 }}>Golfers+</span>
          <span style={{ background: '#c4992a', color: '#070d18', fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.1em' }}>ADMIN</span>
        </div>
        <span style={{ color: '#94a8c0', fontSize: '11px' }}>{now}</span>
      </header>

      {/* ── Tab bar — scrollable horizontal ── */}
      <div style={{
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'flex', gap: '4px', padding: '8px 12px',
        borderBottom: '1px solid #132540', background: '#070d18',
        position: 'sticky', top: '49px', zIndex: 39,
      }}>
        {NAV_ITEMS.map(item => (
          <Link key={item.href} href={item.href} style={{
            flexShrink: 0, height: '34px', padding: '0 12px',
            borderRadius: '17px', display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '12px', fontWeight: isActive(item.href) ? 600 : 400,
            background: isActive(item.href) ? '#c4992a' : 'rgba(255,255,255,0.04)',
            color: isActive(item.href) ? '#070d18' : '#94a8c0',
            textDecoration: 'none', whiteSpace: 'nowrap',
            border: isActive(item.href) ? 'none' : '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontSize: '13px' }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>

      {/* ── Content ── */}
      <main style={{ padding: '20px 16px', maxWidth: '1400px', margin: '0 auto' }}>
        {children}
      </main>
    </div>
  )
}
