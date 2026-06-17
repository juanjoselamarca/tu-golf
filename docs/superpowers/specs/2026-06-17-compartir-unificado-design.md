# Spec — Sistema "Compartir" unificado

Fecha: 2026-06-17 · Branch: `feat/compartir-unificado-claude` · Autor: Claude (CTO)
Auditoría base: `docs/superpowers/specs/2026-06-17-compartir-unificado-auditoria.md`
Alcance aprobado por Juanjo: **rediseño completo de TODO** (tarjeta PNG + sheets +
botones + QR), no solo fix de bugs.

## Objetivo

UN sistema de compartir: una fuente de payload, un primitivo de UI, un motor de imagen
modular, coherente y premium en todas las superficies, CERO FALLOS. Se eliminan las ~6
implementaciones independientes actuales.

## Decisiones de producto (aprobadas)

- **A — Acción única.** Un solo botón "Compartir" por contexto → abre un sheet con la
  tarjeta-imagen en preview arriba y debajo las acciones en orden fijo:
  `Compartir imagen` (primario) · `WhatsApp` · `Copiar link` · `Más opciones` (nativo).
  Mismo sheet en todas las superficies. `QRModal` se absorbe como opción del sheet de
  torneo ("Mostrar QR").
- **B — Emoji → marca.** Se reemplazan 🏆🥈🥉🤝🥇 por marcas SVG/canvas doradas de
  línea fina propias (trofeo/medalla/empate). Sin emoji del OS en la tarjeta.
- **C — Tagline única.** "El golf amateur en español" en toda la tarjeta (se elimina la
  segunda variante "Primera plataforma de golf en español").

## Arquitectura

### 1. Dominio — `src/golf/share/` (puro, TDD, sin DOM/React)

```
src/golf/share/
  types.ts            # SharePayload, ShareImageSpec
  payload.ts          # buildRoundShare / buildTournamentShare / buildLiveShare
                      # buildInviteShare / buildOrganizerShare
  vs-par.ts           # computeVsPar(scores, parMap) — fuente ÚNICA (arregla OG bug)
  copy.ts             # textos de share (con tildes correctas), centralizado
  card/               # motor de imagen (refactor de share-card.ts, <300 LOC c/u)
    index.ts          # generarShareCard(spec) -> Blob
    base.ts           # fondo, bordes, logo, divisores
    scorecard.ts      # tabla de 9/18 hoyos + símbolos Garmin
    badges.ts         # holes badge, formato badge
    marks.ts          # NUEVO: trofeo/medalla/empate dorados (reemplazo de emoji)
    templates.ts      # dibujarRondaLibre / dibujarTorneo
    palette.ts        # paleta de la tarjeta (un solo lugar)
```

`SharePayload = { title: string; text: string; url: string; image?: ShareImageSpec }`.
`ShareImageSpec` describe qué dibujar (datos), no cómo (el motor decide). La lógica de
ganador/empate/medallas/vs-par sale de los componentes y vive acá una sola vez.

**Datos:** los builders reciben datos ya cargados (no acceden a Supabase). Donde un
componente hoy hace fetch directo para armar el share, se mueve a `src/lib/data/` la
función de lectura correspondiente.

### 2. UI — `src/components/share/`

```
src/components/share/
  useShare.ts         # hook: cascada canShare({files}) -> share(file) -> share(url)
                      #       -> WhatsApp -> clipboard; estados idle/loading/done/error
  ShareSheet.tsx      # sheet único (tokens, dark OK, z-index del sistema, preview img)
  ShareButton.tsx     # botón estándar (tokens, variantes: solid/outline)
  ShareToast.tsx      # feedback único (reemplaza alert() y la copia silenciosa)
```

Cascada de `useShare` (única, determinista):
1. Si hay `image` y `navigator.canShare({files})` → `navigator.share({files,text})`.
2. Si no, y `navigator.share` existe → `navigator.share({text,url})`.
3. Si no → abrir `wa.me` con texto+url.
4. Si `wa.me` no abre → copiar al portapapeles + toast "Copiado".
`AbortError` (usuario canceló) = no-op silencioso, sin toast de error.

### 3. OG metadata

`computeVsPar` de `src/golf/share/vs-par.ts` se consume desde:
- `src/app/tarjeta/[id]/layout.tsx` (arregla el par fijo 36/72 → par real).
- `src/app/ronda-libre/[codigo]/layout.tsx` (reemplaza su `calcVsPar` local).

## Superficies a migrar (todas consumen el primitivo)

| Superficie | Reemplazo |
|---|---|
| `share-card.ts` `compartirResultado/Leaderboard` | `useShare` + `buildRoundShare`/`buildTournamentShare` |
| `ShareSheet.tsx` (ui) | nuevo `share/ShareSheet.tsx` |
| `ShareRoundButton.tsx` | `<ShareButton>` + `buildRoundShare` |
| `ShareResultsButton.tsx` | `<ShareButton>` + `buildTournamentShare` |
| `ronda/ShareMenu.tsx` | `<ShareSheet>` + `buildLiveShare` (fix dark) |
| `CopyLinkButton.tsx` | `<ShareButton variant=outline>` + `buildOrganizerShare` |
| `InvitarAmigos.tsx` | `<ShareButton>` + `buildInviteShare` |
| `QRModal.tsx` | opción "Mostrar QR" dentro del ShareSheet de torneo |
| `ronda-libre/nueva` TODO (línea 426) | migrar a `<ShareSheet>` |

## Plan de diseño visual (Fase 2 continúa)

`design-shotgun` (3-4 variantes) para: el ShareSheet, la tarjeta PNG de ronda, la
tarjeta PNG de torneo, y el QR/invitar. Evaluación objetiva: DESIGN.md, WCAG AA,
consistencia, mobile-first, premium. Converger a UNA dirección → `frontend-design`
→ `design-review`.

## Bugs que cierra (de la auditoría)

1. OG vs-par incorrecto (`tarjeta/[id]/layout.tsx:25`). **P0.**
2. Dark mode roto (`ShareMenu.tsx`).
3. URL hardcodeada en 4 archivos → `SITE_URL` único.
4. Copy "gano"/"quedo" sin tilde; tagline doble.
5. 5 fallbacks divergentes + `alert()` → cascada única + toast.
6. canShare inconsistente → un solo criterio.
7. Inconsistencia visual (radios/alphas/z-index) → tokens + sistema.

## Migración incremental (CERO FALLOS)

Orden: (1) dominio `src/golf/share/` + tests → (2) `useShare` + primitivos →
(3) migrar UNA superficie (ronda libre, la más usada) y validar visual+tests →
(4) fan-out al resto. Si el diff supera ~lo razonable, partir en PRs por grupo.
Cada superficie: idéntica o mejor que el baseline en comportamiento.

## Verificación

`/pre-push` (tsc+tests+build+canarios) → smoke Playwright por superficie (before/after)
→ `design-review` → `superpowers:code-reviewer` sobre el diff → flujo "como en torneo"
→ limpiar datos de prueba. Reporte final: bugs cerrados, antes/después, LOC de
`share-card.ts`, escala 1-10.

## Testing

- TDD en `src/golf/share/`: `payload.test.ts` (copy, vs-par, ganador/empate por
  formato: stroke/stableford/match/equipos), `vs-par.test.ts` (par real vs fijo,
  9/18 hoyos, hoyos incompletos).
- `useShare`: tests de la cascada con `navigator.share`/`canShare` mockeados
  (presente/ausente/AbortError/clipboard).
- Canario anti-regresión: ninguna superficie de share importa `navigator.share`
  directo (todo vía `useShare`).
