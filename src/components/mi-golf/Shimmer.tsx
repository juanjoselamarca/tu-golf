// Barra de skeleton compartida para los skeletons del dashboard (Mi Golf): loading.tsx
// (page-level) y los fallbacks de Suspense por sección. El color sale de un token
// theme-aware (--surface-border, el tono más visible del barrido anterior): con un gris claro escrito a mano el skeleton
// parpadeaba en blanco sobre el navy del modo oscuro.
//
// Estática a propósito (DESIGN.md §13, 16-nov-2026: «sin pulsos, shimmer ni conteos
// animados»). El barrido en bucle que tenía antes además ignoraba
// prefers-reduced-motion.

export function Bar({
  width,
  height,
  radius = 8,
  mb = 0,
}: {
  width: string
  height: number
  radius?: number
  mb?: number
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        marginBottom: mb,
        background: 'var(--surface-border)',
      }}
    />
  )
}
