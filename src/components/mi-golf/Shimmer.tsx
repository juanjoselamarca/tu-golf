// Shimmer compartido para los skeletons del dashboard (Mi Golf): loading.tsx
// (page-level) y los fallbacks de Suspense por sección. Centralizado para no
// duplicar el keyframe ni la barra. Los colores salen de tokens theme-aware
// (--surface-soft / --surface-border, --border): con un gris claro escrito a mano
// el skeleton parpadeaba en blanco sobre el navy del modo oscuro.

export function ShimmerKeyframes() {
  return <style>{`@keyframes mg-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
}

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
        background: 'linear-gradient(90deg, var(--surface-soft) 25%, var(--surface-border) 50%, var(--surface-soft) 75%)',
        backgroundSize: '200% 100%',
        animation: 'mg-shimmer 1.4s ease-in-out infinite',
      }}
    />
  )
}
