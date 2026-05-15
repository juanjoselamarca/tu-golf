# pga-widget-light-mode — Decisión de diseño

**Fecha:** 2026-05-15
**Reporte origen:** `inbox_reports.id` = `c0f1bd6f-40b6-4ec2-a417-aca8a10a8648`
**PR:** #13 — https://github.com/juanjoselamarca/tu-golf/pull/13

---

## Problema (1 línea)

En light mode los nombres de jugadores del widget PGA quedaban invisibles (texto oscuro sobre fondo navy). Caption del reporte: "Error en el widget pga en light mode".

## Variantes consideradas

### Variante A — Mantener widget brand-locked dark (elegida)
Reemplazar el único token theme-aware (`var(--text)`) por una constante con el ivory ya usado en HeroSection h1 (`#edeae4`). El widget ya estaba diseñado como always-dark (hardcoded `#0e1c2f` background + 20+ usos de `rgba(255,255,255,*)`). Esta variante alinea el único leak con el resto del componente.

### Variante B — Widget theme-aware completo
Refactorizar para que el widget tenga fondo claro en light mode y oscuro en dark. Implicaría: (1) reemplazar ~25 colores hardcoded por tokens, (2) ALSO refactorizar `HeroSection` que actualmente fuerza fondo dark (`#070d18`) en ambos temas, (3) revisar contraste WCAG de los score colors (`#00e676`/`#ff1744`) sobre fondo claro — ambos fallan ratio en light mode.

### Variante C — Definir tokens `--pga-*` theme-aware en `globals.css`
Crear set de tokens locales del widget que cambian con theme (`--pga-bg`, `--pga-text`, etc.) y refactorizar todo el widget para usarlos. Misma blast radius que B pero sin tocar HeroSection — el problema es que el widget seguiría viéndose CLARO dentro de una HeroSection siempre OSCURA (peor que el bug original).

## Evaluación objetiva

| Criterio | A (elegida) | B | C |
|---|---|---|---|
| Cumple `DESIGN.md` (paleta, tipo, spacing, touch ≥44px) | ✅ | ✅ | ✅ |
| WCAG AA contraste — ratio `#edeae4` sobre `#0e1c2f` = 13.4:1 | ✅ | ⚠️ (score colors fail en light) | ⚠️ (mismatch contexto/widget) |
| Consistency con componentes shared | ✅ (sigue patrón "dark cards en light bg" de globals.css §SECTIONS LIGHT-CARD) | ❌ (refactor de HeroSection cambia identidad de landing) | ❌ (widget claro en hero oscuro) |
| Mobile-first | ✅ | ✅ | ✅ |
| Premium / no AI-slop | ✅ (mantiene aesthetic PGA TOUR oficial dark) | ⚠️ (refactor profundo riesgo cuello de botella histórico de iteraciones) | ❌ |
| Scope del cambio (proxy de riesgo) | 1 línea + 1 const + 1 comment | ~80 LOC widget + ~30 LOC hero | ~80 LOC widget |

## Elegida

**Variante A.**

## Razón objetiva (no estética)

1. **Comentario in-source autoritativo en `globals.css` línea 275-279**: "SECTIONS LIGHT-CARD: en pantallas con fondo blanco/light, los componentes compartidos que originalmente eran dark NO se tocan — siguen siendo cards oscuras con texto claro. (HeroSection ya forza fondo dark)". Esto define el contrato arquitectónico: este widget es uno de esos casos. La variante A respeta el contrato; B/C lo violan.
2. **Branding PGA TOUR**: la identidad visual oficial de scoreboards PGA es dark navy + texto claro + scoring verde/rojo. Aplica tanto a la web del PGA Tour como a ESPN. El widget reproduce esa identidad — flipear a light mode rompería el reconocimiento.
3. **Blast radius / riesgo**: A es 1 línea de fix + 1 constante con comment-warning. B/C requieren refactor de 2 componentes + revalidación de contraste de los score colors. CERO TOLERANCIA A FALLOS (CLAUDE.md) favorece el cambio mínimo correcto.

## Lecciones / patrón reutilizable

**Widgets brand-locked (siempre dark independiente del theme global)** deben:
1. NO usar `var(--text)` ni ningún token theme-aware para texto del widget — esos tokens cambian con el tema global y el widget quedará inconsistente consigo mismo en uno de los dos modos.
2. Usar constantes hardcoded con comentario explícito al tope del archivo explicando el contrato.
3. Documentar el contrato en `globals.css` adyacente al comment de `SECTIONS LIGHT-CARD`.

Aplicable a futuro a: cualquier widget que reproduzca branding externo (PGA, ESPN, federación, etc.) o cualquier card "hero" oscura embebida en páginas que respetan el toggle de tema.

## Cobertura del bug

El widget tiene varios estados (loading skeleton, sin-torneo, pre-start, live). Auditoría posterior al fix confirmó:
- `var(--text)` aparecía **una sola vez** (línea 299, nombres de jugadores en estado "live").
- Todos los demás colores ya eran hardcoded white-on-dark, por lo que el bug solo se manifestaba en el estado live.
- Conmutación `[data-theme="light"]` → `dark` ya no afecta el widget. Verificado en bundle deployado (`#edeae4` presente).
