# UpsellCard — variante "Escalonada" (30-sep-2026)

Reporte inbox f83156b1 ("error en diseño al crear torneo (gate)").

- **Problema:** `UpsellCard` usaba un overlay `absolute` sobre una caja vacía de 160px con `overflow: hidden`; con badge + título + descripción + CTA de 44px el contenido se recortaba (reporte del wizard en desktop; 1px cortado en /perfil/stats a 390px) y en modo claro el slab navy al 65% se leía como bloque gris deshabilitado.
- **Variantes:** A vitrina centrada (pila actual como tarjeta real, hairline oro, CTA outline) · B fila dividida (valor izq / CTA sólido der, apila en móvil) · C escalonada (compact = fila 54px, medium = tarjeta alineada a la izquierda con badge junto al título y CTA outline, full = sección Playfair con el único CTA sólido).
- **Elegida: C.** Única que cumple DESIGN.md §5 "un commit dorado por vista" en todos los usos (B pone oro sólido junto al "Publicar" del wizard y dentro de la ronda) y que integra la silueta de las cards del wizard (A conserva la composición de modal y deja el CTA en 127px de ancho en móvil vs 320px).
- **Medido:** texto 16.87 / 5.93:1 claro, 14.27 / 7.03:1 oscuro; CTA outline (texto y borde `--brand-on-bg`) 5.06 / 6.47:1; CTA sólido y badge 7.35:1; CTA 44px; 0 overflow en 72 mediciones. Rechazos por medición: ghost sobre `--surface-soft` daba 4.43:1 (→ `--bg-surface`) y borde outline al 55% daba 1.66:1 (→ `--brand-on-bg`).
- **Anidado:** un contenedor con marco propio (AssistantHero) declara `--upsell-border: transparent` / `--upsell-shadow: none` y el upsell hereda; sin props nuevos. Gotcha: `@container` se lee desde el hijo, nunca desde el root que declara `container-type`.

Implementación: `src/components/billing/UpsellCardPremium.tsx` + `UpsellCard.module.css`. Variantes y screenshots del proceso en el PR.
