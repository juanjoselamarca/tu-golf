# Follow-up — Cap de net-double-bogey (adjusted gross)

**Estado:** diferido fuera de `import-hardening` (2026-06-06). Documentado para una ola futura.
**Relacionado:** [[project_coach_hybrid_model_decision]], spec `2026-06-03-import-hardening-design.md`.

## Qué es y por qué importa

WHS calcula el Score Differential sobre el **adjusted gross score**, no sobre el
gross crudo: cada hoyo se capa a **net double bogey** (par + 2 + golpes de hándicap
del hoyo). Hoy `calcularDiferencial` (`src/lib/indice-golfers.ts`) usa `totalGross`
crudo. Un hoyo catastrófico (ej. un 12 en un par 4) infla el diferencial.

Caso real verificado en prod: una ronda de 9h de Juanjo (58 golpes) produjo
diferencial **35.61** sin capar.

## Por qué quedó FUERA de import-hardening

1. **No afecta el índice.** El RPC `calcular_indice_golfers` toma los **mejores 8**
   de 20. Una ronda con un diferencial inflado (porque tuvo un desastre) nunca
   entra al best-8 → no mueve el índice. El daño es solo de **display** (lo que
   muestra el coach / el desglose).
2. **Requiere datos por hoyo que no todas las fuentes traen.** Para capar a net
   double bogey hace falta: par por hoyo (`par_per_hole`) **y** golpes de hándicap
   por hoyo (stroke index del hoyo) **y** el course handicap del jugador en esa
   ronda. El histórico no guarda el course handicap por ronda, y muchas fuentes de
   import no traen stroke index por hoyo.
3. **Es correctness transversal**, no parte de la identidad/tee que ataca esta ola.

## Diseño propuesto (ola futura)

- **Imports NUEVOS:** computar el adjusted gross al guardar, usando:
  - `par_per_hole` (ya disponible vía `course_holes`/OCR).
  - `stroke_index` por hoyo desde `course_holes`.
  - course handicap = `round(índice_vigente × slope/113 + (CR − par))` (o la
    fórmula WHS exacta validada contra el Manual 2024).
  - net double bogey por hoyo = `par_hoyo + 2 + strokes_recibidos_en_el_hoyo`.
  - `adjusted_gross = Σ min(score_hoyo, net_double_bogey_hoyo)`.
  - El diferencial sale del adjusted gross, no del gross crudo.
- **Histórico:** NO recapar retroactivamente (no tenemos course handicap por ronda
  fiable). Dejar el gross histórico como está; solo afecta display marginal.
- **Una sola implementación:** el cap vive en `calcularDiferencial` canónico
  (parámetro opcional `adjustedGross` o `holeData`), no duplicado.

## Criterio de cierre

- Caso del 58 en 9h: diferencial capado, no 35.61.
- Test unit con un hoyo catastrófico (12 en par 4) que no infla el diferencial.
- Validado contra el WHS Manual 2024 ([[reference_usga_pdfs_gratis]]).
