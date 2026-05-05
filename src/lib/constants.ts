/**
 * Constantes de negocio de Golfers+
 * Centralizadas para evitar valores hardcodeados en múltiples archivos.
 * Usar env vars cuando estén disponibles, con fallback a defaults.
 */

// Contacto y soporte
export const WHATSAPP_URL = process.env.NEXT_PUBLIC_WHATSAPP_URL || 'https://wa.me/56912345678'
export const VAPID_CONTACT = process.env.VAPID_CONTACT_EMAIL || 'mailto:juanjoselamarca@gmail.com'
