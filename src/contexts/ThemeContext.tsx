'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const STORAGE_KEY = 'golfers-theme'
const DEFAULT_THEME: Theme = 'light'

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
    // Migración silenciosa: 'auto' o cualquier otro valor legacy → light
  } catch {}
  return DEFAULT_THEME
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const initial = readStoredTheme()
    setThemeState(initial)
    document.documentElement.setAttribute('data-theme', initial)
    // Migrar valor legacy si lo había:
    try { localStorage.setItem(STORAGE_KEY, initial) } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(STORAGE_KEY, theme) } catch {}
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme, hydrated])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
