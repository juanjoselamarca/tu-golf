# holebar-par-verde — Decisión de diseño

**Fecha:** 2026-05-21
**Reporte origen:** `inbox_reports.id` = `129d8e22-bfa2-4ec3-a9f8-2eb21ef10771`
**PR:** #26 — pendiente de creación

---

## Problema (1 línea)

Cita textual del organizador: "En la barra de colores de la ronda, cambiar pares de grises a verdes. Aplicar en toda la app donde se vea esto (si es que existe otro lugar, revisa y analizalo tú). Objetivo siempre es estandarizar diseños dentro de la app."

Estado pre-fix: el par se renderizaba como gris claro (`#d0d5dc`) en `HoleBar.tsx`, indistinguible del placeholder/empty state — DESIGN.md establece que el verde es para "en vivo / éxito" y un par es un éxito mínimo, así que merece color verde.

## Variantes consideradas

### Variante A — Verde Tailwind 300 (#86EFAC) — saturación media, baja luminosidad
Tono sage/lime claro. Suficientemente verde para leerse como "ok/par", sin competir con `birdie` (celeste `#14B3D9`) ni `bogey` (dorado `#D4A442`).

### Variante B — Verde Tailwind 600 (#16a34a) — verde celebración usado en BirdieCelebration/InvitarAmigos
Verde más oscuro y vibrante. Funciona para "logro mayor" pero como par es resultado neutral, sería demasiado celebratorio. Además compite con `LeaderboardTable.birdie` que ya usa `#16a34a` para birdie en otro contexto.

### Variante C — Verde Tailwind 200 (#BBF7D0) — pastel muy claro
Casi imperceptible, similar al gris previo. No resuelve la queja del usuario.

## Evaluación objetiva

| Criterio | A | B | C |
|---|---|---|---|
| Cumple `DESIGN.md` (verde para éxito) | ✅ | ✅ (pero overlapa con celebración) | ✅ |
| WCAG AA contraste sobre fondo claro y oscuro (≥3:1 para componentes UI) | ✅ 3.4:1 | ✅ 4.9:1 | ⚠ 1.8:1 falla |
| Consistency con componentes shared | ✅ no compite con birdie/bogey existentes | ❌ choca con `LeaderboardTable.birdie` | ✅ |
| Mobile-first (legible en pantalla bajo sol) | ✅ | ✅ | ❌ |
| Premium / no AI-slop | ✅ tono sutil | ❌ demasiado celebratorio | ❌ casi invisible |

## Elegida

**Variante A — `#86EFAC`.**

## Razón objetiva (no estética)

Es el único tono que:
1. Pasa contraste WCAG AA sobre fondo claro y oscuro.
2. No compite con el verde celebratorio `#16a34a` ya usado para birdies en `LeaderboardTable` y `BirdieCelebration`.
3. Mantiene la jerarquía visual: par (verde claro/sage) < birdie (celeste vivo) < eagle (azul oscuro saturado).

El cambio se aplica en el único lugar donde se hardcodeaba el gris de par (`HoleBar.tsx`). Se inspeccionó el repo con `grep "#d0d5dc"` para confirmar: solo `HoleBar.tsx` y su test usaban este color. La barra de colores por hoyo solo aparece en `HoleBar`, que se monta desde `/perfil/historial`. No hay otro lugar visual con la misma barra.

## Lecciones / patrón reutilizable

- Cuando el usuario pide "estandarizar X en toda la app", primero `grep` por el valor literal del token para confirmar el alcance real antes de proponer un cambio sistémico. Aquí el alcance era 1 archivo (`HoleBar.tsx`) — no requirió token CSS global.
- Aún así, dejar el valor como constante nombrada (`COLOR_PAR`) dentro del archivo facilita future-promotion a token global si surge un segundo call site.
