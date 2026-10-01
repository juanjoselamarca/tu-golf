/** Chip corto bajo el número grande del scorer de grupo: Eagle / Birdie / Par / Bogey / +n. */
export function chipLabelCorto(diff: number): string {
  return diff <= -2 ? 'Eagle' : diff === -1 ? 'Birdie' : diff === 0 ? 'Par' : diff === 1 ? 'Bogey' : `+${diff}`
}
