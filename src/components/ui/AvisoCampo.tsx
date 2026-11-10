/**
 * Aviso de error bajo un campo de formulario: el input lo enlaza con `aria-describedby={id}` y
 * `aria-invalid`, y `role="alert"` lo anuncia al aparecer. Color con el token de error
 * (`--error-fg`, AA compositado en claro y oscuro), nunca `--double` (es color de score).
 */
export function AvisoCampo({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--error-fg)' }}>
      {children}
    </p>
  )
}
