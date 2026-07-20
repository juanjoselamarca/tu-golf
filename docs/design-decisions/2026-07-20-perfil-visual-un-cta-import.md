# perfil-visual-un-cta-import — Decisión de diseño

**Fecha:** 2026-07-20
**Reporte origen:** `inbox_reports.id` = `ebac8a5e-92b4-404b-91cf-3d099fb0cf02` ("Revisa el visual de la pagina perfil")
**PR:** #270 — https://github.com/juanjoselamarca/tu-golf/pull/270

---

## Problema (1 línea)

Reporte vago ("revisa el visual de /perfil"). Auditoría visual (mobile 390px, light) reveló dos cosas: (1) en estado vacío la pantalla mostraba DOS CTAs `Importar historial →` idénticos a `/importar` — `CpiCard` "Activa tu CPI™" + `SyncHistorialBlock` "Trae tu historial completo"; (2) el aviso "notificaciones bloqueadas" usaba rojo de alarma mientras su hermano ("navegador no soportado") usa ámbar.

## Variantes consideradas

No se corrió `design-shotgun` (necesita OPENAI_API_KEY ausente, y ambos cambios están dictados por precedentes de DESIGN.md, no son exploración abierta). Para el doble CTA (P6) se evaluaron dos formas de deduplicar:

### Variante A — Ocultar `SyncHistorialBlock` en estado vacío (elegida)
`SyncHistorialBlock` se renderiza solo cuando `cpiData?.status !== 'insufficient_data'`. En estado vacío la `CpiCard` "Activa tu CPI™" es el único (y contextual) CTA de import; con CPI activo/sin data, la `CpiCard` no muestra botón y `SyncHistorialBlock` es el único punto de import.

### Variante B — Quitar el botón de la `CpiCard` empty-state, dejar solo `SyncHistorialBlock`
Deja la `CpiCard` como explicador sin acción y `SyncHistorialBlock` como único CTA siempre.

## Evaluación objetiva

| Criterio | A | B |
|---|---|---|
| Cumple `DESIGN.md` (P6 un concepto una fuente, §5 un commit por vista) | ✅ | ✅ |
| WCAG AA contraste | ✅ | ✅ |
| Consistency con componentes shared | ✅ | ✅ |
| Mobile-first | ✅ | ✅ |
| Premium / no AI-slop | ✅ | ✅ |
| Preserva conversión (CTA contextual en el momento de activación) | ✅ | ❌ (pierde el CTA junto a "Activá tu CPI") |

## Elegida

**Variante A.**

## Razón objetiva (no estética)

Ambas satisfacen P6 ("dos representaciones del mismo dato en una pantalla es redundancia"). A gana porque preserva el CTA de import **en el momento contextual** (la card que explica que CPI necesita 5+ rondas ES el mejor lugar para pedir el import), sin romper el estado activado (donde `SyncHistorialBlock` sigue siendo el único punto de import). Resultado: exactamente un CTA `Importar historial →` en todos los estados. Verificado en prod: el bloque duplicado desaparece y la página queda más corta (5026→4600px).

El warning ámbar es aplicación directa de P3 (un tono cargado de significado — rojo = error/double-bogey — no debe usarse para un aviso advisory) + consistencia con el warning hermano ya ámbar del mismo componente.

## Lecciones / patrón reutilizable

Cuando dos bloques distintos ofrecen el MISMO destino de acción (mismo href + mismo label) y su visibilidad depende de estado, gatear la visibilidad por estado para que nunca coexistan es preferible a mutilar uno de los dos: mantiene cada bloque íntegro en el estado donde SÍ es el canónico. Aplicación de DESIGN.md P6 a CTAs (no solo a displays de dato).
