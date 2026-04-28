# Spec — Toggle sistémico Light/Dark/Auto

**Fecha:** 2026-04-28
**Autor:** Claude (CTO) + Juanjo (PM)
**Sprint origen:** P2 del Audit UI/UX Abr 2026
**Estado:** Spec aprobado, pendiente plan de implementación

---

## 1. Contexto

Hoy la app es un mosaico de modos de color:

- `/dashboard` — dark premium (gold/navy, identidad club house). Shippeada, validada.
- `/perfil` — light hardcodeado a mano (revertido hoy 2026-04-28 1:08pm).
- `/perfil/historial` — referencias mezcladas a tokens dark sobre fondo claro.
- Resto de pantallas — heredan los tokens dark de `globals.css :root` por default.
- Botón "Modo claro / Modo oscuro" en el dropdown del Navbar — funciona pero **solo cambia el Navbar**. El resto de la app no responde.

`ThemeContext` y `nav-theme.ts` ya existen con paletas para Navbar light/dark. Falta cerrar el gap entre la decisión de diseño ("dashboard dark fijo, resto light estándar con toggle") y la implementación real en toda la app.

## 2. Objetivo

Convertir el toggle en un control **sistémico** que cambie el tema de toda la app (excepto pantallas con identidad fija), con tres modos (Light / Dark / Auto), paleta light de identidad **premium minimalista** (referente: Linear, Arc, Vercel, Apple, Stripe — NO Strava ni Garmin), y migración pantalla por pantalla con commits puros.

Resultado al cerrar el sprint: el usuario abre cualquier pantalla del set "respeta toggle", toca el botón en el menú, y toda la app cambia. Sin flash blanco al cargar. Sin pantallas rotas en alguno de los dos modos. Auto sigue la preferencia del sistema operativo del dispositivo.

## 3. Decisiones de diseño

### 3.1 Patrón híbrido — identidad fija + utility con toggle

Tres categorías de pantalla:

| Categoría | Pantallas | Modo |
|-----------|-----------|------|
| **Identidad dark fija** | `/dashboard` | dark siempre, ignora toggle |
| **Identidad light fija** | `/login`, `/register`, `/recuperar` | light siempre, ignora toggle |
| **Respeta toggle** | Todas las demás (perfil, historial, coach, leaderboard, ranking, en-vivo, organizador, ronda-libre, demo, importar, indices, reembolsos, privacidad, admin/*) | sigue elección del usuario |

**Por qué este patrón:** las apps premium top (Linear, Arc, Vercel) NO ofrecen toggle a "cualquier" pantalla — distinguen entre **pantallas que SON la marca** (identidad) y **pantallas de contenido/utility** (donde la legibilidad y comodidad mandan). `/dashboard` es identidad. Auth es identidad de confianza. Todo lo demás es contenido.

### 3.2 Tres estados de toggle (no dos)

`Auto · Claro · Oscuro`. Default = `Auto`.

**Por qué Auto y no light/dark binario:** en 2024+ todas las apps premium ofrecen Auto. Linear, Arc, Apple, Vercel. Un toggle binario sin Auto es estética 2018 y se nota. Auto sigue `prefers-color-scheme` del sistema operativo — el usuario en su Mac en modo oscuro abre Golfers+ y la app respeta esa decisión sin que tenga que tocar nada.

### 3.3 Paleta light premium — off-white cálido, no #ffffff

Referente: Linear (light mode), Arc, Stripe Atlas, MUBI. NO Strava, NO Garmin Connect, NO MyFitnessPal.

**Principios de la paleta light:**

- **Fondo:** off-white cálido `#fafaf7` (no `#ffffff` puro — el blanco puro grita "documento" y mata el premium).
- **Surface (cards):** blanco puro `#ffffff`, así las cards "flotan" sobre el off-white del body.
- **Texto principal:** carbón `#1a1d24`, no negro puro `#000` (negro puro es agresivo en pantallas modernas).
- **Texto secundario:** `#5a6573` — gris cálido con tinte azulado sutil.
- **Texto terciario:** `#9099a8`.
- **Bordes:** `rgba(26, 29, 36, 0.08)` — apenas visibles, definen sin gritar.
- **Sombras:** `0 1px 2px rgba(20, 25, 35, 0.04), 0 4px 16px rgba(20, 25, 35, 0.06)` — difusas, capa editorial.
- **Brand gold (`--brand`):** `#C4992A` (igual en ambos modos).
- **Brand gold hover (`--brand-hover`):** `#A67D1E` (igual en ambos modos).
- **Sage del logo (acento secundario):** `#7a9389` para light (más claro que dark).

### 3.4 Paleta dark — la actual de `globals.css`

Sin cambios. Ya está validada en `/dashboard`. Solo se relocaliza dentro de `[data-theme="dark"]`.

### 3.5 Toggle UI — minimal, no aparatoso

En el dropdown del Navbar, donde hoy hay un único item "Modo oscuro / Modo claro", va un control de tres pastillas:

```
[ Auto ]  [ Claro ]  [ Oscuro ]
```

Estado activo: pastilla con fondo `--brand` y texto `--brand-dark`. Inactivas: transparente con borde sutil. No iconos. No emoji. Tipografía `--font-dm-sans` size 13, weight 500. Es un control utilitario, no un selector decorativo.

## 4. Arquitectura técnica

### 4.1 Tokens en `globals.css`

Mover los tokens actuales de `:root` a dos bloques separados con los **mismos nombres de variable**:

```css
[data-theme="light"] {
  --bg:           #fafaf7;
  --bg-surface:   #ffffff;
  --bg-card-light: #ffffff;
  --text:         #1a1d24;
  --text-2:       #5a6573;
  --text-3:       #9099a8;
  --border:       rgba(26, 29, 36, 0.08);
  --border-md:    rgba(26, 29, 36, 0.12);
  --shadow-sm:    0 1px 2px rgba(20, 25, 35, 0.04);
  --shadow-md:    0 4px 16px rgba(20, 25, 35, 0.06);
  --shadow-lg:    0 12px 32px rgba(20, 25, 35, 0.08);
  --shadow-card:  0 1px 3px rgba(20, 25, 35, 0.04), 0 4px 12px rgba(20, 25, 35, 0.04);
  --input-bg:     #ffffff;
  --input-border: rgba(26, 29, 36, 0.12);
  --input-focus:  #C4992A;
  /* score colors iguales en ambos modos */
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

:root {
  /* Brand tokens — iguales en ambos modos */
  --brand:       #C4992A;
  --brand-hover: #A67D1E;
  --brand-dark:  #070D18;
  --brand-light: #FDF6E3;

  /* Score colors — iguales en ambos modos (paleta Garmin Golf verificada) */
  --eagle:  #3B82F6;
  --birdie: #EF4444;
  --par:    #6B7280;
  --bogey:  #C4992A;
  --double: #DC2626;

  /* Fonts — iguales */
  --font-playfair: 'Playfair Display', serif;
  --font-dm-sans:  'DM Sans', sans-serif;
}

/* Default fallback si no hay data-theme aún (SSR antes de hydration) */
html:not([data-theme]) {
  /* Hereda los tokens light por default mientras carga el script anti-FOUC */
  --bg: #fafaf7;
  --text: #1a1d24;
}
```

**Body background dinámico** — el gradient actual de body usa colores oscuros hardcoded. Se reemplaza por:

```css
body {
  background: var(--bg);
  color: var(--text);
}

[data-theme="dark"] body {
  background:
    radial-gradient(circle at top, rgba(200, 165, 90, 0.10), transparent 30%),
    radial-gradient(circle at bottom right, rgba(30, 70, 55, 0.35), transparent 28%),
    linear-gradient(180deg, #08120f 0%, #0d1b17 100%);
}

[data-theme="light"] body {
  background:
    radial-gradient(circle at top, rgba(196, 153, 42, 0.04), transparent 40%),
    var(--bg);
}
```

El light tiene un wash dorado MUY sutil arriba — guiño a la marca sin ruido.

### 4.2 Script anti-FOUC en `<head>`

En `src/app/layout.tsx`, antes del `<body>`, inyectar un script inline que resuelva el tema antes de que React hidrate:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `
      (function() {
        try {
          var saved = localStorage.getItem('golfers-theme');
          var resolved;
          if (saved === 'light' || saved === 'dark') {
            resolved = saved;
          } else {
            // 'auto' o vacío → seguir sistema
            resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          }
          document.documentElement.setAttribute('data-theme', resolved);
        } catch (e) {
          document.documentElement.setAttribute('data-theme', 'light');
        }
      })();
    `,
  }}
/>
```

Ejecuta sincronamente, antes del primer paint. Sin flash. Es el patrón que usan Linear, Vercel y todas las apps premium.

### 4.3 ThemeContext extendido

Pasa de `'light' | 'dark'` a `'light' | 'dark' | 'auto'`. La preferencia guardada es la del usuario (modo elegido). El **resolved theme** (lo que efectivamente se aplica al DOM) se calcula:

- Si saved === `'light'` → resolved = `'light'`
- Si saved === `'dark'` → resolved = `'dark'`
- Si saved === `'auto'` o null → resolved = `prefers-color-scheme` (`'light'` o `'dark'`)

```tsx
type ThemeMode = 'light' | 'dark' | 'auto'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  mode: ThemeMode          // lo que el usuario eligió
  resolved: ResolvedTheme  // lo que efectivamente se aplica
  setMode: (mode: ThemeMode) => void
}
```

Listener a `matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ...)` para que cuando el usuario está en modo Auto y cambia el sistema, la app se actualice sola.

El `setMode` actualiza `document.documentElement.setAttribute('data-theme', resolved)` para que sea consistente con el script anti-FOUC.

### 4.4 Override por pantalla — identidad fija

Pantallas con identidad fija ponen `data-theme` en su contenedor de página, sobreescribiendo el global:

```tsx
// src/app/dashboard/layout.tsx
export default function DashboardLayout({ children }) {
  return <div data-theme="dark">{children}</div>
}

// src/app/login/layout.tsx
export default function LoginLayout({ children }) {
  return <div data-theme="light">{children}</div>
}
```

Los selectores `[data-theme="light"]` y `[data-theme="dark"]` en `globals.css` aplican a cualquier descendiente, así que el override por contenedor funciona naturalmente sin necesidad de prefijar todos los componentes.

### 4.5 Toggle UI tri-state en Navbar

Reemplaza el item actual "Modo oscuro / Modo claro" del dropdown por un segmented control de 3 pastillas (Auto / Claro / Oscuro). Uso del `mode` del context para determinar la pastilla activa, no `resolved`. Click llama `setMode(...)`.

### 4.6 Tailwind `darkMode` selector — crítico

`tailwind.config.ts` no tiene `darkMode` set hoy → defaultea a `'media'` (sigue `prefers-color-scheme` del OS). Hay 30 usos de `dark:` en el código (concentrados en `src/components/ui/Input.tsx` y `src/components/ui/ErrorScreen.tsx`). Si dejamos esto, un usuario que elige `Light` pero tiene OS en dark verá clases `dark:` activadas → mezcla de modos en mismas pantallas.

**Fix obligatorio:**

```ts
// tailwind.config.ts
const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  // ... resto
}
```

Ahora las clases `dark:` activan **solo** cuando `[data-theme="dark"]` está en el árbol — coherente con nuestros tokens CSS. Lo decidimos en el OS no importa: lo que manda es el `data-theme` resuelto por el ThemeContext.

**Componentes a auditar y migrar:** `src/components/ui/Input.tsx`, `src/components/ui/ErrorScreen.tsx`, y cualquier otro que aparezca en el grep `dark:`. La meta es eliminar `dark:` en favor de `var(--text)`, `var(--bg)`, etc. — **una sola fuente de verdad**, no dos sistemas paralelos. Si un componente requiere variantes complejas que justifican `dark:`, queda como excepción documentada, pero el target es cero `dark:` al cierre del sprint.

### 4.7 Backward-compat del ThemeContext

El `ThemeContext` actual exporta `{theme, toggleTheme}`. La nueva API es `{mode, resolved, setMode}`. Cualquier consumer que use la vieja API rompe.

Hoy el único consumer es `Navbar.tsx`. La migración del context y la del Navbar **van en el mismo commit** para evitar un commit intermedio que rompa el build.

Si en el futuro aparecen más consumers, evaluamos si vale la pena un alias temporario `theme = resolved` y `toggleTheme = () => setMode(resolved === 'dark' ? 'light' : 'dark')` — pero hoy no es necesario.

## 5. Plan de migración (orden de commits)

Cada paso = un commit puro. Si algo se rompe, revertimos solo esa pieza. El orden está calculado para que cada commit deje la app en estado consistente — no hay un commit intermedio que rompa producción.

### Bloque A — Foundation (commits 1-3)

1. **`refactor(theme): introducir tokens duales en globals.css`**
   - Mantener `:root` con tokens dark actuales (sigue siendo el default mientras no haya `data-theme`).
   - Agregar bloque `[data-theme="light"]` con paleta premium light de §3.3.
   - Agregar bloque `[data-theme="dark"]` con tokens dark (duplicados de `:root` por ahora — se va a deprecar `:root` cuando todo esté migrado).
   - Configurar `darkMode: ['selector', '[data-theme="dark"]']` en `tailwind.config.ts`.
   - Body conditional gradient: light wash sutil dorado, dark con gradient actual.
   - **Estado post-commit:** todo se ve igual que hoy — `<html>` no tiene `data-theme` aún, los selectores nuevos no matchean.

2. **`refactor(ui): tokens en componentes shared (Input, ErrorScreen)`**
   - Eliminar `dark:` de Tailwind en `src/components/ui/Input.tsx` y `src/components/ui/ErrorScreen.tsx`.
   - Reemplazar por `var(--text)`, `var(--bg-surface)`, `var(--border)`, etc.
   - Cualquier otro uso de `dark:` que aparezca en `grep -rn "dark:" src --include="*.tsx"` se migra acá.
   - **Estado post-commit:** componentes shared listos para responder a `data-theme`. Sigue sin haber `data-theme` en `<html>`, pero ahora cuando lo agreguemos, estos componentes responden coherentemente.

3. **`feat(theme): sistema tri-state Auto/Light/Dark + toggle UI + identidad fija**
   Atómico — no se puede splitear sin romper producción intermedio.
   - `ThemeContext` extendido a `mode: 'light' | 'dark' | 'auto'` + `resolved: 'light' | 'dark'` + `setMode`.
   - Listener `matchMedia('(prefers-color-scheme: dark)')` para modo Auto.
   - Script anti-FOUC inline en `<head>` de `layout.tsx`.
   - Toggle UI tri-state (3 pastillas) en dropdown del Navbar.
   - Navbar.tsx migrado a nueva API del context.
   - `src/app/dashboard/layout.tsx` con `<div data-theme="dark">` (preserva identidad).
   - `src/app/login/layout.tsx`, `src/app/register/layout.tsx`, `src/app/recuperar/layout.tsx` con `<div data-theme="light">`.
   - **Estado post-commit:** sistema funcional end-to-end. Toggle cambia el tema. Dashboard sigue dark. Auth sigue light. Pantallas no migradas (perfil, etc) **siguen usando sus hardcodes actuales** — el toggle no las afecta todavía, pero tampoco las rompe.

### Bloque B — Migración de pantallas (commits 4-N)

Cada pantalla migrada se valida visualmente en los 3 modos antes de commitear. Si una pantalla tiene mucho hardcode y crece más allá de ~150 líneas de diff, se splittea en commit propio.

4. **`refactor(perfil): tokens en lugar de hardcodes`**
   `/perfil/page.tsx` — los hardcodes light están frescos del revert de hoy.

5. **`refactor(perfil): tokens en historial`**
   `/perfil/historial/page.tsx` y `/perfil/historial/[id]/page.tsx`.

6. **`refactor(perfil): tokens en stats`**
   `/perfil/stats/page.tsx`.

7. **`refactor(theme): tokens en /coach`**
   `/coach/*` — onboarding, sesion, chat. Probablemente requiere atención porque coach tiene UI rica.

8. **`refactor(theme): tokens en pantallas de competencia`**
   `/leaderboard`, `/ranking`, `/en-vivo`, `/indices`. Pantallas de datos — chequear contraste de tablas.

9. **`refactor(theme): tokens en /organizador y /ronda-libre`**
   Pantallas de creación y scoring. Las más complejas — verificar score colors siguen iguales en ambos modos.

10. **`refactor(theme): tokens en pantallas restantes`**
    `/demo/*`, `/importar`, `/reembolsos`, `/privacidad`, `/admin/*`. Las admin pueden requerir commit propio si tienen mucho hardcode.

### Bloque C — Cierre

11. **`refactor(theme): deprecar :root dark legacy en globals.css`**
    Una vez que TODO usa tokens y todas las pantallas tienen `data-theme` controlado:
    - Quitar tokens dark de `:root` (quedan solo en `[data-theme="dark"]`).
    - Verificar que el script anti-FOUC siempre setea `data-theme` antes del paint.
    - Reduce sources of truth a las dos paletas explícitas.

12. **`docs(theme): SPRINT_LOG + ARQUITECTURA + memory actualizados`**
    - Entrada en `docs/SPRINT_LOG.md` al inicio.
    - Sección "Theming" en `docs/ARQUITECTURA.md`.
    - Update de la memoria `feedback_modo_color_estandar.md`.
    - `node scripts/update-docs.js` para regenerar autodocs si aplica.

## 6. Lo que NO incluye este sprint

Explícito para evitar scope creep:

- **No animar transiciones** entre modos. Cambio instantáneo. La transición animada es polish que vive en otro sprint si los usuarios lo piden.
- **No persistir preferencia en BD**. Vive en `localStorage` del dispositivo. Si el usuario cambia de teléfono, vuelve a Auto. Aceptable para v1.
- **No paletas extra** (sepia, alto contraste, soft-light, etc).
- **No tocar Navbar más allá del item del toggle**. Si hay otros bugs visuales en Navbar dark/light, se arreglan en sprint propio.
- **No tocar `/dashboard` más allá de envolverlo en `data-theme="dark"`**. Está validado, no se refactorea.
- **No agregar toggle en otro lugar** (botón flotante, settings page, etc). Solo Navbar dropdown.

## 7. Riesgos y mitigación

| Riesgo | Mitigación |
|--------|-----------|
| Pantalla queda ilegible en uno de los dos modos (contraste insuficiente, texto oscuro sobre fondo oscuro) | Visual QA pantalla por pantalla en cada commit de migración. Abrir cada pantalla en Auto/Light/Dark antes de commit. |
| Componente compartido (Card, Button, etc) tiene hardcodes que rompen en light | Auditar `src/components/ui/*` ANTES de migrar pantallas (incluido en commit 1 si es necesario). |
| Flash blanco al cargar | Script anti-FOUC en commit 2. Verificar con DevTools → Network throttling 3G. |
| Páginas SSR pre-render con tema incorrecto | El script anti-FOUC corre antes de hydration. SSR renderea sin `data-theme`, el script lo setea, React hidrata coherente. |
| Conflicto con Tailwind `dark:` classes existentes (30 usos en el código, mayoría en `ui/Input.tsx` y `ui/ErrorScreen.tsx`) | Resuelto en §4.6: configurar `darkMode: ['selector', '[data-theme="dark"]']` y migrar `dark:` a tokens en commit 2 (antes de las pantallas). Target: cero `dark:` al cierre del sprint. |
| ThemeProvider no envuelve algún subtree que necesita useTheme | Verificar que todos los layouts hijos están dentro del `ThemeProvider` del root layout. |

## 8. Verificación / criterios de éxito

El sprint está hecho cuando, en producción:

1. ✅ El toggle del Navbar tiene 3 pastillas funcionales (Auto / Claro / Oscuro).
2. ✅ Click en cualquiera cambia toda la app instantáneamente (excepto `/dashboard` y auth).
3. ✅ La preferencia persiste al recargar.
4. ✅ Auto sigue el modo del sistema operativo y se actualiza si el sistema cambia.
5. ✅ Sin flash blanco al cargar en ningún modo.
6. ✅ `/dashboard` se ve idéntico a hoy (dark fijo).
7. ✅ `/login`, `/register`, `/recuperar` se ven light fijo.
8. ✅ Cada pantalla del set "respeta toggle" se ve premium en los dos modos. Sin texto ilegible. Sin cards rotas. Sin bordes inconsistentes.
9. ✅ `npx tsc --noEmit` → 0 errores.
10. ✅ `npm run test` → todo verde.
11. ✅ `npm run build` → success.
12. ✅ Pre-push hook verde.
13. ✅ `grep -rn "dark:" src --include="*.tsx" --include="*.ts"` → cero matches (o lista mínima documentada).

## 9. Decisiones explícitas (anti-rabbit-hole)

Estas decisiones quedan tomadas, no se vuelven a abrir:

- Paleta light: off-white `#fafaf7` con cards `#ffffff`. NO `#ffffff` puro como body.
- Texto principal light: `#1a1d24`. NO `#000`.
- Brand gold y score colors: idénticos en ambos modos. NO se ajustan por mode.
- Default mode: `Auto`.
- Storage key: `'golfers-theme'` (ya existe).
- Modo Auto: usa `matchMedia('(prefers-color-scheme: dark)')`.
- Override por pantalla: `data-theme` en el contenedor del layout. NO via context API ni props drilling.
- Toggle UI: 3 pastillas en Navbar dropdown. NO botón flotante. NO settings page.

## 10. Out of scope (referencias futuras)

- **Sprint posterior 1:** sincronizar theme preference con BD del usuario logged-in (multi-device).
- **Sprint posterior 2:** transiciones animadas entre modos (200ms ease-out en `--bg` y `--text`).
- **Sprint posterior 3:** modo "tournament" — dark de alto contraste para uso en exterior con sol fuerte.
- **Sprint posterior 4:** auditoría de accesibilidad (WCAG AA) en ambos modos.

---

**Aprobaciones:**
- Diseño aprobado por Juanjo en conversación 2026-04-28 1:30pm GMT-4.
- Próximo paso: revisión de spec por Juanjo, luego writing-plans skill.
