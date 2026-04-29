import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../ThemeContext'

const STORAGE_KEY = 'golfers-theme'

function TestConsumer() {
  const { mode, resolved, setMode } = useTheme()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="resolved">{resolved}</span>
      <button onClick={() => setMode('light')} data-testid="set-light">light</button>
      <button onClick={() => setMode('dark')} data-testid="set-dark">dark</button>
      <button onClick={() => setMode('auto')} data-testid="set-auto">auto</button>
    </div>
  )
}

describe('ThemeContext', () => {
  let mediaQueryListeners: Array<(e: MediaQueryListEvent) => void> = []
  let prefersDarkMatches = false

  beforeEach(() => {
    localStorage.clear()
    mediaQueryListeners = []
    prefersDarkMatches = false
    document.documentElement.removeAttribute('data-theme')

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('dark') ? prefersDarkMatches : !prefersDarkMatches,
      media: query,
      addEventListener: (_e: string, cb: any) => mediaQueryListeners.push(cb),
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
      onchange: null,
    }))
  })

  it('default mode is auto when localStorage empty', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('mode').textContent).toBe('auto')
  })

  it('resolved = light when mode auto and prefers-color-scheme is light', () => {
    prefersDarkMatches = false
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('resolved').textContent).toBe('light')
  })

  it('resolved = dark when mode auto and prefers-color-scheme is dark', () => {
    prefersDarkMatches = true
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
  })

  it('setMode persists in localStorage', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    act(() => { screen.getByTestId('set-dark').click() })
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('setMode("light") sets resolved to light regardless of system', () => {
    prefersDarkMatches = true
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    act(() => { screen.getByTestId('set-light').click() })
    expect(screen.getByTestId('resolved').textContent).toBe('light')
  })

  it('setMode updates document.documentElement[data-theme]', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    act(() => { screen.getByTestId('set-dark').click() })
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('reads existing localStorage value on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('mode').textContent).toBe('dark')
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
  })

  it('matchMedia change updates resolved when mode is auto', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('resolved').textContent).toBe('light')
    act(() => {
      prefersDarkMatches = true
      mediaQueryListeners.forEach(cb => cb({ matches: true } as MediaQueryListEvent))
    })
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
  })

  it('legacy theme alias returns resolved', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    function LegacyConsumer() {
      const { theme } = useTheme()
      return <span data-testid="legacy-theme">{theme}</span>
    }
    render(<ThemeProvider><LegacyConsumer /></ThemeProvider>)
    expect(screen.getByTestId('legacy-theme').textContent).toBe('dark')
  })

  it('legacy toggleTheme flips between light and dark', () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    function LegacyConsumer() {
      const { theme, toggleTheme } = useTheme()
      return (
        <>
          <span data-testid="legacy-theme">{theme}</span>
          <button onClick={toggleTheme} data-testid="legacy-toggle">toggle</button>
        </>
      )
    }
    render(<ThemeProvider><LegacyConsumer /></ThemeProvider>)
    expect(screen.getByTestId('legacy-theme').textContent).toBe('light')
    act(() => { screen.getByTestId('legacy-toggle').click() })
    expect(screen.getByTestId('legacy-theme').textContent).toBe('dark')
  })
})
