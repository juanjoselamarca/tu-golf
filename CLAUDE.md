# CLAUDE.md — Tu Golf
# Leído automáticamente por Claude Code al iniciar cada sesión.

## VERIFICACIÓN OBLIGATORIA ANTES DE CUALQUIER ACCIÓN

Al iniciar SIEMPRE ejecutar estos 3 comandos en orden:

1. Verificar repositorio correcto:
   git remote -v
   DEBE mostrar: origin https://github.com/juanjoselamarca/tu-golf.git
   Si muestra CUALQUIER otra URL → DETENER y avisar a Juanjo inmediatamente.

2. Verificar branch:
   git branch --show-current
   DEBE mostrar: main

3. Sincronizar:
   git pull origin main

Solo después de estos 3 pasos confirmar:
"✅ Repositorio verificado: github.com/juanjoselamarca/tu-golf — listo"

## POR QUÉ VERIFICAR EL REPOSITORIO Y NO LA CARPETA

El proyecto puede moverse a cualquier carpeta o computador en el futuro.
La carpeta local NO define el proyecto correcto.
El repositorio de GitHub ES la identidad permanente del proyecto.
Siempre verificar el remote ANTES de tocar cualquier archivo.

## STACK DEL PROYECTO

- Framework: Next.js 14 + TypeScript + Tailwind CSS
- Base de datos: Supabase (PostgreSQL + Auth + RLS)
  URL: https://hoswfwhvcgqlqdmzpnce.supabase.co
- Deploy: Vercel automático desde GitHub main
  Producción: https://tu-golf.vercel.app
- Repositorio: https://github.com/juanjoselamarca/tu-golf

## REGLAS DE DESARROLLO OBLIGATORIAS

1. NUNCA hacer push sin antes correr: npx tsc --noEmit (0 errores)
2. NUNCA hacer push sin antes correr: npm run build (build exitoso)
3. Mensajes de commit en español descriptivo
4. Variables de entorno: NUNCA hardcodear, siempre desde .env.local
5. NUNCA modificar node_modules ni .next directamente

## SISTEMA DE DISEÑO

Colores principales:
- bg-deep: #070d18
- bg-card: #0e1c2f
- gold: #c4992a
- gold-light: #e8c06a
- ivory: #edeae4

Tipografías: Playfair Display (títulos) + DM Sans (UI)

## PRINCIPIOS DEL PROYECTO

1. Costo cero hasta product-market fit
2. Sistema global de errores guiados en español
3. Todo error: popup visible + campo en rojo + solución concreta

## CONTACTO

- PM: Juan José Lamarca (juanjoselamarca@gmail.com)
- CTO: Claude
