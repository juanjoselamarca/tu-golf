'use client'
import type { Profile } from '@/lib/data/perfil'
import { formatRelativeTime } from '@/lib/format'

interface Props {
  profile: Profile
  fedegolf: { refreshing: boolean; msg: { kind: 'ok' | 'warn' | 'error'; text: string } | null; refresh: () => void }
  onOpenBreakdown: () => void
}

export function DualIndexCards({ profile, fedegolf, onOpenBreakdown }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px', animation: 'profileIn 480ms cubic-bezier(0.16,1,0.3,1) both', animationDelay: '100ms' }}>
      {/* Índice Federación */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
        <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: '"DM Mono", monospace', marginBottom: '8px', margin: '0 0 8px' }}>
          Federación
        </p>
        <p style={{ fontSize: '38px', fontWeight: 700, color: 'var(--text)', fontFamily: '"Cormorant Garamond", serif', lineHeight: 1, margin: '0 0 4px' }}>
          {profile.indice != null ? profile.indice.toFixed(1) : '—'}
        </p>
        <p style={{ fontSize: '10px', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
          Oficial USGA · torneos federados
        </p>
        {/* Botón "Actualizar" — inbox 25366393. Trigger manual al sync FedeGolf
            (cooldown 4h server-side). No se muestra mientras refresca para evitar
            doble-click. Mensaje de resultado debajo, auto-clear a los 6s. */}
        <button
          type="button"
          onClick={fedegolf.refresh}
          disabled={fedegolf.refreshing}
          aria-label="Actualizar índice FedeGolf"
          style={{
            marginTop: '12px',
            minHeight: '32px',
            padding: '6px 10px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: '"DM Sans", system-ui, sans-serif',
            color: fedegolf.refreshing ? 'var(--text-3)' : '#c4992a',
            cursor: fedegolf.refreshing ? 'wait' : 'pointer',
            letterSpacing: '0.02em',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <span aria-hidden style={{
            display: 'inline-block',
            width: '11px', height: '11px',
            animation: fedegolf.refreshing ? 'fedegolfSpin 800ms linear infinite' : 'none',
          }}>↻</span>
          {fedegolf.refreshing ? 'Actualizando…' : 'Actualizar'}
        </button>
        {fedegolf.msg && (
          <p
            role="status"
            aria-live="polite"
            style={{
              marginTop: '8px',
              marginBottom: 0,
              fontSize: '10px',
              lineHeight: 1.4,
              color: fedegolf.msg.kind === 'error' ? '#dc2626' : fedegolf.msg.kind === 'warn' ? 'var(--text-2)' : '#16a34a',
            }}
          >
            {fedegolf.msg.text}
          </p>
        )}
        <style jsx>{`
          @keyframes fedegolfSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>

      {/* Índice Golfers+ — clickeable cuando hay índice para abrir el desglose
          de qué rondas cuentan (inbox 82af3d48). */}
      {profile.indice_golfers != null ? (
        <button
          type="button"
          onClick={onOpenBreakdown}
          aria-label="Ver qué rondas cuentan para el cálculo"
          style={{
            background: 'var(--bg)',
            border: '1px solid rgba(196,153,42,0.35)',
            borderRadius: '16px',
            padding: '16px',
            textAlign: 'center',
            cursor: 'pointer',
            width: '100%',
            fontFamily: 'inherit',
            transition: 'transform 120ms ease',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}
        >
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c4992a', fontFamily: '"DM Mono", monospace', margin: '0 0 8px' }}>
            Golfers+
          </p>
          <p style={{ fontSize: '38px', fontWeight: 700, color: '#c4992a', fontFamily: '"Cormorant Garamond", serif', lineHeight: 1, margin: '0 0 4px' }}>
            {profile.indice_golfers.toFixed(1)}
          </p>
          <p style={{ fontSize: '10px', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
            Rendimiento real · coaching y amistosos
          </p>
          {profile.indice_golfers_updated_at && (
            <p style={{ fontSize: '9px', color: 'var(--text-3)', margin: '6px 0 0', fontFamily: '"DM Mono", monospace', letterSpacing: '0.04em', fontStyle: 'italic' }}>
              Actualizado {formatRelativeTime(profile.indice_golfers_updated_at)}
            </p>
          )}
          <p style={{ fontSize: '10px', color: '#c4992a', margin: '8px 0 0', fontWeight: 600 }}>
            Ver qué rondas cuentan →
          </p>
        </button>
      ) : (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', textAlign: 'center' }}>
          <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c4992a', fontFamily: '"DM Mono", monospace', margin: '0 0 8px' }}>
            Golfers+
          </p>
          <p style={{ fontSize: '28px', color: 'var(--text-3)', lineHeight: 1, margin: '0 0 4px' }}>—</p>
          <p style={{ fontSize: '10px', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
            3+ rondas para activar
          </p>
        </div>
      )}
    </div>
  )
}
