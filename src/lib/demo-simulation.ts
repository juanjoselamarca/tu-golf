export const DEMO_PARS = [4,5,3,4,3,4,4,3,5,4,5,4,3,5,4,5,3,4]
export const DEMO_SI = [11,3,17,1,15,5,9,13,7,16,18,4,12,14,8,2,10,6]

export function generateHoleScore(
  indice: number,
  holeIndex: number,
  roundSeed: number,
  strokeIndex: number
): number {
  const par = DEMO_PARS[holeIndex]
  const seed = Math.abs(Math.sin(holeIndex * 7.3 + indice * 13.7 + roundSeed * 3.1 + strokeIndex * 0.5))

  const distributions: Record<number, number[]> = {
    1:  [0.01, 0.20, 0.60, 0.16, 0.03, 0.00],
    2:  [0.01, 0.18, 0.57, 0.20, 0.04, 0.00],
    3:  [0.00, 0.15, 0.55, 0.24, 0.05, 0.01],
    4:  [0.00, 0.12, 0.52, 0.27, 0.07, 0.02],
    5:  [0.00, 0.10, 0.48, 0.30, 0.09, 0.03],
    6:  [0.00, 0.08, 0.44, 0.33, 0.11, 0.04],
    7:  [0.00, 0.06, 0.40, 0.35, 0.14, 0.05],
    8:  [0.00, 0.05, 0.36, 0.37, 0.16, 0.06],
    9:  [0.00, 0.04, 0.32, 0.38, 0.18, 0.08],
    12: [0.00, 0.02, 0.22, 0.40, 0.24, 0.12],
  }

  const closestIndice = Object.keys(distributions).map(Number)
    .reduce((a, b) => Math.abs(b - indice) < Math.abs(a - indice) ? b : a)
  const probs = distributions[closestIndice] || distributions[12]

  let cumulative = 0
  const offsets = [-2, -1, 0, 1, 2, 3]
  let result = 0
  for (let i = 0; i < offsets.length; i++) {
    cumulative += probs[i]
    if (seed < cumulative) { result = offsets[i]; break }
  }

  return Math.max(1, par + result)
}
