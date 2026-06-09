'use client'
import { Button } from '@/components/ui/Button'
import { Check } from '@/components/icons'
import type { Profile } from '@/lib/data/perfil'
import type { useProfileEdit } from '../hooks/useProfileEdit'

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--input-border)',
  color: 'var(--text)',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '16px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

interface Props {
  profile: Profile
  userEmail: string | null
  edit: ReturnType<typeof useProfileEdit>
}

export function AccountSection({ profile, userEmail, edit }: Props) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(196,153,42,0.18)', borderRadius: '16px', padding: '18px 18px 20px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: 'var(--text)', margin: 0 }}>
          Cuenta
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {edit.saved && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#16a34a' }}>
              <Check size={14} strokeWidth={2.5} /> Guardado
            </span>
          )}
          {!edit.editing && (
            <Button variant="nav" size="sm" onClick={() => edit.setEditing(true)}>
              Editar perfil
            </Button>
          )}
        </div>
      </div>

      {edit.editing ? (
        <div id="edit-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Nombre</label>
            <input
              type="text"
              value={edit.editName}
              onChange={(e) => edit.setEditName(e.target.value)}
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)')}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-2)', marginBottom: '6px' }}>Índice Federación</label>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder="Ej: 15.4 — tu índice oficial de la Federación"
              value={edit.editIndice}
              onChange={(e) => edit.setEditIndice(e.target.value)}
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#c4992a')}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(122,143,168,0.3)'
                const v = e.target.value.replace(',', '.')
                const n = parseFloat(v)
                if (!isNaN(n) && n >= 0 && n <= 54) edit.setEditIndice(String(n))
              }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px', margin: '4px 0 0' }}>
              Golfers+ calcula su propio índice automáticamente basado en tus rondas.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
            <Button variant="commit" size="md" onClick={edit.save} loading={edit.saving} disabled={edit.saving}>
              {edit.saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={edit.cancel}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            ['Nombre', profile.name || '—'],
            ['Email', userEmail || '—'],
          ].map(([label, value], idx, arr) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: idx < arr.length - 1 ? '1px solid #f1f5f9' : 'none', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>{label}</span>
              <span style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
