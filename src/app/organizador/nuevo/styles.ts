// src/app/organizador/nuevo/styles.ts
//
// Estilos compartidos entre las 11 secciones del draft editor.
// Cada sección importa desde acá en vez de redeclarar inline.
//
// NOTA: fontFamily NO se incluye — "DM Sans" se hereda del layout global.
// Los estilos CSS de ResponsiveStyles (en TournamentDraftEditor) overriden
// borderRadius, background, border y padding de las cards a nivel global
// vía `.draft-editor-form section { ... }`.

// ── Variante estándar ────────────────────────────────────────────────
// Usada por: QueTorneo, Equipos, Inscripcion, MatchPlay, ComoJuegan

export const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--card-bg, #f9fafb)',
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

export const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--text-primary, #111827)',
}

export const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

export const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary, #4b5563)',
}

export const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--text-primary, #111827)',
  fontSize: 14,
  outline: 'none',
}

// ── Variante compacta ────────────────────────────────────────────────
// Usada por: Categorias, Premios, Rondas (grids densos con muchos campos)

export const fieldStyleCompact: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

export const labelStyleCompact: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary, #4b5563)',
}

export const inputStyleCompact: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
  color: 'var(--text-primary, #111827)',
  fontSize: 13,
  outline: 'none',
}

// ── Helpers compartidos ──────────────────────────────────────────────

export const helperStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--text-secondary, #4b5563)',
}

export const emptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontStyle: 'italic',
  color: 'var(--text-secondary, #4b5563)',
}

export const addBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px dashed var(--brand-gold, #c4992a)',
  background: 'transparent',
  color: 'var(--brand-gold, #c4992a)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}

export const removeBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-end',
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'transparent',
  color: 'var(--text-secondary, #4b5563)',
  fontSize: 12,
  cursor: 'pointer',
}

export const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

export const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 12,
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'var(--input-bg, #ffffff)',
}

export const rowGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 10,
}
