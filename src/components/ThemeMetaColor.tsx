'use client'

import { useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'

const META_THEME_COLOR = {
  light: '#fafaf7',
  dark: '#070d18',
} as const

export function ThemeMetaColor() {
  const { theme } = useTheme()

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', META_THEME_COLOR[theme])
    }
  }, [theme])

  return null
}
