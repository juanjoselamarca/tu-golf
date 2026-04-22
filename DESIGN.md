# Golfers+ · Design System

Fuente de verdad del diseño visual e interaccional. Cualquier decisión de UI que contradiga este documento necesita propuesta explícita al CTO antes de implementarse.

**Última revisión:** 22-abr-2026 — creado tras audit UI/UX general (`docs/audits/2026-04-22-ui-general.md`).

---

## 1. Target de usuario

Golfista amateur exigente de clubes chilenos. Usa la app en cancha bajo sol, con guante, entre hoyos, con apuro. Juega torneos reales donde cada error es costoso.

Implicancias de diseño:
- **Contraste WCAG AA mínimo** en todo texto operativo (scoring, leaderboard, inputs). Preferir AAA en datos críticos.
- **Touch targets ≥ 44×44 px**.
- **Tipografía numérica mono** para códigos, scores, yardajes, ratings (evitar ambigüedad `I/1`, `O/0`, `B/8`).
- **Cero ornament infantil.** Nada de emojis cartoon (🏆🤝🔄) en UI chrome. Usar `@/components/icons` (line icons lucide).

---

## 2. Contrato de modo claro / oscuro

Dos modos, regla explícita de cuándo entra cada uno. NO mezclar en misma viewport.

### Light (fondo claro)

Surfaces **operativas** — el usuario está haciendo algo que afecta su data.

- Dashboard, perfil, editar perfil
- Crear ronda (wizard completo)
- Scorear (ronda-libre, torneo)
- Leaderboard **de torneos que juegas**
- Historial propio, scorecards
- Admin

### Dark (fondo #070d18 navy)

Surfaces **de exhibición o marketing** — el usuario lee/explora, no edita.

- Landing pública (`/`)
- Educación (`/indices`, WHS, LABS)
- Leaderboard espectador de **torneos ajenos**
- Hero cards de marca (PGA embed, etc.)

### Error states

Heredan el modo del contexto que los dispara. Un 500 en flujo light es light; un 500 en landing es dark. El error `Algo salió mal` nunca es default dark.

### Transiciones

Cuando el usuario navega entre light y dark surfaces (ej: landing → dashboard post-login), el cambio es aceptable pero **nunca dos modos en mismo scroll**. Si una pantalla tiene secciones claras y oscuras, se rediseña.

---

## 3. Paleta

Definida en `src/app/globals.css` como CSS custom properties. NO inventar colores por componente.

| Token | Valor | Uso |
|-------|-------|-----|
| `--brand` | `#C4992A` | Gold. Acciones primarias, marca, métrica héroe, indicador activo único. Uso rationed — ver § 5. |
| `--bg` | `#070d18` | Deep navy. Fondo dark surfaces. |
| `--bg-surface` | `#0e1c2f` | Card / panel dark. |
| `--eagle` | `#3B82F6` | Scorecard eagle (-2+). **Solo en Scorecard**. |
| `--birdie` | `#EF4444` | Scorecard birdie (-1). **Solo en Scorecard**. Nota: el rojo acá es histórico Garmin-compliant — no es error. |
| `--par` | `#6B7280` | Scorecard par. Sin borde. |
| `--bogey` | `#C4992A` | Scorecard bogey (+1). Mismo gold que brand. |
| `--double` | `#DC2626` | Scorecard doble bogey+ (+2+). |

**Verde sólo para `en vivo / éxito`.** NO usar verde como "ON" de toggles (el audit P6 encontró verde + dorado para mismo estado). Ver § 5.

**Colores Garmin en scorecard:** fuente de verdad `src/lib/garmin-colors.ts`. NO modificar sin verificar contra captura real de Garmin Golf (CLAUDE.md).

---

## 4. Tipografía

Cuatro familias cargadas vía `next/font`:

| Variable CSS | Familia | Uso |
|--------------|---------|-----|
| `--font-dm-sans` | DM Sans | Body default, UI chrome, labels. |
| `--font-playfair` | Playfair Display (serif) | Headings display, nombres de canchas, títulos hero, números grandes narrativos (score final). |
| `--font-cormorant` | Cormorant Garamond | Serif alternativo. Uso restringido — editorial. |
| `--font-dm-mono` | DM Mono | **Códigos de ronda, yardajes, ratings, slopes, scores tabulares. Cualquier dato que se lea/dicte en cancha.** |

**Regla:** serif display para narrativa, mono para data, sans para chrome. Nunca serif display para un código de ronda o un input de yardaje.

**Size scale** (mobile-first, base 16px):
- hero display: 48–64 px serif
- h1 page: 32 px serif
- h2 section: 20 px serif
- body: 16 px sans
- caption: 12 px sans uppercase tracking-wider
- code/data: 14–18 px mono

---

## 5. Jerarquía de acciones — Button variants

Componente `@/components/ui/Button`. Cuatro variantes:

| Variant | Aspecto | Uso |
|---------|---------|-----|
| `commit` | Dorado sólido, texto negro | Acción irreversible / principal (crear ronda, guardar, empezar a jugar). Máximo UNA por vista. |
| `nav` | Dorado outline, texto dorado | Avanzar wizard, "Revisar", "Siguiente". Reversible. |
| `ghost` | Transparente, texto dorado | Acción terciaria, link-style. "Cómo funciona →", "Ver demo →". |
| `destructive` | Rojo sólido | Eliminar cuenta / cancelar con consecuencia. |

**Motivo:** el audit P14 encontró que todos los CTAs eran dorado sólido idéntico → el usuario no distingue peso de "Siguiente" vs "Crear ronda". Ahora sí.

**Diet del dorado:** dorado sólido es costoso visualmente. Solo para un CTA commit por vista + la marca. El resto es nav/ghost.

---

## 6. Componentes shared obligatorios

Vivienda única en `src/components/ui/`. NO reimplementar:

- `Button` (variantes arriba)
- `Toggle` (un solo color activo: dorado, ver § 3)
- `Stepper` (N steps numerados consistentes, `@/components/ui/Stepper`)
- `Input` (contraste WCAG AA + min 44px touch, ver `@/components/ui/Input`)
- `RoundCode` (display de código con DM Mono + separador visual + tap-to-copy)
- `LiveBadge` (indicador de ronda en vivo, inline en shell — NO floating)
- `ShareSheet` (compartir unificado — WhatsApp subordinado al sheet)
- Icons → `@/components/icons` (re-export curado de lucide-react)

---

## 7. Reglas de layout

### El shell de la app

- Topbar fija (altura 64px) con logo + menú + avatar.
- Bottom nav fijo (altura 64px + safe-area-inset-bottom).
- Contenido entre topbar y bottom nav.
- **NADA posicionado `fixed` que flote sobre el contenido**, salvo dialogs/sheets que son modales explícitos.
- El pill `LiveBadge` vive EN la topbar inline — reserva su propio espacio, no flota.

### Mobile-first

- Base: 360–430px (iPhone/Android standard).
- Tablet/desktop: max-width contenedor 640px salvo dashboards admin.
- `100dvh` para full-height (respetar teclados móviles).

---

## 8. Locale y copy

Español LatAm neutro. Ver CLAUDE.md § 6.

- `tú`, nunca `vos`.
- Spanglish golf ok: `birdie`, `bogey`, `handicap`, `stroke play`.
- Fechas: `21 abr 2026` (short) o `21 de abril de 2026` (long). Nunca `04/21/2026`.
- Utility: `@/lib/format` → `formatDate(d, 'short'|'long'|'input')`.

---

## 9. Códigos de ronda

Utility: `@/lib/round-code`.

- Alfabeto Crockford sin `I, O, L, 0, 1, B, 8`.
- Longitud 6.
- Display con separador cada 3 (`ABC D4F`).
- DM Mono obligatorio.
- `RoundCode` component con tap-to-copy + feedback.

---

## 10. Iconografía

- Todos los iconos vienen de `@/components/icons`.
- Cero emojis en botones, toggles, cards, nav.
- Emojis ok en contenido de usuario (chat, nombres libres, achievements celebratorios con animación propia — `BirdieCelebration`, etc.).

---

## 11. Protegido — protocolo estricto

Archivos con protocolo de modificación en CLAUDE.md:

- `src/components/Navbar.tsx`
- `src/app/layout.tsx`
- `src/middleware.ts`
- `src/lib/supabase.ts`

Cambios ahí requieren:
1. Aviso explícito de qué se cambia.
2. Cambio mínimo posible (no refactor gratuito).
3. `npm run test` + `npm run build` pre-commit.
4. Commit individual con solo ese archivo.

---

## 12. Revisión y evolución

Cualquier PR que viola una regla acá tiene que:
1. Proponer cambio al DESIGN.md primero.
2. Tener approval del CTO.
3. Actualizar este archivo en el mismo PR.
