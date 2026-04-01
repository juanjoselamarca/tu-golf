'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export function CoachAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login?redirect=/coach'); return }
      setAuthorized(true)
    }
    check()
  }, [router])

  if (!authorized) return (
    <div style={{ background: '#070d18', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a8c0' }}>
      Cargando...
    </div>
  )

  return (
    <div style={{ background: '#070d18', minHeight: '100vh' }}>
      <header style={{
        background: 'rgba(14,28,47,0.97)',
        borderBottom: '1px solid rgba(196,153,42,0.15)',
        padding: '14px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#c4992a', fontWeight: 700 }}>
          tAIger+
        </span>
        <Link href="/dashboard" style={{ color: '#94a8c0', fontSize: '13px', textDecoration: 'none' }}>
          ← Volver a Golfers+
        </Link>
      </header>
      {children}
    </div>
  )
}
