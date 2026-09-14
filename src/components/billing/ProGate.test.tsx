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
})
