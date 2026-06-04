'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TaigerIcon } from '@/components/icons/TaigerIcon'
import { FocusHero, type FocoData } from './components/FocusHero'
import { AvanceChart, type PuntoSerie } from './components/AvanceChart'
import { MetaResumen } from './components/MetaResumen'

interface DashboardData {
  focus: FocoData
  target: { currentHandicap: number | null; targetHandicap: number | null; targetDeadline: string | null }
  serie: PuntoSerie[]
  activePlan: { pattern_id?: string } | null
  outcomes: Array<{ played_at: string; target_reached: boolean; compliance: string }>
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; msg: string }
  | { phase: 'ready'; data: DashboardData }

const reveal = (i: number) => ({
  animation: 'progresoReveal 0.5s cubic-bezier(0.16,1,0.3,1) both',
  animationDelay: `${i * 80}ms`,
})

export default function ProgresoPage() {
  const [state, setState] = useState<State>({ phase: 'loading' })

  useEffect(() => {
    let alive = true
    fetch('/api/coach/progress')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? 'No pude cargar tu progreso')
        return r.json()
      })
      .then((data: DashboardData) => alive && setState({ phase: 'ready', data }))
      .catch((e) => alive && setState({ phase: 'error', msg: e instanceof Error ? e.message : 'Error' }))
    return () => {
      alive = false
    }
  }, [])

  if (state.phase === 'loading') {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--coach-brass)', animation: 'tpulse 1.5s ease infinite' }}>
          <TaigerIcon size={44} />
          <div style={{ color: 'var(--text-2)', fontSize: '13px', fontWeight: 600, marginTop: '10px' }}>Leyendo tu progreso…</div>
        </div>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '32px 16px' }}>
        <div style={{ background: 'var(--coach-recovery-low-soft)', border: '1px solid var(--coach-recovery-low)', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
          <div style={{ color: 'var(--coach-recovery-low)', fontWeight: 600, marginBottom: '6px' }}>No pude cargar tu progreso</div>
          <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>{state.msg}</div>
        </div>
      </div>
    )
  }

  const { data } = state

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 110px' }}>
      <style>{`@keyframes progresoReveal{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>

      <header style={{ ...reveal(0), marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--coach-brass)', fontWeight: 700, marginBottom: '4px' }}>
          tAIger+ · tu progreso
        </div>
        <h1 style={{ fontFamily: 'var(--font-playfair)', fontSize: '32px', lineHeight: 1.1, color: 'var(--text)', margin: 0, fontWeight: 600 }}>
          La bajada hacia tu meta
        </h1>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={reveal(1)}>
          <MetaResumen
            currentHandicap={data.target.currentHandicap}
            targetHandicap={data.target.targetHandicap}
            targetDeadline={data.target.targetDeadline}
          />
        </div>

        <div style={reveal(2)}>
          <AvanceChart serie={data.serie} currentHandicap={data.target.currentHandicap} targetHandicap={data.target.targetHandicap} />
        </div>

        <div style={reveal(3)}>
          <FocusHero foco={data.focus} />
        </div>

        <div style={{ ...reveal(4), textAlign: 'center', marginTop: '4px' }}>
          <Link
            href="/coach"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--brand)',
              color: 'var(--brand-dark)',
              fontWeight: 700,
              fontSize: '14px',
              padding: '12px 24px',
              borderRadius: '10px',
              textDecoration: 'none',
            }}
          >
            <TaigerIcon size={18} /> Trabajar esto con el coach
          </Link>
        </div>
      </div>
    </div>
  )
}
