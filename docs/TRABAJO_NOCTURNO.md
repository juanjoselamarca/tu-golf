# Manual de trabajo nocturno — Golfers+

## La regla de oro
Claude Code trabaja siempre en una rama separada (copia de trabajo).
Nunca toca main directamente.
Al despertar, Juanjo revisa en 10 minutos y decide publicar o descartar.
Peor escenario: cerrar la rama sin dano.

## Tareas seguras para la noche (Categoria A)
- Crear pantallas completamente nuevas
- Crear componentes nuevos sin modificar existentes
- Cambios de texto y labels
- Nuevas APIs que no modifican las existentes
- Correcciones de estilo en pantallas especificas
- Documentacion y comentarios de codigo

## Tareas PROHIBIDAS de noche (Categoria B)
- Cambios al sistema de login o autenticacion
- Cambios al middleware.ts (afecta todas las rutas)
- Cambios al layout principal del app
- Cambios a la score page en vivo (la mas critica)
- Eliminar archivos existentes
- Modificar variables de entorno en produccion
- Cambios a Navbar.tsx (archivo protegido)

## Checklist de Juanjo antes de dormir (5 minutos)
- [ ] La app funciona correctamente en produccion ahora mismo
- [ ] El prompt de la tarea esta listo y revisado
- [ ] El wrapper de MODO NOCTURNO esta pegado al inicio del prompt
- [ ] La tarea es Categoria A (no toca arquitectura central)

## Checklist de Juanjo al despertar (10 minutos)
- [ ] Leer el reporte que dejo Claude Code
- [ ] Abrir el PR en GitHub y ver que archivos se tocaron
- [ ] Abrir la URL de preview automatica de Vercel para ese PR
- [ ] Probar en el celular
- [ ] Si esta bien: Merge → va al aire automaticamente
- [ ] Si no esta bien: Close PR → sin dano en produccion
