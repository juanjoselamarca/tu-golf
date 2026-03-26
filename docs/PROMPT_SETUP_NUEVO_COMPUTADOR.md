# PROMPT PARA CLAUDE CODE — Setup en nuevo computador

Copia y pega esto completo en Claude Code después de instalar Node.js, Git y Claude Code.

---

## INSTRUCCIONES PARA CLAUDE

Soy Juanjo, PM de Golfers+. Acabo de cambiar de computador. Necesito que configures todo para seguir trabajando desde donde quedamos.

### PASO 1 — Clonar y configurar

```bash
git clone https://github.com/juanjoselamarca/tu-golf.git
cd tu-golf
npm install
```

### PASO 2 — Crear .env.local

Crear el archivo `.env.local` en la raíz del proyecto con estas variables exactas:

```
NEXT_PUBLIC_SUPABASE_URL=https://hoswfwhvcgqlqdmzpnce.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhvc3dmd2h2Y2dxbHFkbXpwbmNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTc2NDYsImV4cCI6MjA4ODkzMzY0Nn0.M1nuDgVA7HtUFa3cuGZZFujqv35YYeTFPiDIErBTjUY
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhvc3dmd2h2Y2dxbHFkbXpwbmNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM1NzY0NiwiZXhwIjoyMDg4OTMzNjQ2fQ.gncfJlDKlsPeWws3s27VCW5FtgjPBBchRZL2LKLSHD4
ANTHROPIC_API_KEY=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
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BFRDClR1N59HIKCI1xwNKI3w_keD1pthHeEcjxa9wL5JTq3CrQUSe56K-ToIuLC7gQWmIfi-qTNQJHLwkBDEqqk
VAPID_PRIVATE_KEY=mCfwe9Y6DHeIC0_kna3mWiWF7jK0MJDg4rgrWCKq168
NEXT_PUBLIC_SITE_URL=https://tu-golf.vercel.app
```

### PASO 3 — Reinstalar pre-push hook de seguridad

Crear `.git/hooks/pre-push` con el hook que bloquea push si TypeScript, tests o build fallan. Este hook es CRÍTICO — fue instalado después de un incidente donde la app se cayó en producción. Ver docs/POSTMORTEM_2026-03-25.md para contexto.

### PASO 4 — Verificar que todo funciona

Ejecutar en orden:
1. `npx tsc --noEmit` → debe dar 0 errores
2. `npm run test` → debe dar 27+ tests pasando (incluye tests canario)
3. `npm run build` → debe compilar exitosamente

### PASO 5 — Confirmar

Reportar:
- "✅ Repositorio verificado: github.com/juanjoselamarca/tu-golf"
- Resultado de TypeScript, tests y build
- Confirmar que el pre-push hook está instalado

### CONTEXTO

- App: Golfers+ (golf scoring + coaching IA para Chile/LatAm)
- Stack: Next.js 14 + Supabase + Vercel + TypeScript
- Producción: https://tu-golf.vercel.app
- GitHub: https://github.com/juanjoselamarca/tu-golf
- Supabase: https://hoswfwhvcgqlqdmzpnce.supabase.co
- Rol de Claude: CTO del proyecto
- Rol de Juanjo: PM/estrategia (no técnico)
- Lee CLAUDE.md para todas las reglas del proyecto
- Lee docs/POSTMORTEM_2026-03-25.md para entender por qué hay barreras de seguridad
- Lee docs/SPRINT_LOG.md para el historial completo de desarrollo
