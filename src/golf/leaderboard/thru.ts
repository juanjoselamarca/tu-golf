// src/golf/leaderboard/thru.ts
//
// "Thru" en un marcador de golf — fuente única.
//
// Convención del PGA Tour (verificada 29-sep-2026): Thru = hoyos TERMINADOS en
// la ronda en curso. Quien terminó el hoyo 3 y juega el 4 está "Thru 3"; al
// terminar la ronda se muestra "F" (Finished). No es el hoyo que se está jugando.

/** Hoyos terminados → "3" · "F" si terminó la ronda · "—" si no empezó. */
export function formatThru(holesCompleted: number, holeCount: number): string {
  if (holeCount > 0 && holesCompleted >= holeCount) return 'F'
  if (holesCompleted <= 0) return '—' // em dash: no se confunde con "−1" bajo par
  return String(holesCompleted)
}

/** Rótulo de la columna/indicador de avance en marcadores. */
export const THRU_LABEL = 'Thru'
