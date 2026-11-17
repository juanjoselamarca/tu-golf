'use client'

import type { ConexionScorer } from '../hooks/useRondaGrupoData'
import { avisoSesionCerrada } from '@/lib/auth/aviso-sesion-cerrada'

/**
 * Aviso del scorer cuando el servidor no tiene los golpes al día.
 *
 * Caída del 04-oct-2026 (torneo Los Leones): el marcador no sabía si sus golpes
 * estaban a salvo y la app lo sacaba de la ronda. Ahora el scorer sigue anotando
 * en el teléfono y este aviso dice exactamente eso, en una línea, sin bloquear.
 * Devuelve null si todo está al día. Sin sesión, el copy es el canónico de los scorers (`avisoSesionCerrada`):
 * abierta ya sin sesión (`conexion === 'sin_sesion'`) va "Inicia sesión para guardar"; perdida en plena ronda
 * (`sesionPerdida`: un envío rebotó y el teléfono ya no la tiene), "Tu sesión se cerró".
 */
export function avisoSinSesionGrupo(codigo: string, conexion: ConexionScorer, sesionPerdida: boolean) {
  if (!sesionPerdida && conexion !== 'sin_sesion') return null
  return avisoSesionCerrada(`/ronda-libre/${codigo}/score-grupo`, { habiaSesion: sesionPerdida && conexion !== 'sin_sesion' })
}

export function textoConexionScorer(
  conexion: ConexionScorer, pendienteDeEnvio: boolean, codigo: string, sesionPerdida = false,
): string | null {
  const aviso = avisoSinSesionGrupo(codigo, conexion, sesionPerdida)
  if (aviso) return `${aviso.titulo}. ${aviso.detalle}`
  if (conexion === 'sin_conexion' || pendienteDeEnvio) {
    return 'Sin conexión con el servidor. Tus golpes quedan guardados en este teléfono y se envían solos.'
  }
  return null
}

export function ConexionScorerBanner({
  conexion,
  pendienteDeEnvio,
  codigo,
  sesionPerdida = false,
}: {
  conexion: ConexionScorer
  pendienteDeEnvio: boolean
  codigo: string
  sesionPerdida?: boolean
}) {
  const texto = textoConexionScorer(conexion, pendienteDeEnvio, codigo, sesionPerdida)
  if (!texto) return null
  const sinSesion = avisoSinSesionGrupo(codigo, conexion, sesionPerdida)
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 14px', minHeight: '44px', flexShrink: 0,
        background: 'rgba(217, 119, 6, 0.14)',
        borderBottom: '1px solid rgba(217, 119, 6, 0.45)',
        color: 'var(--text)', fontSize: '14px', lineHeight: 1.35,
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706', flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{texto}</span>
      {sinSesion && (
        <a
          href={sinSesion.href}
          style={{
            minHeight: '44px', display: 'inline-flex', alignItems: 'center',
            padding: '0 14px', borderRadius: '10px', flexShrink: 0,
            background: 'var(--brand)', color: 'var(--brand-dark)',
            fontWeight: 700, fontSize: '14px', textDecoration: 'none',
          }}
        >
          {sinSesion.cta}
        </a>
      )}
    </div>
  )
}
