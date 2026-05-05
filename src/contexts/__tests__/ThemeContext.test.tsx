import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../ThemeContext'

const STORAGE_KEY = 'golfers-theme'

function TestConsumer() {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setTheme('light')} data-testid="set-light">light</button>
      <button onClick={() => setTheme('dark')} data-testid="set-dark">dark</button>
    </div>
  )
}

describe('ThemeContext (binario light/dark)', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('default theme is light when localStorage empty', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('reads stored "dark" on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('dark')
  })

  it('reads stored "light" on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('migrates legacy "auto" value to light on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'auto')
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
  })

  it('falls back to default for unknown stored values', () => {
    localStorage.setItem(STORAGE_KEY, 'sepia')
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
  })

  it('setTheme persists in localStorage', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    act(() => { screen.getByTestId('set-dark').click() })
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('setTheme updates document.documentElement[data-theme]', () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    act(() => { screen.getByTestId('set-dark').click() })
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    act(() => { screen.getByTestId('set-light').click() })
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('does NOT overwrite valid stored value with default during mount', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    render(<ThemeProvider><TestConsumer /></ThemeProvider>)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })
})
