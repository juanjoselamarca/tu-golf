// src/app/organizador/nuevo/components/FieldErrors.tsx
//
// Errores de campos de una sección, debajo de su card: lo que no pasó el
// schema en cliente (no se guardó, está en pantalla) y lo que el server
// rechazó. El editor decide qué keys raíz pertenecen a cada sección.

export interface FieldErrorsProps {
  /** Keys raíz del config que edita la sección (`name`, `prizes`, ...). */
  keys: string[]
  /** key raíz → mensajes. */
  errorsByKey: Record<string, string[]>
}

export function FieldErrors({ keys, errorsByKey }: FieldErrorsProps) {
  const messages = Array.from(new Set(keys.flatMap((k) => errorsByKey[k] ?? [])))
  if (messages.length === 0) return null
  return (
    <div style={containerStyle} role="alert">
      {messages.map((m) => (
        <p key={m} style={lineStyle}>
          {m}
        </p>
      ))}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  margin: '-6px 4px 0',
  padding: '8px 12px',
  borderRadius: 10,
  background: 'var(--status-closed-bg)',
  color: 'var(--status-closed-fg)',
  fontSize: 13,
  lineHeight: 1.4,
}

const lineStyle: React.CSSProperties = {
  margin: 0,
}
