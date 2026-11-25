'use client'

import type { ScorerTheme } from '@/components/ronda/scorer-theme'

interface GrupoNavBarProps {
  currentHoleIdx: number
  isLastHole: boolean
  canFinalize: boolean
  finalizing: boolean
  /** Tarjeta congelada (`tarjetaCongelada`: finalizando, descartando o cambiando quién anota): Finalizar no responde. */
  congelada: boolean
  onPrev: () => void
  onNext: () => void
  onFinalize: () => void
  /**
   * Último hoyo de quien NO cierra la ronda (un celular por equipo): en lugar de Siguiente, «Guardar hoyo N» confirma
   * el valor en pantalla. `guardado`: el hoyo ya tiene golpes en todas las tarjetas de este celular. `envio`: si esos
   * golpes ya están en el servidor. Guardado pero sin subir, el botón sigue activo como reintento («Enviar hoyo N»):
   * nunca dice «anotado ✓» con el golpe solo en el teléfono.
   */
  guardarUltimoHoyo?: { hoyo: number; guardado: boolean; envio?: EnvioDelHoyo; onGuardar: () => void }
  theme: ScorerTheme
}

export type EnvioDelHoyo = 'al_dia' | 'enviando' | 'pendiente'

/**
 * Si los golpes de este celular ya están en el servidor. La cola del teléfono (`hayPendientes`) es la fuente de verdad:
 * `fallo` solo cuenta los envíos fallidos de esta carga de la página, y al reabrir sin señal (iOS descarta la pestaña)
 * el último hoyo decía «anotado ✓» con el golpe solo en el teléfono.
 */
export function envioDelHoyo(input: { enviando: boolean; fallo: boolean; colaConPendientes: boolean }): EnvioDelHoyo {
  if (input.enviando) return 'enviando'
  return input.fallo || input.colaConPendientes ? 'pendiente' : 'al_dia'
}

/** Barra inferior del scorer de grupo: Anterior / Siguiente / Finalizar (o «Guardar hoyo N» en el último hoyo de quien no cierra). */
export function GrupoNavBar({
  currentHoleIdx, isLastHole, canFinalize, finalizing, congelada,
  onPrev, onNext, onFinalize, guardarUltimoHoyo, theme,
}: GrupoNavBarProps) {
  const finalizarInactivo = finalizing || congelada
  const guardar = isLastHole ? guardarUltimoHoyo : undefined
  const envio = guardar?.envio ?? 'al_dia'
  const anotado = !!guardar && guardar.guardado && envio === 'al_dia'
  const enviando = !!guardar && guardar.guardado && envio === 'enviando'
  const guardarInactivo = !!guardar && (anotado || enviando || congelada)
  const etiquetaGuardar = !guardar ? ''
    : anotado ? `Hoyo ${guardar.hoyo} anotado ✓`
    : enviando ? `Enviando hoyo ${guardar.hoyo}…`
    : guardar.guardado ? `Enviar hoyo ${guardar.hoyo}`
    : `Guardar hoyo ${guardar.hoyo}`
  return (
    <div style={{
      flexShrink: 0, background: theme.navBg,
      borderTop: `1px solid ${theme.border}`,
      padding: '8px 16px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
      display: 'flex', gap: '8px',
    }}>
      {currentHoleIdx > 0 && (
        <button
          onClick={onPrev}
          style={{
            flex: 1, padding: '14px', background: 'transparent',
            color: theme.textMuted, border: '1px solid #e2e8f0',
            borderRadius: '12px', fontSize: '14px', fontWeight: 400,
            cursor: 'pointer', minHeight: '48px',
          }}
        >
          {'←'} Anterior
        </button>
      )}
      {/* Primary: Siguiente (hidden on last hole) */}
      {!isLastHole && (
        <button
          onClick={onNext}
          style={{
            flex: 2, padding: '14px',
            background: theme.gold, color: 'var(--brand-dark)',
            border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600,
            cursor: 'pointer', minHeight: '48px',
            touchAction: 'manipulation', letterSpacing: '0.01em',
          }}
        >
          Siguiente {'→'}
        </button>
      )}
      {guardar && (
        <button
          type="button"
          onClick={guardar.onGuardar}
          disabled={guardarInactivo}
          style={{
            flex: 2, padding: '14px',
            background: anotado || enviando ? 'transparent' : theme.gold,
            color: anotado || enviando ? 'var(--brand-on-bg)' : 'var(--brand-dark)',
            border: anotado || enviando ? `1px solid rgba(196,153,42,0.4)` : 'none',
            borderRadius: '12px', fontSize: '16px', fontWeight: 600,
            cursor: guardarInactivo ? 'default' : 'pointer', minHeight: '48px',
            touchAction: 'manipulation', letterSpacing: '0.01em',
            opacity: congelada && !anotado ? 0.7 : 1,
          }}
        >
          {etiquetaGuardar}
        </button>
      )}
      {/* Finalize: secondary from hole 9, primary on last hole */}
      {canFinalize && (
        <button
          onClick={onFinalize}
          disabled={finalizarInactivo}
          style={{
            flex: isLastHole ? 2 : 1, padding: isLastHole ? '14px' : '12px',
            background: finalizing ? '#9ca3af' : isLastHole ? theme.gold : 'transparent',
            color: finalizing || isLastHole ? 'var(--brand-dark)' : 'var(--brand-on-bg)',
            border: isLastHole ? 'none' : `1px solid rgba(196,153,42,0.4)`,
            borderRadius: '12px',
            fontSize: isLastHole ? '16px' : '13px',
            fontWeight: isLastHole ? 600 : 500,
            cursor: finalizarInactivo ? 'not-allowed' : 'pointer', minHeight: '48px',
            touchAction: 'manipulation', letterSpacing: '0.01em',
            transition: 'background 0.2s ease',
            opacity: finalizarInactivo ? 0.7 : 1,
          }}
        >
          {finalizing ? 'Finalizando...' : 'Finalizar ronda ✓'}
        </button>
      )}
    </div>
  )
}
