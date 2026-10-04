'use client'

import type { ConexionScorer } from '../hooks/useRondaGrupoData'
import { loginUrl } from '@/lib/auth/login-url'

/**
 * Aviso del scorer cuando el servidor no tiene los golpes al día.
 *
 * Caída del 04-oct-2026 (torneo Los Leones): el marcador no sabía si sus golpes
 * estaban a salvo y la app lo sacaba de la ronda. Ahora el scorer sigue anotando
 * en el teléfono y este aviso dice exactamente eso, en una línea, sin bloquear.
 * Devuelve null si todo está al día.
 */
export function textoConexionScorer(conexion: ConexionScorer, pendienteDeEnvio: boolean): string | null {
  if (conexion === 'sin_sesion') return 'Tu sesión expiró. Tus golpes quedan guardados en este teléfono.'
  if (conexion === 'sin_conexion' || pendienteDeEnvio) {
    return 'Sin conexión con el servidor. Tus golpes quedan guardados en este teléfono y se envían solos.'
  }
  return null
}

export function ConexionScorerBanner({
  conexion,
  pendienteDeEnvio,
  codigo,
}: {
  conexion: ConexionScorer
  pendienteDeEnvio: boolean
  codigo: string
}) {
  const texto = textoConexionScorer(conexion, pendienteDeEnvio)
  if (!texto) return null
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 14px', minHeight: '44px', flexShrink: 0,
        background: 'rgba(217, 119, 6, 0.14)',
        borderBottom: '1px solid rgba(217, 119, 6, 0.45)',
        color: 'var(--text)', fontSize: '13px', lineHeight: 1.35,
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706', flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{texto}</span>
      {conexion === 'sin_sesion' && (
        <a
          href={loginUrl(`/ronda-libre/${codigo}/score-grupo`)}
          style={{
            minHeight: '44px', display: 'inline-flex', alignItems: 'center',
            padding: '0 14px', borderRadius: '10px', flexShrink: 0,
            background: 'var(--brand)', color: 'var(--brand-dark)',
            fontWeight: 700, fontSize: '13px', textDecoration: 'none',
          }}
        >
          Iniciar sesión
        </a>
      )}
    </div>
  )
}
