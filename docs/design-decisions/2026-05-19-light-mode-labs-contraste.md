# 2026-05-19 — Light mode contraste en /indices (LABS)

## Problema

Reporte inbox `235c7de5` (+ 2 evidencias duplicadas `92e50df5`, `9b246190`): los subtítulos descriptivos de los widgets GWI™, CPI™ e "Índice G+" en `/indices` aparecen invisibles en modo claro. Texto gris claro casi blanco sobre fondo `--bg = #fafaf7` → no se lee.

## Causa raíz

`src/app/indices/page.tsx:12-13` definía:
```ts
const textMuted = 'rgba(255,255,255,0.55)'
const textFaint = 'rgba(255,255,255,0.35)'
```

Hardcodes de dark mode (blanco semi-transparente). En light mode estos colores se aproximan al fondo claro y desaparecen visualmente, violando WCAG AA.

## Variantes consideradas

1. **Cambiar a tokens del design system** (`var(--text-2)`, `var(--text-3)`) — RECOMENDADO. Funciona en ambos temas, WCAG AA garantizado, consistencia con el resto de la app.
2. Tokens condicionales por theme via JS (`useTheme()`) — over-engineered, los CSS tokens ya hacen esto.
3. Mantener hardcoded pero forzar fondo dark en `/indices` (volviendo a DESIGN.md §2 que dice "Educación es dark surface") — rompería el toggle Auto/Light/Dark que tienen las páginas educativas.

## Variante elegida: 1

**Justificación:**
- WCAG AA verificado (text-2 sobre #fafaf7 = 5.67, text-3 = 4.62, ambos ≥ 4.5).
- Cero JS, cero refactor.
- Alinea con design system canónico (`globals.css` líneas 45-48 y 78-81).

## Cambio aplicado

```diff
- const textMuted = 'rgba(255,255,255,0.55)'
- const textFaint = 'rgba(255,255,255,0.35)'
+ const textMuted = 'var(--text-2)'
+ const textFaint = 'var(--text-3)'
```

## Decisión no incluida (follow-up potencial)

Hay 7 hardcodes adicionales de `rgba(255,255,255,0.03/0.04)` para backgrounds de cards en la misma página. En light mode (bg #fafaf7) son casi imperceptibles pero NO rompen WCAG (no son texto). Decisión cosmética futura: usar `var(--bg-surface)` o tokens transparentes adaptativos. Fuera del scope de este fix mínimo.

## Verificación post-fix

- ✅ WCAG AA matemático verificado en ambos modos
- ✅ tsc 0 errors
- ✅ build OK
- ✅ pre-push hook (tsc + tests + build + schema verify) OK

Cierra `235c7de5`, `92e50df5`, `9b246190`.
