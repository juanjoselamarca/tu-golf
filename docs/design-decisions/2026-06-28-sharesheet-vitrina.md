# Design decision — ShareSheet "Vitrina" (variante A)

**Fecha:** 2026-06-28 · **Decisión:** Juanjo (PM) eligió variante A tras design-shotgun.
**Contexto:** sistema "compartir unificado" (spec `2026-06-17-compartir-unificado-design.md`).
**Mockups:** `~/.gstack/projects/juanjoselamarca-tu-golf/designs/sharesheet-20260628/` (variant-A..D.png + render.mjs).

## Por qué A

- Jerarquía de botones mapea EXACTO a DESIGN.md §5 (`commit` dorado sólido → `nav` outline → `ghost`).
- La tarjeta PNG es el héroe (marco hairline dorado), lectura premium e inequívoca.
- Targets ≥44px (D fallaba el touch con links chicos; descartada por eso).

## Anatomía a implementar (`src/components/share/ShareSheet.tsx`)

Bottom-sheet modal (patrón `TournamentBottomSheet`), fondo dark navy (`--bg #070d18`),
borde sup. hairline dorado, grab handle. Mobile-first 390px.

```
┌─────────────────────────────┐
│            ▬ (handle)        │
│         Compartir            │  ← font-display (Playfair), centrado
│  ┌───────────────────────┐  │
│  │  [preview PNG]        │  │  ← SharePayload.image (blob→objectURL)
│  │  marco 1px gold,      │  │     borde rgba(196,153,42,.55), sombra
│  │  radius 16, sombra    │  │     fallback sin imagen: ocultar marco
│  └───────────────────────┘  │
│  [ Compartir imagen ]       │  ← Button variant="commit" fullWidth, icon Share2
│  [ WhatsApp        ]        │  ← Button variant="nav", icon MessageCircle
│  [ Copiar link     ]        │  ← Button variant="nav", icon LinkIcon
│       Más opciones          │  ← Button variant="ghost", icon MoreVertical
└─────────────────────────────┘
```

## Acciones (cada botón = acción explícita, reusar canónicos)

| Botón | Acción | Fuente canónica |
|---|---|---|
| Compartir imagen | cascada `useShare.share(payload)` (con imagen) | `components/share/useShare.ts` |
| WhatsApp | abrir `wa.me` con texto+url | extraer `whatsappUrl(payload)` al dominio (hoy inline en `runShareCascade`) → un solo lugar |
| Copiar link | `copyToClipboard(url)` + toast | `lib/clipboard.ts` |
| Más opciones | `navigator.share({title,text,url})` nativo | `useShare` (paso 2) o handler directo |

**Nota arquitectura:** el sheet necesita acciones más granulares que la cascada única.
Extender `useShare` aditivamente para exponer métodos granulares
(`shareImage`/`whatsapp`/`copyLink`/`native`) reusando los helpers, o que el sheet
llame handlers finos sobre los canónicos. Decidir en la implementación; NO duplicar
el formato `wa.me` (extraerlo a `golf/share`).

## Falta para cerrar la pieza visual

- `ShareSheet.tsx` (esta decisión) + `ShareButton.tsx` (trigger) + `ShareToast.tsx` ("Copiado").
- Reemplazar `src/components/ui/ShareSheet.tsx` (viejo) en la migración de superficies.
- `design-review` con before/after tras implementar.
