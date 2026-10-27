// src/lib/fecha-chile.ts — La fecha calendario de hoy en Chile, independiente de la zona del servidor (UTC en Vercel).

/** Hoy en Chile como AAAA-MM-DD. Entre las 21:00 y la medianoche UTC ya es "mañana": esto no. */
export function hoyEnChile(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}
