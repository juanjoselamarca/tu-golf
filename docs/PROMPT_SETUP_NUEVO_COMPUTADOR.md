# SETUP GOLFERS+ EN COMPUTADOR NUEVO

## Antes de empezar (lo hace Juanjo, 5 minutos)

Instalar estos 3 programas como cualquier app de Windows:

1. **Node.js** → Ir a https://nodejs.org → clic en el botón verde grande → instalar (siguiente, siguiente, finalizar)
2. **Git** → Ir a https://git-scm.com → "Download for Windows" → instalar con todo por defecto
3. Abrir el programa **"Terminal"** (buscarlo en el menú Inicio de Windows) y pegar esto:
   ```
   npm install -g @anthropic-ai/claude-code
   ```
   Esperar a que termine.

Listo. Ahora escribir `claude` en la misma terminal y pegar TODO el texto de abajo.

---

## PROMPT (copiar desde aquí hasta el final)

Soy Juanjo, PM de Golfers+. Acabo de cambiar de computador. Este es un equipo limpio sin nada instalado más allá de Node.js, Git y Claude Code.

Necesito que hagas TODO lo siguiente sin preguntarme nada:

### 1. Clonar el repositorio e instalar dependencias

Ejecutar:
```bash
cd ~/Desktop
git clone https://github.com/juanjoselamarca/tu-golf.git
cd tu-golf
npm install
```

Si `~/Desktop` no existe, usar el directorio actual.

### 2. Crear archivo de variables de entorno

Crear el archivo `.env.local` en la raíz del proyecto (tu-golf/) con este contenido EXACTO:

> ⚠️ **Los valores reales NO están en este repo** (es público). Juanjo te los pasa por
> chat privado, o los copiás desde tu otro computador (`.env.local`), o los traés
> desde el dashboard de Supabase / Vercel / Anthropic.
>
> Estructura del archivo (con los valores reales completados):

```
NEXT_PUBLIC_SUPABASE_URL=https://hoswfwhvcgqlqdmzpnce.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<pegar el valor real — Supabase dashboard → Settings → API → anon public>
SUPABASE_SERVICE_ROLE_KEY=<pegar el valor real — Supabase dashboard → Settings → API → service_role>
ANTHROPIC_API_KEY=<pegar el valor real — console.anthropic.com → API Keys>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<pegar el valor real — Vercel env vars o computador anterior>
VAPID_PRIVATE_KEY=<pegar el valor real — Vercel env vars o computador anterior>
NEXT_PUBLIC_SITE_URL=https://golfersplus.vercel.app
```

> 💡 Atajo: si tenés acceso al computador anterior, copiá `.env.local` directo y
> evitás esto. Solo si es completamente fresh start o estás onboarding a otro
> dev hace falta hacerlo por dashboards.

### 3. Instalar el pre-push hook de seguridad

Crear el archivo `.git/hooks/pre-push` (dentro de la carpeta tu-golf) con el hook que:
- Ejecuta `npx tsc --noEmit` y bloquea si hay errores
- Ejecuta `npm run test -- --run` y bloquea si fallan tests
- Limpia `.next` y ejecuta `npm run build` y bloquea si falla
- Muestra mensajes claros de qué pasó
- Hacerlo ejecutable con `chmod +x`

Este hook es CRÍTICO — fue creado después de un incidente grave de caída de la app. Ver docs/POSTMORTEM_2026-03-25.md.

### 4. Verificar que todo funciona

Ejecutar en orden y reportar resultados:
1. `npx tsc --noEmit` → esperar 0 errores
2. `npm run test` → esperar 27+ tests pasando
3. `npm run build` → esperar build exitoso

### 5. Confirmar

Reportar:
- "Repositorio verificado: github.com/juanjoselamarca/tu-golf"
- Resultados de TypeScript, tests y build
- Confirmar que el pre-push hook está instalado y funcional

### CONTEXTO DEL PROYECTO

- App: Golfers+ — scoring de golf + coaching IA para Chile y LatAm
- Stack: Next.js 14 + Supabase + Vercel + TypeScript
- Producción: https://golfersplus.vercel.app
- GitHub: https://github.com/juanjoselamarca/tu-golf
- Rol de Claude: CTO del proyecto
- Rol de Juanjo: PM y estrategia (no técnico, no pedirle decisiones técnicas)
- CLAUDE.md tiene todas las reglas del proyecto
- docs/POSTMORTEM_2026-03-25.md explica el incidente de caída y las barreras de seguridad
- docs/SPRINT_LOG.md tiene el historial completo de desarrollo
- docs/AUDIT_HARDENING_2026-03-24.md tiene el audit de seguridad
