# Spec: Gate "Próximamente" para tAIger+ Coach

**Fecha:** 2026-09-06
**Estado:** Aprobado
**Contexto:** El coach está caído — Anthropic agotó budget hasta 2026-10-01 y el fallback Gemini da timeout en prod. Se necesita gatear el acceso a beta testers mientras se sigue desarrollando, y mostrar una pantalla premium "próximamente" al resto.

---

## Problema

1. **Anthropic API**: budget mensual agotado, devuelve 400 "usage limits" hasta 2026-10-01.
2. **Gemini fallback**: `gemini-2.5-flash` funciona local pero da timeout en prod — probablemente `GEMINI_API_KEY` no está en Vercel env.
3. **Resultado**: `ai_usage` registra `all_failed` con 4 intentos y 60s de timeout. El coach no responde.
4. **Riesgo de percepción**: un usuario que entra al coach y ve un error genérico pierde confianza en toda la app.

## Decisiones

| Decisión | Elección | Razón |
|---|---|---|
| Flag de gate | Nuevo `coach_access_enabled` en `profiles` | `cerebro_v3_enabled` controla QUÉ versión del coach (v2/v3). El gate controla SI ves el coach. Son conceptos distintos → fuentes distintas (regla "un concepto, una fuente"). |
| Tono | Exclusividad premium | "En desarrollo" con features preview. No apologético, genera expectativa. |
| Navbar | Sin cambios | El link sigue visible — la pantalla gate ES contenido (no un error). Ocultar degrada FTUE. |
| Waitlist | No (YAGNI) | Se puede agregar después. Hoy no aporta valor real. |
| Gestión acceso | SQL manual | `UPDATE profiles SET coach_access_enabled = true WHERE id = '<uuid>'`. Admin UI después si hace falta. |

## Arquitectura

### Parte 1 — Fix fallback Gemini

Objetivo: que el coach funcione degradado (sin streaming, sin tools) vía Gemini para beta testers.

1. Verificar/agregar `GEMINI_API_KEY` en Vercel env (production + preview).
2. No se toca código del gateway — la cadena en `registry.ts` ya tiene `google/gemini-2.5-flash` como tercer proveedor.
3. Verificación: los 2 intentos de Anthropic fallan rápido (400, no transitorio → `isTransient` devuelve false → salta al siguiente) y Gemini responde.

### Parte 2 — Campo `coach_access_enabled`

**Migración SQL:**

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS coach_access_enabled boolean NOT NULL DEFAULT false;

-- Habilitar para beta testers actuales
UPDATE profiles SET coach_access_enabled = true
WHERE id IN (
  '98c5cb7a-1c0b-4a64-a773-8bd013a92317',  -- Juanjo
  '<nicolas-uuid>'                            -- Nicolás (verificar UUID)
);
```

### Parte 3 — Gate en UI

**Punto de gate:** `src/app/coach/page.tsx` (server component).

```
Flujo:
1. getSession() → user_id (ya existe)
2. supabase.from('profiles').select('coach_access_enabled').eq('id', user_id)
3. Si coach_access_enabled !== true → renderizar <CoachGatePage />
4. Si true → renderizar dashboard normal (código actual)
```

**Sub-rutas protegidas:** `src/app/coach/layout.tsx` agrega check server-side. Si `coach_access_enabled` es false y la ruta no es `/coach` (que ya tiene su propio gate), redirige a `/coach` vía `redirect()`.

**Componente `CoachGatePage`** (server component, `src/app/coach/components/CoachGatePage.tsx`):

- Reutiliza `TaigerHero` existente (carousel de imágenes con crossfade)
- Badge "En desarrollo" con dot pulsante dorado
- Copy: "Tu coach de golf con inteligencia artificial" + párrafo describiendo qué hace
- 3 features preview con iconos SVG línea fina:
  - Análisis de patrones
  - Psicología deportiva
  - Conversación natural
- Divider dorado sutil
- Copy: "tAIger+ estará disponible próximamente para todos los usuarios."
- CTA: "Volver al inicio" → `/` (botón outline dorado, variante `nav` según §5 del DESIGN.md)
- Dark navy (#070d18), Playfair Display para títulos, DM Sans para body
- Animaciones: `textUp` stagger, `glowBreath` en el hero

**Lo que NO hace el gate:**
- No toca la API del coach (si alguien llama directo `/api/taiger/chat` sin UI, la auth de middleware lo bloquea si no tiene sesión, y el rate-limit normal aplica)
- No cambia el Navbar
- No agrega formularios ni tablas nuevas (salvo la columna en profiles)

### Parte 4 — Verificación

- `coach_access_enabled = true`: ve el dashboard normal, puede chatear con tAIger+
- `coach_access_enabled = false`: ve la pantalla gate en `/coach`, redirigido si intenta `/coach/sesion/*`
- `coach_access_enabled = NULL` (campo no existe aún): tratado como false (default)
- Beta testers con Gemini fallback: el coach responde degradado pero funcional

## Mockup

Mockup visual en `.superpowers/brainstorm/1345-1788524841/content/coach-gate-mockup.html`.

## Fuera de scope

- Waitlist / formulario "quiero acceso"
- Notificación push/email cuando se habilita acceso
- Admin UI para gestionar acceso
- Cambios al gateway o la cadena de modelos
- Migración a otro provider (Anthropic vuelve el 1-oct)
