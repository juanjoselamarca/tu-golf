import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProGate } from './ProGate'

vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: vi.fn(),
}))
import { useEntitlement } from '@/hooks/useEntitlement'

describe('ProGate', () => {
  it('muestra children cuando allowed=true', () => {
    ;(useEntitlement as ReturnType<typeof vi.fn>).mockReturnValue({ allowed: true, loading: false, tier: 'pro' })
    render(
      <ProGate feature="coach-plan" fallback={<div>UPSELL</div>}>
        <div>CONTENIDO PRO</div>
      </ProGate>,
    )
    expect(screen.getByText('CONTENIDO PRO')).toBeTruthy()
    expect(screen.queryByText('UPSELL')).toBeNull()
  })

  it('muestra fallback cuando allowed=false', () => {
    ;(useEntitlement as ReturnType<typeof vi.fn>).mockReturnValue({ allowed: false, loading: false, tier: 'free' })
    render(
      <ProGate feature="coach-plan" fallback={<div>UPSELL</div>}>
        <div>CONTENIDO PRO</div>
      </ProGate>,
    )
    expect(screen.getByText('UPSELL')).toBeTruthy()
    expect(screen.queryByText('CONTENIDO PRO')).toBeNull()
  })

  it('no muestra nada mientras loading', () => {
    ;(useEntitlement as ReturnType<typeof vi.fn>).mockReturnValue({ allowed: false, loading: true, tier: null })
    const { container } = render(
      <ProGate feature="coach-plan" fallback={<div>UPSELL</div>}>
        <div>CONTENIDO PRO</div>
      </ProGate>,
    )
    expect(container.textContent).toBe('')
  })

  it('muestra loadingFallback mientras loading, si se pasa', () => {
    ;(useEntitlement as ReturnType<typeof vi.fn>).mockReturnValue({ allowed: false, loading: true, tier: null })
    render(
      <ProGate feature="coach-plan" fallback={<div>UPSELL</div>} loadingFallback={<div>CARGANDO</div>}>
        <div>CONTENIDO PRO</div>
      </ProGate>,
    )
    expect(screen.getByText('CARGANDO')).toBeTruthy()
    expect(screen.queryByText('UPSELL')).toBeNull()
    expect(screen.queryByText('CONTENIDO PRO')).toBeNull()
  })

  it('fallback como función recibe signedIn (para ofrecer "Entrar" sólo sin sesión)', () => {
    ;(useEntitlement as ReturnType<typeof vi.fn>).mockReturnValue({ allowed: false, loading: false, tier: 'free', signedIn: false })
    render(<ProGate feature="leaderboard-live" fallback={({ signedIn }) => <p>{signedIn ? 'con sesión' : 'sin sesión'}</p>}><p>pro</p></ProGate>)
    expect(screen.getByText('sin sesión')).toBeTruthy()
    expect(screen.queryByText('pro')).toBeNull()
  })
})

describe('ProGate — initialAllowed (el servidor ya autorizó)', () => {
  it('mientras revalida muestra el contenido, no la pantalla en blanco', () => {
    ;(useEntitlement as ReturnType<typeof vi.fn>).mockReturnValue({ allowed: false, loading: true, tier: null })
    render(<ProGate feature="leaderboard-live" initialAllowed fallback={<p>upsell</p>}><p>leaderboard</p></ProGate>)
    expect(screen.getByText('leaderboard')).toBeTruthy()
  })

  it('una revalidación negativa del cliente (p. ej. red caída → cae a free) no quita el contenido', () => {
    ;(useEntitlement as ReturnType<typeof vi.fn>).mockReturnValue({ allowed: false, loading: false, tier: 'free', signedIn: false })
    render(<ProGate feature="leaderboard-live" initialAllowed fallback={<p>upsell</p>}><p>leaderboard</p></ProGate>)
    expect(screen.getByText('leaderboard')).toBeTruthy()
    expect(screen.queryByText('upsell')).toBeNull()
  })
})
