/**
 * Cómo se LLAMA el plan del usuario en la UI — FUENTE ÚNICA.
 *
 * Hasta el 01-nov-2026 nadie leía el plan en las superficies que lo muestran:
 * la fila "Mi plan" del perfil pintaba `<ProBadge tier="pro" />` **a secas**, así
 * que los 48 usuarios de producción (todos free) leían que su plan era PRO. Un
 * tier sin dueño se convierte en una etiqueta inventada: el nombre del plan vive
 * acá y se deriva SIEMPRE del tier real.
 */
import { TIERS, type Tier } from './plans'

/** Cómo se escribe cada tier en la UI. `free` no lleva badge: lleva texto. */
export const NOMBRE_DE_PLAN: Record<Tier, string> = {
  free: 'Gratis',
  pro: 'PRO',
  pro_plus: 'PRO+',
}

/** ¿Es un plan de pago? Decide badge dorado (sí) vs texto plano (no). */
export function esPlanPago(tier: Tier): tier is Exclude<Tier, 'free'> {
  return tier !== 'free'
}

/**
 * Normaliza el `subscription_tier` que viene de la base a un `Tier` válido.
 *
 * Sin fila, `null`, o un valor que no está en `TIERS` → `free`. Nunca se castea
 * a ciegas: un tier basura no debe poder pintar un badge PRO.
 */
export function tierDePerfil(raw: unknown): Tier {
  return (TIERS as readonly string[]).includes(raw as string) ? (raw as Tier) : 'free'
}
