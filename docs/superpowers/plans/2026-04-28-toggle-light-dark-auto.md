# Toggle Light/Dark/Auto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el toggle del Navbar en un control sistémico que cambia el tema de toda la app (Auto/Claro/Oscuro), con `/dashboard` dark fijo y `/login`, `/register`, `/recuperar` light fijo.

**Architecture:** Tokens duales en `globals.css` controlados por `[data-theme="light"|"dark"]` en `<html>`. Script anti-FOUC inline resuelve el tema antes del primer paint. ThemeContext extendido a tri-state. Tailwind `darkMode: ['selector', '[data-theme="dark"]']` para alinear clases utility con el sistema de tokens.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, React Context, Vitest (jsdom).

**Spec base:** `docs/superpowers/specs/2026-04-28-toggle-light-dark-auto-design.md`

---

## File Structure (mapeo previo a tareas)

### Archivos NUEVOS

| Path | Responsabilidad |
|------|-----------------|
| `src/contexts/__tests__/ThemeContext.test.tsx` | Tests unitarios del ThemeContext (resolved theme, persistence, matchMedia listener). |
| `src/app/dashboard/layout.tsx` | Wrapper con `<div data-theme="dark">` para forzar identidad dark en toda la rama dashboard. |

### Archivos MODIFICADOS

| Path | Cambio |
|------|--------|
| `tailwind.config.ts` | Agregar `darkMode: ['selector', '[data-theme="dark"]']`. |
| `src/app/globals.css` | Tokens duales `[data-theme="light"]` y `[data-theme="dark"]`. Body conditional gradient. Footer, h1/h2/h3 usan tokens. |
| `src/components/ui/Input.tsx` | Eliminar `dark:` Tailwind. Usar tokens via inline style. |
| `src/components/ui/ErrorScreen.tsx` | Eliminar `dark:`. Usar tokens. |
| `src/components/ui/ShareSheet.tsx` | Eliminar `dark:`. Usar tokens. |
| `src/components/ui/Stepper.tsx` | Eliminar `dark:`. Usar tokens. |
| `src/components/ui/Toggle.tsx` | Eliminar `dark:`. Usar tokens. |
| `src/contexts/ThemeContext.tsx` | API tri-state: `mode`, `resolved`, `setMode`. Mantiene aliases legacy `theme` y `toggleTheme` para no romper Navbar entre commits. |
| `src/components/Navbar.tsx` | Migrar a nueva API. Reemplazar item single-toggle por segmented control de 3 pastillas. |
| `src/app/layout.tsx` | Inyectar script anti-FOUC en `<head>`. Footer migrado a tokens (eliminar `rgba(255,255,255,0.72)` hardcoded). `theme-color` meta dinámico (queda hardcoded a dark por simplicidad). |
| `src/app/login/layout.tsx` | Wrap children en `<div data-theme="light">`. |
| `src/app/register/layout.tsx` | Wrap children en `<div data-theme="light">`. |
| `src/app/recuperar/layout.tsx` | Wrap children en `<div data-theme="light">`. |
| `src/app/perfil/page.tsx` | Hardcodes light → tokens. |
| `src/app/perfil/historial/page.tsx` | Hardcodes → tokens. |
| `src/app/perfil/historial/[id]/page.tsx` | Hardcodes → tokens. |
| `src/app/perfil/stats/page.tsx` | Hardcodes → tokens. |
| `src/app/coach/**/*.tsx` | Hardcodes → tokens. |
| `src/app/leaderboard/page.tsx`, `src/app/ranking/page.tsx`, `src/app/en-vivo/page.tsx`, `src/app/indices/page.tsx` | Hardcodes → tokens. |
| `src/app/organizador/**/*.tsx`, `src/app/ronda-libre/**/*.tsx` | Hardcodes → tokens. |
| `src/app/demo/**/*.tsx`, `src/app/importar/page.tsx`, `src/app/reembolsos/page.tsx`, `src/app/privacidad/page.tsx`, `src/app/admin/**/*.tsx` | Hardcodes → tokens. |
| `docs/SPRINT_LOG.md` | Nueva entrada al inicio. |
| `docs/ARQUITECTURA.md` | Nueva sección "Theming". |

---

## Pre-flight Verification

- [ ] **Step 0.1: Verificar repositorio y branch**

```bash
git remote -v
git branch --show-current
git pull origin main
```

Expected: remote es `github.com/juanjoselamarca/tu-golf.git`, branch es `main`, pull limpio.

- [ ] **Step 0.2: Verificar tests baseline pasan**

```bash
npx tsc --noEmit
npm run test
```

Expected: 0 errores TS, todos los tests passing (5894+ tests).

- [ ] **Step 0.3: Verificar que `git status` no tiene WIP ajeno staged**

```bash
git status --short
git diff --cached --stat
```

Expected: nothing staged. Si hay WIP de Juanjo unstaged en `docs/ARQUITECTURA.md` o `src/app/en-vivo/page.tsx`, NO incluirlo en commits — son cambios paralelos suyos.

---

## Task 1: Tailwind darkMode selector + tokens duales en globals.css

**Files:**
- Modify: `tailwind.config.ts:3-7` (agregar `darkMode`)
- Modify: `src/app/globals.css:5-110` (refactor tokens y body)

- [ ] **Step 1.1: Configurar Tailwind darkMode**

Editar `tailwind.config.ts`. Agregar línea `darkMode` justo después del import:

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // ... resto sin cambios
```

- [ ] **Step 1.2: Refactor globals.css — tokens duales**

Reemplazar el bloque `:root` actual (líneas ~5-58) y el bloque `body` (líneas ~63-72) por:

```css
:root {
  /* ── Brand & fonts (mismo en ambos modos) ── */
  --font-playfair: 'Playfair Display', serif;
  --font-dm-sans:  'DM Sans', sans-serif;

  --brand:       #C4992A;
  --brand-hover: #A67D1E;
  --brand-dark:  #070D18;
  --brand-light: #FDF6E3;

  /* Score colors (paleta Garmin Golf verificada) */
  --eagle:  #3B82F6;
  --birdie: #EF4444;
  --par:    #6B7280;
  --bogey:  #C4992A;
  --double: #DC2626;

  /* Legacy palette aliases (compat con .glass-card, .leader-row, etc.) */
  --bg-deep: #08120f;
  --bg-deep-2: #0d1b17;
  --bg-card: #12231e;
  --bg-card-2: #173129;
  --gold: #c8a55a;
  --gold-soft: rgba(200, 165, 90, 0.18);
  --ivory: #f3efe6;
  --sage: #9fb4aa;
  --line: rgba(200, 165, 90, 0.18);

  /* Default tokens (dark) — fallback hasta que el script anti-FOUC setee data-theme */
  --bg:          #070d18;
  --bg-surface:  #0e1c2f;
  --bg-card-light: #0e1c2f;
  --text:        #edeae4;
  --text-2:      #94a8c0;
  --text-3:      #5a6a7a;
  --border:      rgba(196,153,42,0.12);
  --border-md:   rgba(196,153,42,0.2);
  --shadow-sm:   0 1px 3px rgba(0,0,0,0.3);
  --shadow-md:   0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg:   0 8px 24px rgba(0,0,0,0.5);
  --shadow-card: 0 2px 8px rgba(0,0,0,0.3);
  --input-bg:     rgba(255,255,255,0.04);
  --input-border: rgba(196,153,42,0.2);
  --input-focus:  #C4992A;
}

[data-theme="light"] {
  --bg:          #fafaf7;
  --bg-surface:  #ffffff;
  --bg-card-light: #ffffff;
  --text:        #1a1d24;
  --text-2:      #5a6573;
  --text-3:      #9099a8;
  --border:      rgba(26, 29, 36, 0.08);
  --border-md:   rgba(26, 29, 36, 0.12);
  --shadow-sm:   0 1px 2px rgba(20, 25, 35, 0.04);
  --shadow-md:   0 4px 16px rgba(20, 25, 35, 0.06);
  --shadow-lg:   0 12px 32px rgba(20, 25, 35, 0.08);
  --shadow-card: 0 1px 3px rgba(20, 25, 35, 0.04), 0 4px 12px rgba(20, 25, 35, 0.04);
  --input-bg:     #ffffff;
  --input-border: rgba(26, 29, 36, 0.12);
  --input-focus:  #C4992A;
}

[data-theme="dark"] {
  --bg:          #070d18;
  --bg-surface:  #0e1c2f;
  --bg-card-light: #0e1c2f;
  --text:        #edeae4;
  --text-2:      #94a8c0;
  --text-3:      #5a6a7a;
  --border:      rgba(196,153,42,0.12);
  --border-md:   rgba(196,153,42,0.2);
  --shadow-sm:   0 1px 3px rgba(0,0,0,0.3);
  --shadow-md:   0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg:   0 8px 24px rgba(0,0,0,0.5);
  --shadow-card: 0 2px 8px rgba(0,0,0,0.3);
  --input-bg:     rgba(255,255,255,0.04);
  --input-border: rgba(196,153,42,0.2);
  --input-focus:  #C4992A;
}
```

Reemplazar el bloque `body` por:

```css
@layer base {
  html {
    scroll-behavior: smooth;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-dm-sans);
    min-width: 320px;
  }

  [data-theme="dark"] body {
    background:
      radial-gradient(circle at top, rgba(200, 165, 90, 0.10), transparent 30%),
      radial-gradient(circle at bottom right, rgba(30, 70, 55, 0.35), transparent 28%),
      linear-gradient(180deg, #08120f 0%, #0d1b17 100%);
    color: #f3efe6;
  }

  [data-theme="light"] body {
    background:
      radial-gradient(circle at top, rgba(196, 153, 42, 0.04), transparent 40%),
      var(--bg);
    color: var(--text);
  }

  h1 { font-size: 22px; font-weight: 600; color: var(--text); letter-spacing: -0.3px; }
  h2 { font-size: 17px; font-weight: 600; color: var(--text); letter-spacing: -0.2px; }
  h3 { font-size: 14px; font-weight: 500; color: var(--text-2); }
}
```

- [ ] **Step 1.3: Verificar TypeScript y build**

```bash
npx tsc --noEmit
npm run build
```

Expected: 0 errores, build exitoso.

- [ ] **Step 1.4: Verificación visual rápida**

Levantar dev server y abrir 3 pantallas:
```bash
npm run dev
```

Visitar:
- http://localhost:3000/dashboard — debe seguir viéndose dark (el `:root` aún tiene tokens dark).
- http://localhost:3000/perfil — sigue viéndose como hoy (hardcodes light en TSX).
- http://localhost:3000/login — igual a hoy.

Expected: ningún cambio visual perceptible. La app se ve idéntica porque `<html>` aún no tiene `data-theme`.

- [ ] **Step 1.5: Commit**

```bash
git add tailwind.config.ts src/app/globals.css
git commit -m "$(cat <<'EOF'
refactor(theme): tokens duales light/dark + Tailwind darkMode selector

Foundation del toggle sistémico. Agrega bloques [data-theme="light"] y
[data-theme="dark"] con paletas completas, mantiene :root como fallback
con tokens dark hasta que el script anti-FOUC se active en commit
posterior. Body con conditional gradient.

Tailwind darkMode pasa a 'selector' targeting [data-theme="dark"] para
que las clases dark: existentes activen coherentemente con nuestros
tokens (no por prefers-color-scheme del OS). Las pantallas se siguen
viendo igual hasta que data-theme se establezca en <html>.

Spec: docs/superpowers/specs/2026-04-28-toggle-light-dark-auto-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migrar componentes shared (Input, ErrorScreen, ShareSheet, Stepper, Toggle) — eliminar `dark:` Tailwind

**Files:**
- Modify: `src/components/ui/Input.tsx` (8 usos)
- Modify: `src/components/ui/ErrorScreen.tsx` (4 usos)
- Modify: `src/components/ui/ShareSheet.tsx` (15 usos)
- Modify: `src/components/ui/Stepper.tsx` (5 usos)
- Modify: `src/components/ui/Toggle.tsx` (1 uso)

- [ ] **Step 2.1: Migrar Input.tsx**

Reemplazar el contenido completo de `src/components/ui/Input.tsx` por:

```tsx
'use client'

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  error?: boolean
  fullWidth?: boolean
}

/**
 * Input Golfers+ — contraste WCAG AA + uso en sol con guante (audit 2026-04-22 P19).
 *
 * - min-height 44px (touch target).
 * - border 2px en focus para visibilidad bajo sol.
 * - placeholder con contrast ratio >= 4.5:1.
 * - font-size 16px mínimo (evita zoom en iOS).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    leftIcon,
    rightIcon,
    error = false,
    fullWidth = true,
    className = '',
    style,
    ...rest
  },
  ref,
) {
  const width = fullWidth ? 'w-full' : ''

  return (
    <div
      className={
        'inline-flex items-center gap-2 h-12 px-3.5 rounded-xl border-2 ' +
        'transition-colors focus-within:ring-2 focus-within:ring-brand/30 ' +
        (error ? 'border-red-500 focus-within:border-red-600 ' : 'focus-within:border-brand ') +
        width + ' ' + className
      }
      style={{
        background: 'var(--input-bg)',
        borderColor: error ? undefined : 'var(--input-border)',
        ...style,
      }}
    >
      {leftIcon && (
        <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{leftIcon}</span>
      )}
      <input
        ref={ref}
        className="flex-1 bg-transparent outline-none text-base disabled:opacity-50"
        style={{
          color: 'var(--text)',
        }}
        {...rest}
      />
      {rightIcon && (
        <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{rightIcon}</span>
      )}
    </div>
  )
})
```

Notas:
- `placeholder:text-gray-600 dark:placeholder:text-white/55` no se reemplaza con inline style porque CSS `placeholder::` no se puede setear via React style. Si el contraste del placeholder se ve mal, agregar regla CSS global en `globals.css`: `input::placeholder { color: var(--text-3); }`. Validar visualmente en Step 2.6.

- [ ] **Step 2.2: Migrar ErrorScreen.tsx**

Editar las 4 líneas con `dark:`. Reemplazos:

```tsx
// Línea ~51 — h1:
<h1
  className="text-2xl sm:text-3xl font-bold mb-3"
  style={{ fontFamily: 'var(--font-playfair), serif', color: 'var(--text)' }}
>

// Línea ~57 — p description:
<p className="text-base mb-6 leading-relaxed" style={{ color: 'var(--text-2)' }}>

// Línea ~77 — p errorCode:
<p
  className="text-xs mt-6"
  style={{ fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-3)' }}
>

// Línea ~85 — p reportable:
<p className="text-xs mt-3" style={{ color: 'var(--text-3)' }}>
```

- [ ] **Step 2.3: Migrar ShareSheet.tsx**

Reemplazar las 15 líneas con `dark:`. Estrategia: convertir clases `bg-white dark:bg-[#0e1c2f]` a `style={{ background: 'var(--bg-surface)' }}`, `text-gray-900 dark:text-white` a `style={{ color: 'var(--text)' }}`, etc.

Para los hover states que usan `hover:bg-gray-100 dark:hover:bg-white/10`, usar clases CSS dedicadas o un wrapper que respete tokens. Aproximación pragmática: extraer en `globals.css` clases helper:

```css
.hover-surface { transition: background-color 150ms ease; }
.hover-surface:hover { background-color: rgba(26, 29, 36, 0.04); }
[data-theme="dark"] .hover-surface:hover { background-color: rgba(255, 255, 255, 0.06); }
```

Y reemplazar `hover:bg-gray-100 dark:hover:bg-white/10` por `hover-surface`.

Resto de tokens directos:
- `bg-emerald-50 dark:bg-emerald-900/20` → mantener en clases utility (verde de WhatsApp es brand-fixed, ok).
- `bg-gray-200 dark:bg-white/10` → `style={{ background: 'var(--border)' }}`.
- `text-gray-900 dark:text-white` → `style={{ color: 'var(--text)' }}`.
- `text-gray-500 dark:text-white/70` → `style={{ color: 'var(--text-2)' }}`.
- `text-gray-700 dark:text-white/80` → `style={{ color: 'var(--text)' }}`.

Ver el archivo, hacer reemplazos línea por línea.

- [ ] **Step 2.4: Migrar Stepper.tsx**

5 usos. Reemplazos:
- `bg-gray-200 dark:bg-white/10` → `style={{ background: 'var(--border)' }}`.
- `text-gray-500 dark:text-white/40` → `style={{ color: 'var(--text-3)' }}`.
- `text-gray-600 dark:text-white/60` → `style={{ color: 'var(--text-2)' }}`.
- `text-gray-400 dark:text-white/30` → `style={{ color: 'var(--text-3)' }}`.
- `bg-gray-300 dark:bg-white/10` → `style={{ background: 'var(--border-md)' }}`.

Si las clases están concatenadas en strings condicionales, factorizarlas a `style={{}}` en el render.

- [ ] **Step 2.5: Migrar Toggle.tsx**

1 uso: `bg-gray-300 dark:bg-white/15`. Reemplazar por:
```tsx
style={{ backgroundColor: checked ? undefined : 'var(--border-md)' }}
```
(Mantener `bg-brand` en el caso `checked`.)

- [ ] **Step 2.6: Verificar TypeScript, tests y visual**

```bash
npx tsc --noEmit
npm run test
npm run dev
```

Visitar pantallas que usan estos componentes:
- `/login` — usa Input, ErrorScreen.
- `/register` — usa Input, Stepper.
- `/coach/onboarding` — usa Stepper, Toggle.
- Cualquier pantalla con sheet de compartir → ShareSheet.

Verificar visualmente que nada se ve roto. Sigue siendo dark global porque `<html>` no tiene `data-theme` aún.

- [ ] **Step 2.7: Verificar ausencia de `dark:` residual**

```bash
grep -rn "dark:" src --include="*.tsx" --include="*.ts"
```

Expected: 0 resultados (o lista mínima documentada con justificación).

- [ ] **Step 2.8: Commit**

```bash
git add src/components/ui/Input.tsx src/components/ui/ErrorScreen.tsx src/components/ui/ShareSheet.tsx src/components/ui/Stepper.tsx src/components/ui/Toggle.tsx src/app/globals.css
git commit -m "$(cat <<'EOF'
refactor(ui): tokens en componentes shared, eliminar Tailwind dark:

Migra Input, ErrorScreen, ShareSheet, Stepper, Toggle de Tailwind dark:
classes a tokens CSS via inline style. Cero dark: residual en src/.

Antes: dos sistemas paralelos (tokens CSS + Tailwind dark: con prefers-
color-scheme). Después: una sola fuente de verdad — los tokens responden
a [data-theme="light"|"dark"] que el ThemeContext controla.

Agrega clase helper .hover-surface en globals.css para hover states que
no se pueden expresar inline (necesarios para ShareSheet items).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Tests del nuevo ThemeContext (TDD — escribir antes de implementar)

**Files:**
- Create: `src/contexts/__tests__/ThemeContext.test.tsx`

- [ ] **Step 3.1: Crear archivo de test con casos completos**

```tsx
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
```

- [ ] **Step 3.2: Run tests, expect failures (TDD red)**

```bash
npx vitest run src/contexts/__tests__/ThemeContext.test.tsx
```

Expected: la mayoría de tests FAIL porque la API actual del context no expone `mode`, `resolved`, `setMode`. Los 2 tests "legacy" deberían pasar (porque `theme` y `toggleTheme` siguen existiendo).

Es OK que falle — vamos a la implementación en Task 4.

- [ ] **Step 3.3: Commit (test-only commit)**

```bash
git add src/contexts/__tests__/ThemeContext.test.tsx
git commit -m "$(cat <<'EOF'
test(theme): tests del ThemeContext tri-state Auto/Light/Dark

Cubre: default mode, resolved con prefers-color-scheme, persistencia
en localStorage, setMode override del sistema, sync con documentElement,
matchMedia change listener, y aliases legacy theme/toggleTheme.

Tests fallan a propósito hasta que la implementación llegue en commit
siguiente. Los aliases legacy garantizan que Navbar siga funcionando
sin tocarse en este commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implementar ThemeContext tri-state (con aliases legacy)

**Files:**
- Modify: `src/contexts/ThemeContext.tsx` (rewrite)

- [ ] **Step 4.1: Reescribir ThemeContext.tsx**

Reemplazar el contenido completo de `src/contexts/ThemeContext.tsx` por:

```tsx
'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  /** @deprecated use `resolved` instead */
  theme: ResolvedTheme
  /** @deprecated use `setMode('light' | 'dark')` instead */
  toggleTheme: () => void
}

const STORAGE_KEY = 'golfers-theme'

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'auto',
  resolved: 'light',
  setMode: () => {},
  theme: 'light',
  toggleTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto'
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
  } catch {}
  return 'auto'
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

function resolveMode(mode: ThemeMode): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') return mode
  return systemPrefersDark() ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('auto')
  const [resolved, setResolved] = useState<ResolvedTheme>('light')

  // Init from localStorage on mount
  useEffect(() => {
    const initial = readStoredMode()
    setModeState(initial)
    const initialResolved = resolveMode(initial)
    setResolved(initialResolved)
    document.documentElement.setAttribute('data-theme', initialResolved)
  }, [])

  // Persist mode + sync data-theme
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {}
    const next = resolveMode(mode)
    setResolved(next)
    document.documentElement.setAttribute('data-theme', next)
  }, [mode])

  // Listen for system changes when mode is 'auto'
  useEffect(() => {
    if (mode !== 'auto' || typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const next: ResolvedTheme = e.matches ? 'dark' : 'light'
      setResolved(next)
      document.documentElement.setAttribute('data-theme', next)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setModeState(prev => {
      const r = resolveMode(prev)
      return r === 'dark' ? 'light' : 'dark'
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode, theme: resolved, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
```

- [ ] **Step 4.2: Run tests, expect green**

```bash
npx vitest run src/contexts/__tests__/ThemeContext.test.tsx
```

Expected: todos los 10 tests PASS.

- [ ] **Step 4.3: Run full test suite + tsc**

```bash
npx tsc --noEmit
npm run test
```

Expected: 0 errores TS, suite completa verde (Navbar sigue funcionando porque usa `theme` y `toggleTheme` legacy).

- [ ] **Step 4.4: Visual smoke**

```bash
npm run dev
```

Visitar `/dashboard` → debe seguir dark. Hacer click al toggle del Navbar (sol/luna) → ahora cambia `data-theme` en `<html>`, pero la app sigue viéndose dark/igual porque las pantallas no migraron tokens todavía. Es esperado.

- [ ] **Step 4.5: Commit**

```bash
git add src/contexts/ThemeContext.tsx
git commit -m "$(cat <<'EOF'
feat(theme): ThemeContext tri-state Auto/Light/Dark con aliases legacy

API nueva: { mode, resolved, setMode } expuesta para toggles tri-state.
mode persiste en localStorage. resolved se computa: 'light'|'dark' →
usa el valor literal; 'auto' → usa matchMedia('(prefers-color-scheme:
dark)'). Listener al matchMedia mantiene resolved sync cuando modo
auto y el OS cambia.

Aliases legacy { theme, toggleTheme } expuestos para no romper Navbar
en este commit (Navbar isolation rule de CLAUDE.md). Marcados
@deprecated para limpieza futura.

setMode escribe data-theme en <html> directamente. Esto coordina con
el script anti-FOUC (commit posterior) que también escribe data-theme
antes de hydration.

Tests: 10/10 pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Migrar Navbar al toggle tri-state UI (commit aislado por protocolo Navbar)

**Files:**
- Modify: `src/components/Navbar.tsx` (solo este archivo)

**ATENCIÓN:** Navbar es archivo protegido (CLAUDE.md "PROTECCION ANTI-CAIDA"). Cumplir el protocolo:
- Solo este archivo en el commit (sin mezclar con otros).
- No tocar `onAuthStateChange` ni hacer async dentro de useEffect de auth.
- npm run test ANTES del commit.
- Esperar confirmación de Juanjo en producción tras push.

- [ ] **Step 5.1: Localizar la sección del toggle actual**

Abrir `src/components/Navbar.tsx`. Buscar las líneas ~358-375 (el item "Modo claro / Modo oscuro" del dropdown). Inspeccionar el contexto:

```bash
grep -n "toggleTheme\|isDark.*Sun\|Moon.*size" src/components/Navbar.tsx
```

- [ ] **Step 5.2: Migrar a nueva API y reemplazar UI single-toggle por tri-state**

Cambios mínimos en Navbar.tsx:

1. Línea 30: cambiar `const { theme, toggleTheme } = useTheme()` por:
```tsx
const { mode, resolved, setMode } = useTheme()
const isDark = resolved === 'dark'
```
(Mantener `isDark` para que `getNavTheme(isDark)` siga funcionando — es solo un boolean derivado.)

2. Localizar el bloque del toggle (líneas ~355-378 aprox). Reemplazar el `<button onClick={toggleTheme}>...</button>` por un segmented control de 3 pastillas. Estructura:

```tsx
{/* Theme toggle — segmented control tri-state */}
<div
  role="group"
  aria-label="Tema"
  style={{
    display: 'flex',
    gap: '4px',
    padding: '4px',
    margin: '8px 12px',
    background: t.itemActiveBg,
    borderRadius: '10px',
  }}
>
  {(['auto', 'light', 'dark'] as const).map(option => {
    const active = mode === option
    const label = option === 'auto' ? 'Auto' : option === 'light' ? 'Claro' : 'Oscuro'
    return (
      <button
        key={option}
        onClick={() => setMode(option)}
        style={{
          flex: 1,
          padding: '6px 10px',
          fontSize: '13px',
          fontWeight: 500,
          fontFamily: 'var(--font-dm-sans)',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          background: active ? '#C4992A' : 'transparent',
          color: active ? '#070D18' : t.menuMuted,
          transition: 'background 150ms ease, color 150ms ease',
        }}
        aria-pressed={active}
      >
        {label}
      </button>
    )
  })}
</div>
```

Eliminar imports `Sun, Moon` si ya no se usan (verificar con grep `Sun\|Moon` antes de quitar).

- [ ] **Step 5.3: Verificar que onAuthStateChange NO es async**

```bash
grep -A 2 "onAuthStateChange" src/components/Navbar.tsx
```

Expected: la callback es `(_e, session) => {` (NO `async (_e, session) =>`). Si en algún momento aparece `async`, REVERTIR — es la causa de la caída del 25-mar.

- [ ] **Step 5.4: Run tests + tsc + build**

```bash
npx tsc --noEmit
npm run test
npm run build
```

Expected: todo verde. Tests canario incluyen verificaciones de patrones peligrosos en Navbar.

- [ ] **Step 5.5: Visual smoke**

```bash
npm run dev
```

Abrir `/dashboard` (o cualquier pantalla con Navbar). Abrir el menú avatar. Verificar que aparece el segmented control "Auto · Claro · Oscuro". Click en cada uno:
- Auto → la app sigue el OS preference. `data-theme` en `<html>` cambia a `light` o `dark` según el OS.
- Claro → `data-theme="light"` en `<html>`. Pantallas no migradas se ven raras (mezcla de tokens light + hardcodes dark) — ESPERADO. Las pantallas se arreglan en tasks siguientes.
- Oscuro → `data-theme="dark"` en `<html>`. Todo se ve dark como antes.

Confirmar que el toggle persiste tras recargar la página.

- [ ] **Step 5.6: Commit (Navbar.tsx solo)**

```bash
git add src/components/Navbar.tsx
git commit -m "$(cat <<'EOF'
feat(theme): tri-state toggle Auto/Claro/Oscuro en Navbar dropdown

Reemplaza el item single-toggle "Modo claro/oscuro" por un segmented
control de 3 pastillas (Auto · Claro · Oscuro). Diseño minimal: sin
iconos, fondo brand cuando activo, transparente cuando inactivo.

Migra Navbar a la nueva API del ThemeContext (mode, resolved, setMode).
Sigue usando isDark como boolean derivado para getNavTheme(isDark) —
sin tocar la lógica de auth ni el patrón de onAuthStateChange.

Commit aislado por protocolo Navbar (CLAUDE.md PROTECCION ANTI-CAIDA):
solo Navbar.tsx, no async en useEffect de auth, tests canario verdes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5.7: Push individual + esperar confirmación**

```bash
git push origin main
```

**STOP: esperar confirmación de Juanjo que producción funciona antes de continuar a Task 6.** El protocolo Navbar lo exige.

---

## Task 6: Script anti-FOUC en layout.tsx + identidad fija dashboard/auth

**Files:**
- Modify: `src/app/layout.tsx` (script + footer migration)
- Create: `src/app/dashboard/layout.tsx`
- Modify: `src/app/login/layout.tsx`
- Modify: `src/app/register/layout.tsx`
- Modify: `src/app/recuperar/layout.tsx`

- [ ] **Step 6.1: Inyectar script anti-FOUC en `src/app/layout.tsx`**

En el bloque `<head>` (después de los `<meta>` actuales y antes del `<link rel="manifest">`), agregar:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var s=localStorage.getItem('golfers-theme');var r;if(s==='light'||s==='dark'){r=s;}else{r=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',r);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
  }}
/>
```

Una sola línea minificada para minimizar tamaño en el HTML SSR.

- [ ] **Step 6.2: Migrar Footer del layout a tokens**

En el mismo `src/app/layout.tsx`, localizar el bloque `<footer>` (líneas ~110-130). Reemplazar:

```tsx
<p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '14px' }}>
  © {new Date().getFullYear()} Golfers+ · Diseñado para el golf amateur en Latinoamérica
</p>
```

por:

```tsx
<p style={{ color: 'var(--text-2)', fontSize: '14px' }}>
  © {new Date().getFullYear()} Golfers+ · Diseñado para el golf amateur en Latinoamérica
</p>
```

(Los Links de Términos/Privacidad/Reembolsos ya usan `var(--text-3)`.)

- [ ] **Step 6.3: Crear `src/app/dashboard/layout.tsx`**

Archivo nuevo:

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Inicio — Golfers+',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="dark">{children}</div>
}
```

Esto fuerza identidad dark dentro de toda la rama `/dashboard/*` independientemente del toggle global.

- [ ] **Step 6.4: Modificar `src/app/login/layout.tsx`**

Cambiar la última línea:

```tsx
// Antes:
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}

// Después:
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="light">{children}</div>
}
```

- [ ] **Step 6.5: Modificar `src/app/register/layout.tsx` igual**

Mismo patrón: wrap `children` en `<div data-theme="light">`.

- [ ] **Step 6.6: Modificar `src/app/recuperar/layout.tsx` igual**

Mismo patrón.

- [ ] **Step 6.7: Verificar TS, tests, build**

```bash
npx tsc --noEmit
npm run test
npm run build
```

Expected: todo verde.

- [ ] **Step 6.8: Visual smoke crítico**

```bash
npm run dev
```

Abrir DevTools → Network → throttle a "Slow 3G". Recargar `/dashboard`. Verificar que **NO HAY flash de pantalla blanca** antes de que aparezca el dark — el script anti-FOUC debe correr sync antes del paint.

Visitar:
- `/dashboard` → dark fijo, no responde al toggle (override por layout).
- `/login` → light fijo, no responde al toggle.
- `/register` → light fijo.
- `/recuperar` → light fijo.
- `/perfil` → responde al toggle del Navbar (Auto/Claro/Oscuro). Va a verse mezclado/raro porque `/perfil` aún tiene hardcodes — esperado, se migra en task siguiente.

- [ ] **Step 6.9: Commit**

```bash
git add src/app/layout.tsx src/app/dashboard/layout.tsx src/app/login/layout.tsx src/app/register/layout.tsx src/app/recuperar/layout.tsx
git commit -m "$(cat <<'EOF'
feat(theme): script anti-FOUC + identidad fija dashboard/auth

Layout root inyecta script inline en <head> que setea data-theme en
<html> antes del primer paint, basado en localStorage o
prefers-color-scheme. Sin flash blanco al cargar.

Identidad dark fija en /dashboard/* via nuevo layout que envuelve
children en <div data-theme="dark">. Identidad light fija en /login,
/register, /recuperar via mismo patrón con data-theme="light".

Footer del layout root migrado a token --text-2 (eliminado hardcode
rgba(255,255,255,0.72) que asumía dark).

A partir de este commit, el toggle del Navbar afecta a las pantallas
con tokens (componentes shared ya migrados en task 2). Las pantallas
con hardcodes residuales se migran en commits siguientes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Migrar `/perfil` a tokens

**Files:**
- Modify: `src/app/perfil/page.tsx`

- [ ] **Step 7.1: Auditar hardcodes en `/perfil/page.tsx`**

```bash
grep -n "#ffffff\|#fff\|#1a2e\|#4a5568\|#0e1c2f\|#f8fafc\|#e2e8f0\|background: '#" src/app/perfil/page.tsx
```

Documentar mentalmente la lista. Mapeo:
- `#ffffff` → `var(--bg-surface)` (cards) o `var(--bg)` (background general).
- `#1a1a2e` o `#1a2e44` → `var(--text)`.
- `#4a5568` → `var(--text-2)`.
- `#94a3b8` → `var(--text-3)`.
- `#e2e8f0` → `var(--border)`.
- `#f8fafc` → `var(--bg)` (off-white).

- [ ] **Step 7.2: Reemplazar hardcodes con tokens**

Hacer reemplazos línea por línea con la herramienta Edit. Para cada `style={{ background: '#ffffff' }}`:
- Si es card/surface dentro del flow → `style={{ background: 'var(--bg-surface)' }}`
- Si es page wrapper → `style={{ background: 'var(--bg)' }}`

Para texto:
- Color principal → `var(--text)`.
- Color secundario → `var(--text-2)`.
- Color terciario → `var(--text-3)`.

Para borders:
- `border: '1px solid #e2e8f0'` → `border: '1px solid var(--border)'`.

- [ ] **Step 7.3: TS, tests, visual**

```bash
npx tsc --noEmit
npm run test
npm run dev
```

En `/perfil`:
- Toggle Auto/Claro/Oscuro desde Navbar.
- Verificar que en Claro se ve premium (off-white, carbón, sombras editoriales).
- En Oscuro, verificar que se ve coherente con resto de pantallas dark.
- Texto siempre legible. Cards diferenciadas del fondo. Bordes sutiles pero visibles.

- [ ] **Step 7.4: Commit**

```bash
git add src/app/perfil/page.tsx
git commit -m "$(cat <<'EOF'
refactor(perfil): tokens en lugar de hardcodes light/dark

Reemplaza colores hardcoded (#ffffff, #1a1a2e, #4a5568, #e2e8f0, etc)
por tokens CSS (var(--bg-surface), var(--text), var(--text-2),
var(--border)). /perfil ahora responde al toggle Auto/Claro/Oscuro.

En modo claro: off-white cálido con cards blancas y sombras
editoriales. En modo oscuro: navy con bordes dorados sutiles.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Migrar `/perfil/historial` a tokens

**Files:**
- Modify: `src/app/perfil/historial/page.tsx`
- Modify: `src/app/perfil/historial/[id]/page.tsx`

- [ ] **Step 8.1: Auditar hardcodes en ambos archivos**

```bash
grep -n "#[0-9a-fA-F]\{3,8\}\|background: '\|color: '" src/app/perfil/historial/page.tsx src/app/perfil/historial/[id]/page.tsx
```

- [ ] **Step 8.2: Aplicar mismos reemplazos que Task 7**

Mismo mapeo de hex → tokens. Especial atención a leaderboard rows si las hay.

- [ ] **Step 8.3: TS, tests, visual**

```bash
npx tsc --noEmit
npm run test
npm run dev
```

En `/perfil/historial` y `/perfil/historial/<id>`: toggle entre los 3 modos. Verificar legibilidad de tablas/listas.

- [ ] **Step 8.4: Commit**

```bash
git add src/app/perfil/historial/page.tsx src/app/perfil/historial/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
refactor(perfil): tokens en historial — listado e detalle

/perfil/historial/page.tsx y /perfil/historial/[id]/page.tsx migrados
a tokens. Responden al toggle global. Tablas con bordes y separadores
en var(--border), filas legibles en ambos modos.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Migrar `/perfil/stats` a tokens

**Files:**
- Modify: `src/app/perfil/stats/page.tsx`

- [ ] **Step 9.1: Aplicar mapeo hex → tokens**

Mismo procedimiento que Tasks 7 y 8.

- [ ] **Step 9.2: TS, tests, visual**

Verificar gráficos/charts si los hay — los colores de datos (eagle/birdie/par/bogey/double) NO se tocan, son brand-fixed.

- [ ] **Step 9.3: Commit**

```bash
git add src/app/perfil/stats/page.tsx
git commit -m "refactor(perfil): tokens en stats — preserva colores de score Garmin

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Migrar `/coach/*` a tokens

**Files:**
- Modify: `src/app/coach/page.tsx`
- Modify: `src/app/coach/onboarding/page.tsx`
- Modify: `src/app/coach/sesion/nueva/page.tsx`
- Modify: `src/app/coach/sesion/nueva/chat/page.tsx`
- Modify: `src/app/coach/sesion/[id]/page.tsx`

- [ ] **Step 10.1: Auditar hardcodes en toda la rama coach**

```bash
grep -rn "#[0-9a-fA-F]\{3,8\}" src/app/coach --include="*.tsx" | head -50
```

- [ ] **Step 10.2: Si hay >150 líneas de diff total, dividir en 2 commits**

Por simplicidad si entra: un commit. Si crece mucho: split por archivo o por subpath (chat, sesión).

- [ ] **Step 10.3: TS, tests, visual**

`/coach` es UI rica con chat. Verificar bubbles, inputs, sesión history.

- [ ] **Step 10.4: Commit**

```bash
git add src/app/coach/
git commit -m "refactor(theme): tokens en /coach — chat + onboarding + sesiones

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Migrar pantallas de competencia

**Files:**
- Modify: `src/app/leaderboard/page.tsx`
- Modify: `src/app/ranking/page.tsx`
- Modify: `src/app/en-vivo/page.tsx` (cuidado: Juanjo tiene WIP en este archivo, revisar `git diff` antes)
- Modify: `src/app/indices/page.tsx`

- [ ] **Step 11.1: Verificar WIP ajeno en en-vivo**

```bash
git diff src/app/en-vivo/page.tsx | head -50
```

Si hay diff inesperado de Juanjo (memoria observa modificaciones unstaged), DETENER y preguntar. NO incluir su WIP en este commit.

- [ ] **Step 11.2: Aplicar reemplazos en cada pantalla**

Mismo procedimiento. Atención a tablas/leaderboards — son data-heavy.

- [ ] **Step 11.3: Validar score colors siguen iguales en ambos modos**

Los `--eagle`, `--birdie`, `--par`, `--bogey`, `--double` son brand-fixed (Garmin verified). NO cambian con el toggle.

- [ ] **Step 11.4: TS, tests, visual**

Verificar leaderboard live, ranking general, en-vivo widget, indices con histograma.

- [ ] **Step 11.5: Commit (excluir explícitamente el WIP de Juanjo en en-vivo si aplica)**

```bash
# Solo agregar archivos sin conflicto con WIP de Juanjo
git add src/app/leaderboard/page.tsx src/app/ranking/page.tsx src/app/indices/page.tsx
# Si en-vivo está limpio, agregarlo también:
git add src/app/en-vivo/page.tsx

git commit -m "refactor(theme): tokens en pantallas de competencia

leaderboard, ranking, en-vivo, indices migrados. Score colors
(--eagle, --birdie, --par, --bogey, --double) intactos en ambos modos.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Migrar `/organizador/*` y `/ronda-libre/*`

**Files:**
- Modify: `src/app/organizador/nuevo/page.tsx`
- Modify: `src/app/organizador/[slug]/editar/page.tsx`
- Modify: `src/app/organizador/[slug]/jugadores/page.tsx`
- Modify: `src/app/organizador/[slug]/salida/page.tsx`
- Modify: `src/app/organizador/[slug]/scoring/page.tsx`
- Modify: `src/app/ronda-libre/nueva/page.tsx`
- Modify: `src/app/ronda-libre/[codigo]/page.tsx`
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx`
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx`

- [ ] **Step 12.1: Aplicar reemplazos**

Pantallas más complejas — flujos de scoring con muchos componentes interactivos. Score colors fixed siempre.

- [ ] **Step 12.2: Validar UI de scoring en ambos modos**

Critical path: el scoring debe ser legible bajo sol (light = mejor) y con poca luz (dark). Probar con DevTools simulando diferentes luminosidades.

- [ ] **Step 12.3: TS, tests, visual**

```bash
npx tsc --noEmit
npm run test
npm run dev
```

- [ ] **Step 12.4: Commit (puede dividirse si >200 líneas diff)**

```bash
git add src/app/organizador/ src/app/ronda-libre/
git commit -m "refactor(theme): tokens en organizador y ronda-libre

Pantallas de creación, edición, jugadores, salida, scoring y
visualización de rondas libres. Score colors fixed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Migrar pantallas restantes (`/demo`, `/importar`, `/reembolsos`, `/privacidad`, `/admin`)

**Files:**
- Modify: `src/app/demo/page.tsx`
- Modify: `src/app/demo/taiger/page.tsx`
- Modify: `src/app/importar/page.tsx`
- Modify: `src/app/reembolsos/page.tsx`
- Modify: `src/app/privacidad/page.tsx`
- Modify: `src/app/admin/**/*.tsx` (8 pantallas)

- [ ] **Step 13.1: Decisión de scope para `/demo/taiger`**

Pendiente del usuario (item #4 de los pendientes): "/demo/taiger reconvertir a light estándar cuando se implemente el toggle". Ahora aplica. Migra a tokens.

- [ ] **Step 13.2: Decisión de scope para `/admin/*`**

Admin tiene 8 pantallas. Si el barrido total supera ~250 líneas de diff, hacer commit propio `refactor(admin): tokens` aparte.

- [ ] **Step 13.3: Aplicar reemplazos**

- [ ] **Step 13.4: TS, tests, visual**

- [ ] **Step 13.5: Commit (uno o dos)**

```bash
git add src/app/demo/ src/app/importar/page.tsx src/app/reembolsos/page.tsx src/app/privacidad/page.tsx
git commit -m "refactor(theme): tokens en demo, importar, reembolsos, privacidad

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git add src/app/admin/
git commit -m "refactor(admin): tokens en pantallas administrativas

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Deprecar tokens dark en `:root` (cleanup)

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 14.1: Verificar que TODAS las pantallas tienen `data-theme` (directo o por bubble-up)**

```bash
npm run dev
# Abrir cada pantalla en /dashboard, /perfil, /perfil/historial, /perfil/stats,
# /coach, /leaderboard, /ranking, /en-vivo, /indices, /organizador,
# /ronda-libre, /demo, /importar, /reembolsos, /privacidad, /admin, /login,
# /register, /recuperar
# En DevTools, inspeccionar <html> — debe tener data-theme="light" o "dark".
# Si alguna pantalla queda con elementos sin estilizar, falta una migración.
```

- [ ] **Step 14.2: Quitar tokens dark del `:root`**

En `src/app/globals.css`, en el bloque `:root`, eliminar las líneas que duplican los tokens dark:

```css
/* ELIMINAR:
  --bg:          #070d18;
  --bg-surface:  #0e1c2f;
  --bg-card-light: #0e1c2f;
  --text:        #edeae4;
  --text-2:      #94a8c0;
  --text-3:      #5a6a7a;
  --border:      rgba(196,153,42,0.12);
  --border-md:   rgba(196,153,42,0.2);
  --shadow-sm:   0 1px 3px rgba(0,0,0,0.3);
  --shadow-md:   0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg:   0 8px 24px rgba(0,0,0,0.5);
  --shadow-card: 0 2px 8px rgba(0,0,0,0.3);
  --input-bg:     rgba(255,255,255,0.04);
  --input-border: rgba(196,153,42,0.2);
  --input-focus:  #C4992A;
*/
```

(Mantener brand, font, score colors, y legacy palette aliases en `:root`.)

- [ ] **Step 14.3: TS, tests, build, visual completo**

```bash
npx tsc --noEmit
npm run test
npm run build
npm run dev
```

Visitar TODAS las pantallas listadas en Step 14.1. Verificar que ninguna se rompe — el script anti-FOUC garantiza que `<html>` siempre tiene `data-theme` antes del paint.

- [ ] **Step 14.4: Commit**

```bash
git add src/app/globals.css
git commit -m "$(cat <<'EOF'
refactor(theme): deprecar tokens dark legacy en :root

Una vez verificado que todas las pantallas tienen data-theme
controlado (script anti-FOUC + layouts override), los tokens dark
en :root ya no son fallback necesario y duplican definiciones.

Reduce sources of truth a las dos paletas explícitas:
[data-theme="light"] y [data-theme="dark"].

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Documentación + memoria

**Files:**
- Modify: `docs/SPRINT_LOG.md` (entrada al inicio)
- Modify: `docs/ARQUITECTURA.md` (nueva sección Theming)
- Modify: `C:\Users\juanj\.claude\projects\C--Users-juanj-OneDrive-Escritorio-Proyectos-IA-tu-golf\memory\feedback_modo_color_estandar.md`

- [ ] **Step 15.1: Entrada en SPRINT_LOG.md**

Agregar al inicio del archivo:

```markdown
## Sesión 28 Abril 2026 — Toggle Light/Dark/Auto sistémico

### Problema
El toggle del Navbar funcionaba pero solo afectaba al Navbar. Las pantallas tenían hardcodes ad-hoc (`/perfil` light, resto dark). No había forma sistémica de cambiar el tema globalmente.

### Solución
Sistema híbrido tri-state:
- `<html data-theme="light|dark">` controlado por ThemeContext + script anti-FOUC.
- Tokens duales en `globals.css` (`[data-theme="light"]` y `[data-theme="dark"]`).
- Override por layout: `/dashboard` dark fijo, `/login`+`/register`+`/recuperar` light fijo.
- Toggle UI tri-state en Navbar dropdown (Auto · Claro · Oscuro).
- Tailwind `darkMode: ['selector', '[data-theme="dark"]']` para alinear `dark:` clases con tokens.

### Archivos tocados
- `tailwind.config.ts` — darkMode selector.
- `src/app/globals.css` — tokens duales, body conditional gradient.
- `src/contexts/ThemeContext.tsx` — API tri-state con aliases legacy.
- `src/components/Navbar.tsx` — segmented control 3 pastillas.
- `src/components/ui/{Input,ErrorScreen,ShareSheet,Stepper,Toggle}.tsx` — eliminado `dark:` Tailwind.
- `src/app/layout.tsx` — script anti-FOUC + footer migration.
- `src/app/dashboard/layout.tsx` — nuevo, identidad dark fija.
- `src/app/{login,register,recuperar}/layout.tsx` — identidad light fija.
- `src/app/perfil/**`, `src/app/coach/**`, `src/app/leaderboard,ranking,en-vivo,indices/page.tsx`, `src/app/organizador/**`, `src/app/ronda-libre/**`, `src/app/{demo,importar,reembolsos,privacidad,admin}/**` — hardcodes a tokens.
- `docs/ARQUITECTURA.md` — sección Theming.

### Verificación
- 15 commits, cada uno revertible.
- Tests: ThemeContext suite 10/10. Suite completa 5894+ verde.
- Visual QA pantalla por pantalla en los 3 modos.
- Sin flash al cargar (DevTools 3G throttle).
- `grep "dark:" src` → 0 resultados.

### Commits
[lista de commits con SHA cuando se haga el push]

### Decisiones cerradas
Ver `docs/superpowers/specs/2026-04-28-toggle-light-dark-auto-design.md` §9.
```

- [ ] **Step 15.2: Sección "Theming" en ARQUITECTURA.md**

Agregar al final del archivo:

```markdown
## Theming

### Modelo
Sistema híbrido tri-state Auto/Light/Dark con identidad fija por pantalla.

### Resolución del tema
1. ThemeContext lee `localStorage['golfers-theme']` → `'light' | 'dark' | 'auto'`. Default `auto`.
2. Si `auto`, resuelve via `matchMedia('(prefers-color-scheme: dark)')`.
3. Resolved theme se escribe a `document.documentElement.setAttribute('data-theme', ...)`.
4. Layouts override pueden envolver subtrees con `<div data-theme="dark|light">` para forzar identidad fija.

### Anti-FOUC
Script inline en `<head>` de `src/app/layout.tsx` resuelve el tema sync antes del primer paint, antes de que React hidrate. Sin flash blanco.

### Tokens
Definidos en `src/app/globals.css`:
- `:root` — brand colors, fonts, score colors, legacy palette aliases (mismo en ambos modos).
- `[data-theme="light"]` — paleta light premium (off-white `#fafaf7`, carbón `#1a1d24`).
- `[data-theme="dark"]` — paleta dark (navy `#070d18`, ivory `#edeae4`).

### Identidad fija
- `/dashboard/*` — siempre dark (override en `src/app/dashboard/layout.tsx`).
- `/login`, `/register`, `/recuperar` — siempre light (override en sus layouts).

### Tailwind
`darkMode: ['selector', '[data-theme="dark"]']`. Las clases `dark:` activan cuando `[data-theme="dark"]` está en el árbol — coherente con los tokens, no por preferencia del OS.

### Toggle UI
Segmented control de 3 pastillas en el dropdown del Navbar avatar. Estado activo: fondo `--brand`, texto `--brand-dark`. Persiste en localStorage. Listener a matchMedia para sync con OS cuando modo `auto`.

### Out of scope (futuro)
- Sincronización del theme preference con BD del usuario logged-in (multi-device).
- Animaciones de transición entre modos.
- Modo "tournament" (alto contraste para uso bajo sol fuerte).
- Auditoría WCAG AA en ambos modos.
```

- [ ] **Step 15.3: Update memoria `feedback_modo_color_estandar.md`**

Reescribir la memoria con el estado final:

```markdown
---
name: Modo color sistémico Light/Dark/Auto
description: Sistema de theming tri-state implementado. Dashboard dark fijo, auth light fijo, resto respeta toggle. Tokens en globals.css.
type: feedback
---

Toggle sistémico Light/Dark/Auto implementado el 2026-04-28.

**Reglas:**
- `/dashboard` → dark fijo siempre. Identidad club house, no respeta toggle.
- `/login`, `/register`, `/recuperar` → light fijo siempre. Auth = confianza.
- Resto de pantallas → respetan el toggle del usuario (Auto / Claro / Oscuro).
- Default: Auto (sigue prefers-color-scheme del OS).

**Why:** decisión de identidad. Apps premium (Linear, Arc, Vercel) distinguen pantallas-marca de pantallas-utility. Dashboard es marca. Resto es contenido.

**How to apply:**
- Para una nueva pantalla: usar tokens (`var(--bg)`, `var(--text)`, etc.) — responde al toggle automáticamente.
- Para forzar identidad fija: envolver el layout en `<div data-theme="dark">` o `"light"`.
- NUNCA hardcodear colores hex que cambien según modo. Si un color es brand-fixed (gold, score colors), va igual en ambos modos.
- Tailwind `dark:` classes activan vía `[data-theme="dark"]`. NO usar `dark:` para colores que ya tienen tokens — usar tokens directamente.

**Spec y plan:**
- Spec: `docs/superpowers/specs/2026-04-28-toggle-light-dark-auto-design.md`
- Plan: `docs/superpowers/plans/2026-04-28-toggle-light-dark-auto.md`
- ARQUITECTURA.md sección "Theming".
```

- [ ] **Step 15.4: Update `MEMORY.md` index**

Editar la línea "Modo color estándar" para reflejar el nuevo estado:

```markdown
- [Modo color sistémico](feedback_modo_color_estandar.md) — Sistema tri-state Auto/Light/Dark implementado 2026-04-28. Dashboard dark fijo, auth light fijo, resto respeta toggle.
```

- [ ] **Step 15.5: Run `node scripts/update-docs.js` si existe**

```bash
node scripts/update-docs.js 2>&1 || echo "skip if script doesn't exist or fails"
```

- [ ] **Step 15.6: Commit final**

```bash
git add docs/SPRINT_LOG.md docs/ARQUITECTURA.md
git commit -m "$(cat <<'EOF'
docs(theme): SPRINT_LOG + ARQUITECTURA con sección Theming

Cierra el sprint del toggle Light/Dark/Auto sistémico. Documenta el
modelo tri-state, identidad fija dashboard/auth, anti-FOUC, tokens
duales y reglas de Tailwind darkMode.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Pre-push Checklist Final

Antes del último `git push origin main`:

- [ ] **A. Health check del proyecto**

```bash
npx tsc --noEmit
npm run test
npm run build
```

Todo verde.

- [ ] **B. Verificación visual completa en producción local**

```bash
npm run dev
```

Visitar (en cada modo Auto/Claro/Oscuro):
- `/` — landing
- `/dashboard` — debe ser dark siempre
- `/login`, `/register`, `/recuperar` — debe ser light siempre
- `/perfil`, `/perfil/historial`, `/perfil/stats`
- `/coach`, `/coach/onboarding`, `/coach/sesion/nueva`
- `/leaderboard`, `/ranking`, `/en-vivo`, `/indices`
- `/organizador/nuevo`, `/ronda-libre/nueva`
- `/demo`, `/demo/taiger`
- `/importar`, `/reembolsos`, `/privacidad`
- `/admin`

Criterios:
- Sin flash blanco al cargar.
- Texto siempre legible.
- Score colors (eagle/birdie/par/bogey/double) idénticos en ambos modos.
- Toggle persiste tras recargar.
- Auto sigue al OS (cambiar OS → app cambia).

- [ ] **C. Health check API**

```bash
curl -s http://localhost:3000/api/admin/health-check 2>/dev/null || echo "skip si requiere auth"
```

Si responde con FAILs, arreglar antes de push.

- [ ] **D. Final grep `dark:`**

```bash
grep -rn "dark:" src --include="*.tsx" --include="*.ts"
```

Expected: 0.

- [ ] **E. Push**

```bash
git push origin main
```

Esperar deploy en Vercel. Verificar producción en `https://golfersplus.vercel.app` con los criterios B.

---

## Notas y consideraciones cross-cutting

### Coordinación con WIP de Juanjo
La memoria observa cambios unstaged en `docs/ARQUITECTURA.md` y `src/app/en-vivo/page.tsx` al inicio de la sesión. Antes de cualquier commit que toque esos archivos, hacer `git diff` para confirmar que no se incluye WIP ajeno por error. Si hay conflicto, parar y preguntar.

### Score colors son brand-fixed
`--eagle`, `--birdie`, `--par`, `--bogey`, `--double` son la paleta Garmin Golf verificada (`src/lib/garmin-colors.ts`). NO cambian con el toggle. Definidos en `:root`, no en bloques `[data-theme="..."]`.

### `glass-card` y otros component classes en globals.css
Las clases `.glass-card`, `.leader-row`, `.btn-primary` etc. en `globals.css` `@layer components` usan colores hardcoded asumiendo dark. En este sprint NO se migran — siguen usándose en pantallas dark. Si una pantalla light usa `.glass-card` y se ve mal, esa pantalla deja de usar la clase y usa estilos inline con tokens. Migrar `glass-card` a tri-state es out-of-scope.

### Footer, Navbar y otros globales
Footer migrado en Task 6. Navbar usa `nav-theme.ts` con paletas dark/light explícitas que ya existían — sigue funcionando vía `getNavTheme(isDark)` derivado de `resolved`.

### TDD scope
Tests unitarios solo para ThemeContext (Task 3-4). El resto del sprint es CSS + visual QA, no testeable con unit tests. La verificación es visual + tests canario existentes (que detectan patrones peligrosos en Navbar).

---

## Self-Review (writer's checklist)

**Spec coverage:**
- [x] §3.1 Patrón híbrido → Tasks 6 (overrides), 7-13 (toggle responde).
- [x] §3.2 Tri-state → Tasks 4 (context), 5 (UI).
- [x] §3.3 Paleta light premium → Task 1 (definición).
- [x] §3.4 Paleta dark intacta → Task 1 (relocaliza).
- [x] §3.5 Toggle UI → Task 5.
- [x] §4.1 Tokens duales → Task 1.
- [x] §4.2 Script anti-FOUC → Task 6.
- [x] §4.3 ThemeContext extendido → Tasks 3, 4.
- [x] §4.4 Override por pantalla → Task 6.
- [x] §4.5 Toggle UI tri-state → Task 5.
- [x] §4.6 Tailwind darkMode → Task 1.
- [x] §4.7 Backward-compat → Task 4 (aliases legacy).
- [x] §5 Plan de migración → cubierto end-to-end.
- [x] §6 Out of scope → respetado (no animations, no DB sync, no extra palettes).
- [x] §7 Riesgos → cubiertos en steps de verificación visual y grep.
- [x] §8 Verificación → Pre-push Checklist Final.
- [x] §9 Decisiones cerradas → respetadas.

**Placeholder scan:** revisado, no hay TBD/TODO sin contenido. Cada step tiene código o comando concreto.

**Type consistency:** `mode`, `resolved`, `setMode`, `theme`, `toggleTheme` consistentes entre Tasks 3, 4, 5. `data-theme` selector consistente entre Tasks 1, 6.

**Branches removed (vs spec):** Spec mencionaba commit atómico §4.7 que combinaba ThemeContext + Navbar + dashboard. Plan los separa en Tasks 4, 5, 6 por protocolo Navbar (CLAUDE.md). Los aliases legacy en ThemeContext (Task 4) garantizan continuidad sin commit roto intermedio.
