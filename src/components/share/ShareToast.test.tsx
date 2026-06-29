import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ShareToast } from './ShareToast'

describe('ShareToast', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('no renderiza nada cuando show=false', () => {
    const { container } = render(<ShareToast show={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('muestra "Copiado" por defecto cuando show=true', () => {
    render(<ShareToast show onDismiss={() => {}} />)
    expect(screen.getByText('Copiado')).toBeTruthy()
  })

  it('respeta un mensaje custom', () => {
    render(<ShareToast show message="Link copiado" onDismiss={() => {}} />)
    expect(screen.getByText('Link copiado')).toBeTruthy()
  })

  it('es accesible: role=status aria-live=polite', () => {
    render(<ShareToast show onDismiss={() => {}} />)
    const node = screen.getByRole('status')
    expect(node.getAttribute('aria-live')).toBe('polite')
  })

  it('llama onDismiss tras durationMs', () => {
    const onDismiss = vi.fn()
    render(<ShareToast show durationMs={1800} onDismiss={onDismiss} />)
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1800) })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
