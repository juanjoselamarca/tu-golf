/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Frame-Options',        value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-XSS-Protection',        value: '1; mode=block' },
  {
    key: 'Content-Security-Policy',
    // NOTE: 'unsafe-inline' is required by Next.js (inline styles, script injection).
    // 'unsafe-eval' is required for dev mode hot-reload. In production, Next.js still needs
    // 'unsafe-inline' for its own runtime. A nonce-based CSP via middleware would be the
    // proper fix, but requires significant refactoring of Next.js internals.
    // 'strict-dynamic' is NOT added because it conflicts with Next.js script loading.
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://us-assets.i.posthog.com",
      "script-src-elem 'self' 'unsafe-inline' https://us-assets.i.posthog.com",
      // Fontshare (api.fontshare.com) sirve el CSS de Clash Display + Satoshi
      // que usa el landing de marketing (scoped en src/app/home-v2/marketing.css).
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
      // Supabase Storage sirve imágenes públicas desde
      // `https://<project-ref>.supabase.co/storage/v1/object/public/...`
      // (bucket `tournament-covers`, avatares futuros, etc.). Sin este whitelist
      // el browser bloquea las <img> por CSP y muestra icono de imagen rota
      // (inbox 99500ba6 + 35f4ee89, may 27).
      "img-src 'self' data: blob: https://images.unsplash.com https://flagcdn.com https://lh3.googleusercontent.com https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://site.api.espn.com https://us.i.posthog.com https://us-assets.i.posthog.com",
      "font-src 'self' https://fonts.gstatic.com https://cdn.fontshare.com data:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  },
]

const nextConfig = {
  compress: true,
  // El reranker ONNX (cerebro v3) arrastra bindings nativos (.node) de
  // onnxruntime-node que webpack no puede bundlear para el target serverless.
  // El módulo @xenova/transformers solo se importa dinámicamente y gateado tras
  // CEREBRO_V3_RERANKER_ENABLED (default OFF), así que lo externalizamos: Next lo
  // deja como require runtime en vez de bundlearlo. Sin esto el build de webpack
  // falla al trazar el import transitivo desde /api/taiger/chat.
  experimental: {
    serverComponentsExternalPackages: ['@xenova/transformers', 'onnxruntime-node'],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  async redirects() {
    // El landing vivió en /home-v2 durante el preview (Fase 1-5). Tras el swap a
    // `/` (Fase 6) esa ruta ya no existe: redirigimos permanente para que viejos
    // links del preview no caigan en 404 y Google no vea contenido duplicado.
    return [{ source: '/home-v2', destination: '/', permanent: true }]
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'flagcdn.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      // Supabase Storage: portadas de torneos y futuros buckets públicos
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
}

module.exports = nextConfig
