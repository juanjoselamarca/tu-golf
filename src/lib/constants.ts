/**
 * Constantes de negocio de Golfers+
 * Centralizadas para evitar valores hardcodeados en múltiples archivos.
 * Usar env vars cuando estén disponibles, con fallback a defaults.
 */

// tAIger — coach de golf IA
export const TAIGER_FREE_MONTHLY_LIMIT = parseInt(process.env.TAIGER_FREE_MONTHLY_LIMIT || '3', 10)

// Contacto y soporte
export const WHATSAPP_URL = process.env.NEXT_PUBLIC_WHATSAPP_URL || 'https://wa.me/56912345678'
export const WHATSAPP_TAIGER_PREMIUM_URL = `${WHATSAPP_URL}?text=Quiero%20tAIger%2B%20Premium`
export const VAPID_CONTACT = process.env.VAPID_CONTACT_EMAIL || 'mailto:juanjoselamarca@gmail.com'
