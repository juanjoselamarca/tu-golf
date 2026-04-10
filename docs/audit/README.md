# Checklists de Auditoría Manual

Cada modalidad tiene un checklist de verificación end-to-end que debe pasarse
**en producción** antes de considerar la modalidad lista para lanzamiento.

Un checklist se ejecuta jugando una ronda real en Golfers+ y verificando
cada punto. Cualquier falla = bug P0 que debe arreglarse antes de continuar.

## Procedimiento
1. Leer el spec de la modalidad
2. Correr los tests canario (`npm run test -- <modalidad>.canary`)
3. Crear ronda real en golfersplus.vercel.app
4. Seguir el checklist paso por paso
5. Reportar bugs encontrados
6. Arreglar todo antes de pasar a la siguiente modalidad
