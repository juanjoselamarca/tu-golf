/**
 * Fixtures del torneo Stableford Gross de Los Leones (04-oct-2026).
 *
 * Pares verificados contra prod (`course_holes` de `8f64cd3a…`, 04-oct 00:40) y contra la
 * tarjeta del club: 36/36 = 72. El stroke index es el de la BD (en gross no influye; si el
 * cálculo dependiera de él, los fixtures gross-vs-neto lo delatarían).
 */

export const PAR_LEONES: Record<number, number> = {
  1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5,
  10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5,
}

export const SI_LEONES_BD: Record<number, number> = {
  1: 17, 2: 5, 3: 14, 4: 1, 5: 11, 6: 15, 7: 4, 8: 7, 9: 10,
  10: 12, 11: 18, 12: 13, 13: 2, 14: 16, 15: 3, 16: 6, 17: 8, 18: 9,
}

export const HOYOS_LEONES = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: PAR_LEONES[i + 1],
  stroke_index: SI_LEONES_BD[i + 1],
}))

const PAR3 = [3, 6, 11, 15]
const PAR5 = [4, 9, 17, 18]

function tarjeta(golpes: (hoyo: number, par: number) => number): Record<string, number> {
  const s: Record<string, number> = {}
  for (let h = 1; h <= 18; h++) s[String(h)] = golpes(h, PAR_LEONES[h])
  return s
}

/** A: par en los 18 → 36 pts. B: bogey en los 18 → 18. C: doble bogey en los par 3 → 28. D: birdie en los par 5 → 40. */
export const TARJETAS_LEONES = {
  A: tarjeta((_, par) => par),
  B: tarjeta((_, par) => par + 1),
  C: tarjeta((h, par) => (PAR3.includes(h) ? par + 2 : par)),
  D: tarjeta((h, par) => (PAR5.includes(h) ? par - 1 : par)),
}

export const PUNTOS_ESPERADOS_LEONES = { A: 36, B: 18, C: 28, D: 40 } as const
