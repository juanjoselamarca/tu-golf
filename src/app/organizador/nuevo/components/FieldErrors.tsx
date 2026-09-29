// src/app/organizador/nuevo/components/FieldErrors.tsx
//
// Errores de una sección que NO tienen un campo propio al que apuntar (rechazo
// del server sin path, base inválida en una key sin input). Los que sí tienen
// campo se muestran junto al input (`InlineFieldError`). El editor decide qué
// keys raíz pertenecen a cada sección (`section-keys.ts`). Sin role="alert": el
// header ya anuncia el estado una sola vez.

export interface FieldErrorsProps {
  /** Keys raíz del config que edita la sección (ver `section-keys.ts`). */
  keys: readonly string[]
  /** key raíz → mensajes sin campo propio (de `useDraftErrors().sectionMessages`). */
  sectionMessages: Record<string, string[]>
}

export function FieldErrors({ keys, sectionMessages }: FieldErrorsProps) {
  const messages = Array.from(new Set(keys.flatMap((k) => sectionMessages[k] ?? [])))
  if (messages.length === 0) return null
  return (
    <div style={containerStyle} data-section-errors="true">
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
  background: 'var(--error-bg)',
  color: 'var(--error-fg)',
  fontSize: 13,
  lineHeight: 1.4,
}

const lineStyle: React.CSSProperties = {
  margin: 0,
}
