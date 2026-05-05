# Theme Binario Light-Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar el modo `auto` y la "identidad fija" por layout. Sistema binario: light por defecto en TODA la app, dark solo si el usuario lo elige. Respetar el toggle universalmente. Cierra el bug estructural detectado el 2026-05-04 donde el body/footer/status bar no respetan los `<div data-theme>` internos.

**Architecture:** ThemeContext expone `{ theme: 'light' | 'dark', setTheme }`. Único punto de control: atributo `data-theme` en `<html>` setado por anti-FOUC (read localStorage, default light) y mantenido por ThemeContext. Layouts de identidad fija eliminados — todos respetan el toggle. Tokens CSS duales sobreviven sin cambios. `meta theme-color` reactivo via componente cliente. Hardcodes legacy en scorecard eliminados.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind, Vitest + React Testing Library.

---

## Pre-requisitos (verificación ambiente)

- [ ] **Confirmar branch + estado limpio**

```bash
git status
git branch --show-current
```

Expected: branch `main`, working tree clean (o solo cambios de docs untracked).

- [ ] **Crear branch dedicada**

```bash
git switch -c feat/theme-binario-light-default
```

- [ ] **Sanity check tests baseline**

```bash
npm run test -- --run src/contexts/__tests__/ThemeContext.test.tsx
```

Expected: 10/10 PASS (estado actual antes del cambio).

---

## Task 1: Reescribir tests del ThemeContext (TDD red)

**Files:**
- Modify: `src/contexts/__tests__/ThemeContext.test.tsx`

**Contexto:** Los 10 tests actuales asumen API tri-state (`mode`, `resolved`, `auto`, `toggleTheme` legacy). Los reemplazamos por tests del nuevo API binario antes de tocar implementación.

- [ ] **Step 1: Reemplazar todo el archivo de tests con la nueva suite**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
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
```

- [ ] **Step 2: Verificar que los tests fallan (TDD red)**

```bash
npm run test -- --run src/contexts/__tests__/ThemeContext.test.tsx
```

Expected: FAIL — tests usan `theme` y `setTheme` pero el contexto actual expone `mode`/`resolved`/`setMode`.

- [ ] **Step 3: NO commitear todavía** — el contexto no compila tests aún. Vamos al Task 2.

---

## Task 2: Reescribir ThemeContext (TDD green)

**Files:**
- Modify: `src/contexts/ThemeContext.tsx`

- [ ] **Step 1: Reemplazar todo el archivo con la nueva implementación**

```typescript
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
```

**Decisiones clave:**
- Sin estado `mode` separado — solo `theme: 'light' | 'dark'`.
- Legacy aliases (`mode`, `resolved`, `toggleTheme`) eliminados. Solo Navbar consume el contexto, así que el blast radius está acotado.
- Flag `hydrated` evita la race condition que escribía `'auto'` a storage en el primer render. El segundo effect solo escribe storage post-hidratación.
- Migración de `'auto'` → `'light'` se hace silenciosamente y se persiste para que la próxima visita ya tenga el valor canónico.

- [ ] **Step 2: Verificar tests pasan (TDD green)**

```bash
npm run test -- --run src/contexts/__tests__/ThemeContext.test.tsx
```

Expected: 7/7 PASS.

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: errores en consumidores que usan API vieja. Próximo task los arregla.

- [ ] **Step 4: NO commitear todavía** — el Navbar consume API vieja, va a romper el build.

---

## Task 3: Adaptar Navbar al toggle binario sol/luna

**Files:**
- Modify: `src/components/Navbar.tsx:30` (uso de useTheme)
- Modify: `src/components/Navbar.tsx:354-398` (segmented control de 3 pastillas)

- [ ] **Step 1: Cambiar la línea de useTheme**

Cambiar `src/components/Navbar.tsx:30` de:

```typescript
const { mode, resolved, setMode } = useTheme()
```

A:

```typescript
const { theme, setTheme } = useTheme()
```

- [ ] **Step 2: Buscar y reemplazar usos de `resolved` y `mode` en el archivo**

Verificar con:

```bash
grep -n "resolved\|setMode\|mode ===" src/components/Navbar.tsx
```

Expected: matches en `isDark = resolved === 'dark'` (línea ~31), `mode === option` (línea ~372), `setMode(option)` (línea ~377).

Reemplazar:
- `resolved === 'dark'` → `theme === 'dark'`
- `mode === option` → `theme === option`
- `setMode(option)` → `setTheme(option)`

- [ ] **Step 3: Reemplazar el segmented control de 3 pastillas por toggle binario sol/luna**

Reemplazar el bloque entero (líneas 354-398) por:

```tsx
{/* Theme toggle — binario sol/luna */}
<div style={{ padding: '4px 8px', marginTop: '8px' }}>
  <hr style={{ border: 'none', borderTop: `1px solid ${t.sidebarBorder}`, margin: '0 0 12px' }} />
  <div style={{ padding: '0 4px 8px', fontSize: '11px', color: t.menuMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
    Tema
  </div>
  <div
    role="group"
    aria-label="Tema"
    style={{
      display: 'flex',
      gap: '4px',
      padding: '4px',
      background: t.itemActiveBg,
      borderRadius: '10px',
    }}
  >
    {(['light', 'dark'] as const).map(option => {
      const active = theme === option
      const label = option === 'light' ? 'Claro' : 'Oscuro'
      const icon = option === 'light' ? '☀' : '☾'
      return (
        <button
          key={option}
          onClick={() => setTheme(option)}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '10px 12px',
            fontSize: '14px',
            fontWeight: 500,
            fontFamily: 'var(--font-dm-sans)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            background: active ? '#C4992A' : 'transparent',
            color: active ? '#070D18' : t.menuMuted,
            transition: 'background 150ms ease, color 150ms ease',
            minHeight: '44px',
          }}
          aria-pressed={active}
        >
          <span aria-hidden="true" style={{ fontSize: '16px' }}>{icon}</span>
          {label}
        </button>
      )
    })}
  </div>
</div>
```

**Decisión:** sol/luna como caracteres unicode (☀ ☾) para no agregar SVG nuevo. Si el feedback visual es pobre, en una iteración posterior se reemplazan por icons del set Foundation. `min-height: 44px` cumple HIG de Apple para touch targets.

- [ ] **Step 4: Verificar TypeScript y tests**

```bash
npx tsc --noEmit && npm run test -- --run src/contexts src/components/Navbar
```

Expected: 0 errores TS. Tests pasan.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/ThemeContext.tsx src/contexts/__tests__/ThemeContext.test.tsx src/components/Navbar.tsx
git commit -m "$(cat <<'EOF'
refactor(theme): API binaria light/dark + toggle sol/luna

- Eliminado modo 'auto' del ThemeContext. API ahora { theme, setTheme }.
- Migración silenciosa: stored 'auto' → 'light' al mount.
- Fix race condition: flag hydrated evita pisar storage en first render.
- Eliminados aliases legacy (mode, resolved, toggleTheme) sin consumidores.
- Navbar: segmented control de 3 pastillas → toggle binario sol/luna.
- Tests reescritos para API binaria (7 tests).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Simplificar anti-FOUC script + agregar suppressHydrationWarning

**Files:**
- Modify: `src/app/layout.tsx:73-79` (html element + script)

**Contexto:** El script anti-FOUC actual lee storage Y usa matchMedia. Con el nuevo modelo binario, solo necesita leer storage y default light. Además, el script muta `<html>` antes de hidratación → React puede emitir warning sin `suppressHydrationWarning`.

- [ ] **Step 1: Cambiar el atributo y el script en layout.tsx**

Reemplazar el bloque actual:

```tsx
<html lang="es" className={`${playfair.variable} ${dmSans.variable} ${dmMono.variable} ${cormorant.variable}`}>
  <head>
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var s=localStorage.getItem('golfers-theme');var r;if(s==='light'||s==='dark'){r=s;}else{r=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',r);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
      }}
    />
```

Por:

```tsx
<html
  lang="es"
  className={`${playfair.variable} ${dmSans.variable} ${dmMono.variable} ${cormorant.variable}`}
  suppressHydrationWarning
>
  <head>
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var s=localStorage.getItem('golfers-theme');var t=(s==='dark')?'dark':'light';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
      }}
    />
```

**Decisiones:**
- Default light. Si storage tiene `'dark'` exacto, dark; cualquier otro valor (incluyendo `'auto'` legacy) cae a light.
- `suppressHydrationWarning` en `<html>` porque el script muta el atributo antes de la hidratación. Solo afecta a este nodo.
- Sin `matchMedia` — el sistema operativo deja de influir en el theme. Coherente con la decisión de producto.

- [ ] **Step 2: Verificar build local**

```bash
npm run build
```

Expected: build exitoso sin warnings de hidratación.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "$(cat <<'EOF'
refactor(theme): script anti-FOUC binario + suppressHydrationWarning

- Script inline simplificado: solo lee storage, default light.
- Eliminado matchMedia (prefers-color-scheme ya no influye).
- suppressHydrationWarning en <html> porque el script muta data-theme
  antes de hidratación.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Eliminar layouts de identidad fija

**Files:**
- Delete: `src/app/dashboard/layout.tsx`
- Delete: `src/app/login/layout.tsx`
- Delete: `src/app/register/layout.tsx`
- Delete: `src/app/recuperar/layout.tsx`

**Contexto:** Decisión de producto cerrada el 2026-05-04: TODA la app respeta el toggle del usuario. No hay rutas con identidad fija. Los layouts existentes solo envolvían children con `<div data-theme>` — ya no aplican.

**Cuidado:** Estos layouts también traen `metadata` (title, description, openGraph). Hay que preservar la metadata moviéndola a la `page.tsx` correspondiente (Next 14 acepta `metadata` también en pages). Verificar primero qué tiene cada uno.

- [ ] **Step 1: Inspeccionar metadata actual de cada layout**

```bash
cat src/app/dashboard/layout.tsx
cat src/app/login/layout.tsx
cat src/app/register/layout.tsx
cat src/app/recuperar/layout.tsx
```

- [ ] **Step 2: Mover metadata a las pages respectivas**

Para cada uno de los 4 layouts, abrir la `page.tsx` correspondiente y agregar al inicio (después de los imports):

**Para `src/app/dashboard/page.tsx`:**

```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Inicio — Golfers+',
}
```

**Para `src/app/login/page.tsx`:**

```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Iniciar sesion — Golfers+',
  description: 'Inicia sesion en Golfers+ para acceder a tu scoring, estadisticas y coach IA de golf.',
  openGraph: {
    title: 'Iniciar sesion — Golfers+',
    description: 'Accede a tu cuenta de Golfers+.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}
```

**Para `src/app/register/page.tsx`:**

```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Crear cuenta — Golfers+',
  description: 'Registrate gratis en Golfers+ y accede a scoring en vivo, leaderboard, estadisticas y coach IA de golf.',
  openGraph: {
    title: 'Crear cuenta — Golfers+',
    description: 'Registrate gratis en Golfers+. Scoring en vivo y coach IA.',
    siteName: 'Golfers+',
    locale: 'es_CL',
    type: 'website',
  },
}
```

**Para `src/app/recuperar/page.tsx`:**

```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Recuperar contraseña — Golfers+',
  description: 'Recupera el acceso a tu cuenta de Golfers+. Te enviaremos un enlace para crear una nueva contraseña.',
}
```

**Importante:** si la `page.tsx` ya es client component (`'use client'`), `metadata` no funciona. En ese caso:
- Mantener un `layout.tsx` con SOLO la metadata (sin envoltorio div) — formato:

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = { /* ...idem arriba... */ }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

Verificar cada page con `head -1 <archivo>` para detectar `'use client'`.

- [ ] **Step 3: Eliminar (o vaciar) los 4 layouts**

```bash
# Detectar cuáles necesitan permanecer (client pages):
for f in dashboard login register recuperar; do
  echo "=== $f ==="
  head -1 "src/app/$f/page.tsx"
done
```

- Si la page NO es client → borrar el `layout.tsx` y dejar la metadata en page.
- Si la page ES client → vaciar el `layout.tsx` (dejar solo metadata + passthrough).

- [ ] **Step 4: Verificar TS + build**

```bash
npx tsc --noEmit && npm run build
```

Expected: 0 errores. Las 4 rutas siguen renderizando (solo cambia que ya no fuerzan theme).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard src/app/login src/app/register src/app/recuperar
git commit -m "$(cat <<'EOF'
refactor(theme): eliminar identidad fija de dashboard y auth

Decisión de producto 2026-05-04: TODA la app respeta el toggle del
usuario. Sin rutas con tema forzado.

- Removidos los 4 <div data-theme> envoltorios de layout.
- Metadata preservada (movida a page.tsx o layout vaciado a passthrough
  según si la page es client component).

Closes el bug estructural donde body/footer/status bar no respetaban
los <div data-theme> internos — ahora todos los elementos comparten
data-theme via <html>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Hacer `meta theme-color` reactivo

**Files:**
- Create: `src/components/ThemeMetaColor.tsx`
- Modify: `src/app/layout.tsx:83` (eliminar meta hardcoded)
- Modify: `src/app/layout.tsx` (montar `<ThemeMetaColor />` dentro del ThemeProvider)

**Contexto:** Hoy `<meta name="theme-color" content="#070d18" />` está fijo navy. En light mode, la status bar de iOS/Android queda navy mientras la app es cream. Hay que actualizarlo dinámicamente.

- [ ] **Step 1: Crear el componente ThemeMetaColor**

Archivo nuevo `src/components/ThemeMetaColor.tsx`:

```tsx
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
```

- [ ] **Step 2: Importar y montar en layout.tsx**

En `src/app/layout.tsx`, agregar al lado de los otros imports de componentes (debajo del FedegolfSync):

```typescript
import { ThemeMetaColor } from '@/components/ThemeMetaColor'
```

Y dentro del JSX, después de `<ThemeProvider>` y antes de `<PostHogProvider>`:

```tsx
<ThemeProvider>
<ThemeMetaColor />
<PostHogProvider>
```

- [ ] **Step 3: Mantener el meta inicial en `<head>` con el color light por default**

En el mismo archivo `layout.tsx`, cambiar la línea:

```tsx
<meta name="theme-color" content="#070d18" />
```

Por:

```tsx
<meta name="theme-color" content="#fafaf7" />
```

Justificación: light es el default sin JS, así que el primer paint del navegador antes de la hidratación debe matchear. Una vez que `ThemeMetaColor` monte, sincroniza con el theme real.

- [ ] **Step 4: Verificar build + tests**

```bash
npx tsc --noEmit && npm run test && npm run build
```

Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add src/components/ThemeMetaColor.tsx src/app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(theme): meta theme-color reactivo según light/dark

- Default en <head>: #fafaf7 (light) — coherente con primer paint.
- Componente cliente <ThemeMetaColor /> sincroniza al cambiar theme.
- Status bar de iOS/Android ahora respeta el tema elegido.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Eliminar hardcode `body[data-page="scorecard"]`

**Files:**
- Modify: `src/app/globals.css:457-460` (eliminar regla)
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx:139-140` (eliminar setAttribute)

**Contexto:** Esta es la última pieza del sistema viejo donde una pantalla forzaba dark via hardcode `#070D18` ignorando los tokens. En el nuevo modelo, scorecard respeta el toggle como cualquier otra pantalla.

- [ ] **Step 1: Eliminar la regla CSS**

En `src/app/globals.css`, borrar las líneas:

```css
/* ── PR1: Scorecard dark context ── */
body[data-page="scorecard"] {
  background: #070D18;
  color: #EDE9E4;
}
```

- [ ] **Step 2: Eliminar el setAttribute en page.tsx**

En `src/app/ronda-libre/[codigo]/score/page.tsx`, borrar las líneas alrededor de 139-140:

```typescript
document.body.setAttribute('data-page', 'scorecard')
return () => document.body.removeAttribute('data-page')
```

Verificar el contexto — probablemente es un `useEffect`. Si el effect queda vacío después de eliminar estas líneas, eliminar el effect entero.

```bash
grep -n -B 2 -A 4 "data-page.*scorecard" src/app/ronda-libre/[codigo]/score/page.tsx
```

- [ ] **Step 3: Verificar que no queden otras referencias**

```bash
grep -rn "data-page" src 2>nul
```

Expected: sin matches (o solo en el archivo globals.css que no debería tener nada).

- [ ] **Step 4: Verificar TS + tests**

```bash
npx tsc --noEmit && npm run test
```

Expected: todo verde. Si hay tests que verifican `data-page`, eliminarlos.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/ronda-libre/[codigo]/score/page.tsx
git commit -m "$(cat <<'EOF'
refactor(theme): eliminar hardcode body[data-page=scorecard]

Última pieza del sistema viejo donde scorecard forzaba dark via
hex hardcoded ignorando tokens. Ahora respeta el toggle como el
resto de la app.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Auditoría visual + WCAG en pantallas críticas

**Files:**
- N/A (auditoría sobre la app corriendo)

**Contexto:** Verificar legibilidad pantalla por pantalla, en ambos modos. Cualquier hardcode hex que rompa contraste se arregla en este task.

- [ ] **Step 1: Levantar dev server**

```bash
npm run dev
```

Expected: corriendo en http://localhost:3000

- [ ] **Step 2: Recorrer las pantallas críticas en LIGHT mode**

Para cada URL, abrir, capturar screenshot, verificar a ojo + DevTools que no hay zonas con texto ilegible. Si encontrás un hardcode hex, anotar el archivo:línea.

Pantallas:
1. `/` (home)
2. `/login`
3. `/register`
4. `/recuperar`
5. `/dashboard`
6. `/perfil`
7. `/perfil/historial`
8. `/perfil/stats`
9. `/coach`
10. `/leaderboard`
11. `/ranking`
12. `/en-vivo`
13. `/ronda-libre/<codigo>/score` (scorecard — usar un código demo)
14. `/organizador`
15. `/torneo/<slug>` (público)

- [ ] **Step 3: Para cada hardcode hex detectado, reemplazar por token**

Patrón:
- `background: '#070d18'` o `'#08120f'` → `background: 'var(--bg)'`
- `background: '#0e1c2f'` → `background: 'var(--bg-surface)'`
- `color: '#edeae4'` o `'#f3efe6'` → `color: 'var(--text)'`
- `color: '#94a8c0'` → `color: 'var(--text-2)'`
- Bordes oscuros `rgba(196,153,42,0.12)` → `var(--border)`
- Sombras `rgba(0,0,0,0.3)` → `var(--shadow-sm/md/lg)`

Ejecutar la búsqueda inicial:

```bash
grep -rn "#070[Dd]18\|#08120f\|#0d1b17\|#edeae4\|#f3efe6" src/app src/components 2>nul
```

**Decisión por archivo:** si el archivo es un `error.tsx` (pantalla de error fatal) y el contraste se ve OK en ambos modos, dejar el hardcode (es legacy controlado). Documentar excepción en commit message.

- [ ] **Step 4: Repetir el recorrido en DARK mode**

Mismo proceso, ahora con `theme === 'dark'` activado desde el toggle.

- [ ] **Step 5: WCAG AA contrast check con DevTools**

En Chrome DevTools, sobre los textos principales de cada pantalla:
- Inspeccionar elemento → tab "Styles" → cuadro de color del computed `color`
- DevTools muestra el ratio. Para body text mínimo **4.5:1**, para large text mínimo **3:1**.

Si un texto no pasa, ajustar el token o el hardcode hasta que pase. Las correcciones de tokens se hacen en `globals.css` (impacta toda la app — verificar regresión visual antes de commitear).

- [ ] **Step 6: Commit por cada lote de fixes**

Si el batch de fixes es chico (<10 archivos), un solo commit:

```bash
git add <archivos>
git commit -m "$(cat <<'EOF'
refactor(theme): hardcodes hex residuales → tokens en pantallas críticas

Auditoría visual + WCAG AA sobre 15 pantallas en light + dark.
Reemplazados N hardcodes que rompían el toggle. Dejados M en
error.tsx (legacy controlado, contraste OK en ambos modos).

Pantallas auditadas: home, auth (3), dashboard, perfil (3),
coach, leaderboard, ranking, en-vivo, scorecard, organizador, torneo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Si el batch es grande, dividir en commits por área (ej: perfil, scoring, leaderboard).

---

## Task 9: Verificación end-to-end + actualizar docs

**Files:**
- Modify: `docs/SPRINT_LOG.md` (entrada nueva al inicio)
- Modify: `docs/ARQUITECTURA.md` (sección Theming reescrita)

- [ ] **Step 1: Ejecutar el pipeline completo**

```bash
npx tsc --noEmit
npm run test
npm run build
```

Expected: 0 errores TS, todos los tests verdes, build exitoso.

- [ ] **Step 2: Health check**

```bash
node --env-file=.env.local scripts/health-check.mjs 2>nul || npm run health 2>nul || echo "Health check no disponible — saltando"
```

Si existe el endpoint `/api/admin/health-check`, verificarlo desde la app levantada en local.

- [ ] **Step 3: Actualizar SPRINT_LOG.md**

Agregar AL INICIO del archivo:

```markdown
## Sesión 04 May 2026 — Theme binario light-default (cierre del bug estructural)

### Problema
El sprint del toggle Light/Dark/Auto (28-30 abr) tenía un bug estructural: la
"identidad fija" via `<div data-theme>` en layouts (`/dashboard` dark, auth
light) no afectaba al body, footer ni status bar — solo al subtree del div.
Resultado visible: cards dark navy flotando sobre body cream con footer cream
en `/dashboard` cuando el sistema/storage estaba en light. Roto el
mobile overscroll. Roto el toggle de iOS theme-color hardcodeado.

### Decisión de producto (Juanjo, 04 May 2026)
- Eliminar el modo `auto`. Sistema binario: light por default, dark si el
  usuario lo elige.
- Eliminar la "identidad fija" — TODA la app respeta el toggle.
- Garantizar legibilidad WCAG AA en ambos modos.

### Solución
9 tasks ejecutados: ThemeContext binario + tests, Navbar toggle sol/luna,
anti-FOUC simplificado, eliminados 4 layouts de identidad fija, meta
theme-color reactivo, hardcode `body[data-page=scorecard]` eliminado,
auditoría WCAG en 15 pantallas críticas en ambos modos.

### Archivos tocados
- `src/contexts/ThemeContext.tsx` + tests
- `src/components/Navbar.tsx` (toggle)
- `src/components/ThemeMetaColor.tsx` (nuevo)
- `src/app/layout.tsx` (anti-FOUC + meta)
- `src/app/{dashboard,login,register,recuperar}/layout.tsx` (eliminados o vaciados)
- `src/app/globals.css` (hardcode scorecard)
- `src/app/ronda-libre/[codigo]/score/page.tsx`
- N archivos con hardcodes hex residuales → tokens
- `docs/ARQUITECTURA.md` (sección Theming reescrita)
- `docs/SPRINT_LOG.md` (esta entrada)

### Verificación
- TS 0 errores
- Tests verdes (suite ThemeContext: 7/7 nuevos)
- Build local OK
- Auditoría visual 15 pantallas × 2 modos
- WCAG AA verificado con DevTools

### Migración
Usuarios con `'auto'` en localStorage → migrados silenciosamente a `'light'`
en el primer mount del ThemeProvider.

---
```

- [ ] **Step 4: Reescribir sección Theming de ARQUITECTURA.md**

Buscar la sección actual:

```bash
grep -n "## Theming\|### Anti-FOUC\|### Tokens" docs/ARQUITECTURA.md
```

Reemplazar la sección entera por:

```markdown
## Theming

### Modelo
Sistema binario light/dark. **Light es el default**. Dark es opt-in via toggle del
Navbar. Sin `auto`. Sin identidad fija por ruta — TODA la app respeta el toggle.

### Flujo
1. ThemeContext lee `localStorage['golfers-theme']` → `'light' | 'dark'`. Default `light`.
   Cualquier valor legacy (incluyendo `'auto'`) migra silenciosamente a `'light'`.
2. Resolved theme se escribe a `document.documentElement.setAttribute('data-theme', ...)`.
3. `<meta name="theme-color">` se actualiza dinámicamente vía `<ThemeMetaColor />`.

### Anti-FOUC
Script inline en `<head>` lee storage y setea `data-theme` en `<html>` antes del
primer paint. `suppressHydrationWarning` en `<html>` para tolerar la mutación
pre-hidratación.

### Tokens
- `:root` — brand colors, fonts, score colors, legacy palette aliases (mismo en
  ambos modos) + paleta light como **fallback** para JS-disabled.
- `[data-theme="light"]` — paleta light premium (off-white `#fafaf7`, carbón
  `#1a1d24`, sombras editoriales).
- `[data-theme="dark"]` — paleta dark (navy `#070d18`, ivory `#edeae4`, gold
  accent en bordes).

### Tailwind dark mode
`darkMode: ['selector', '[data-theme="dark"]']` en `tailwind.config.ts`.
Las clases `dark:` activan cuando `[data-theme="dark"]` está en el árbol —
coherente con los tokens, NO por preferencia del OS.

### Toggle UI
Toggle binario sol/luna en el dropdown del Navbar avatar. Estado activo: fondo
`--brand`, texto `--brand-dark`. Persiste en `localStorage`.

### Convenciones
- Para definir tema en componentes nuevos: usar tokens (`var(--bg)`, `var(--text)`).
- NUNCA hardcodear hex de paleta neutra (cream, navy, ivory). Sí OK hardcodear
  brand colors (gold `#c4992a`) y score colors (Garmin verified) ya que son
  iguales en ambos modos.
- Para CTAs gold (`background: '#c4992a'`), texto siempre `var(--brand-dark)`.

### Out of scope (sprints futuros)
- Sincronización theme preference con BD del usuario (multi-device).
- Animar transiciones entre modos.
- Modo "tournament" alto contraste para uso bajo sol.

### Histórico
- 28-30 abr: tri-state Auto/Light/Dark con identidad fija. Bug estructural detectado.
- 04 may: corrección — sistema binario light-default sin identidad fija.

Spec/plan:
- `docs/superpowers/plans/2026-05-04-theme-binario-light-default.md`
```

- [ ] **Step 5: Commit final + push**

```bash
git add docs/SPRINT_LOG.md docs/ARQUITECTURA.md
git commit -m "$(cat <<'EOF'
docs(theme): SPRINT_LOG + ARQUITECTURA del sprint binario light-default

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push origin feat/theme-binario-light-default
```

- [ ] **Step 6: Reportar a Juanjo**

Resumen final:
- Cantidad de commits.
- Pantallas auditadas y resultado.
- Migración: ningún usuario rompe — los que tenían `auto` quedan en `light`.
- URL de la branch para preview en Vercel (auto-genera deploy preview).

---

## Verificación final del plan

**Spec coverage:**
- ✅ Eliminar modo auto → Task 2.
- ✅ Default light → Task 2 (DEFAULT_THEME constant).
- ✅ Toggle universal sin identidad fija → Task 5.
- ✅ Migración users con auto → Task 2 step 1.
- ✅ Status bar reactiva → Task 6.
- ✅ Hardcode scorecard → Task 7.
- ✅ Auditoría WCAG por pantalla × 2 modos → Task 8.
- ✅ Toggle binario sol/luna → Task 3.

**Out of scope explícito:** animaciones de transición, multi-device sync, modo torneo sol fuerte. Documentados en ARQUITECTURA.md sección "Out of scope".

**Riesgos detectados:**
- Si una page client component (ej: `register/page.tsx` con `'use client'` arriba) tenía metadata en su layout, hay que mantener un layout passthrough — Task 5 step 2 lo aborda.
- La auditoría WCAG (Task 8) puede revelar más hardcodes de los esperados. Si la lista crece >20 archivos, dividir Task 8 en sub-commits por área.
- `suppressHydrationWarning` en `<html>` (Task 4) es necesario pero hay que verificar que no oculte warnings legítimos en otras partes del árbol (no debería — es scope-limited al nodo).
