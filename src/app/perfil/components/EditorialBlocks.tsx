import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { NIVEL_LABELS, NIVEL_DESCRIPCION } from '@/lib/indice-golfers'
import type { Profile } from '@/lib/data/perfil'

/** Gap note — momento editorial cuando hay desalineación >= 1.5 entre índices */
export function GapNote({ profile }: { profile: Profile }) {
  if (!(profile.indice != null && profile.indice_golfers != null && Math.abs(profile.indice - profile.indice_golfers) >= 1.5)) {
    return null
  }
  return (
    <div style={{
      padding: '14px 16px',
      background: 'rgba(196,153,42,0.06)',
      border: '1px solid rgba(196,153,42,0.28)',
      borderRadius: '12px',
      marginBottom: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: '220px' }}>
        <div style={{
          fontSize: '9px',
          fontFamily: '"DM Mono", monospace',
          fontWeight: 700,
          color: '#c4992a',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: '4px',
        }}>
          Recomendación tAIger+
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
          <strong style={{ color: '#c4992a' }}>{Math.abs(profile.indice - profile.indice_golfers).toFixed(1)} puntos</strong> de diferencia entre tu índice oficial y tu rendimiento reciente.
        </p>
      </div>
      <Link href="/coach" style={{ textDecoration: 'none', flexShrink: 0 }}>
        <Button variant="commit" size="sm">
          Analizar con tAIger+ →
        </Button>
      </Link>
    </div>
  )
}

/** Nivel badge */
export function NivelBadge({ profile }: { profile: Profile }) {
  if (!(profile.nivel != null && profile.nivel > 0)) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '16px' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#c4992a', flexShrink: 0 }} />
      <div>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          {NIVEL_LABELS[profile.nivel] ?? 'Sin nivel'}
        </p>
        <p style={{ fontSize: '11px', color: 'var(--text-2)', margin: 0 }}>
          {NIVEL_DESCRIPCION[profile.nivel] ?? ''}
        </p>
      </div>
    </div>
  )
}

/** Sincroniza tu historial — bloque editorial, no Link huérfano */
export function SyncHistorialBlock() {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '16px 18px',
      marginBottom: '16px',
    }}>
      <div style={{
        fontSize: '10px', fontWeight: 700, color: 'var(--text-3)',
        fontFamily: '"DM Mono", monospace',
        letterSpacing: '0.12em', textTransform: 'uppercase',
        marginBottom: '6px',
      }}>
        Sincronización
      </div>
      <div style={{
        fontFamily: '"Playfair Display", serif',
        fontSize: '17px', color: 'var(--text)', fontWeight: 600,
        marginBottom: '4px', letterSpacing: '-0.01em',
      }}>
        Trae tu historial completo
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Importa tus rondas desde FedeGolf, Garmin Connect o un CSV — el Índice Golfers+ y CPI™ se recalculan automáticamente.
      </p>
      <Link
        href="/importar"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '40px', padding: '0 18px',
          background: 'transparent', border: '1px solid rgba(196,153,42,0.6)',
          color: '#c4992a', borderRadius: '12px',
          fontSize: '13px', fontWeight: 600, textDecoration: 'none',
        }}
      >
        Importar historial →
      </Link>
    </div>
  )
}
