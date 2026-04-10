# Checklist Auditoría — Stroke Play

**Ejecutar en producción (https://golfersplus.vercel.app)**
**Antes de empezar:** correr `npm run test -- stroke-play.canary` — todos los tests deben pasar.

## Preparación
- [ ] Abrir Golfers+ en celular Android
- [ ] Tener otro celular/pestaña como espectador
- [ ] Conexión normal (no VPN, no wifi del golf club)

## Test 1: Ronda 18 hoyos gross individual
- [ ] Crear ronda libre
- [ ] Seleccionar cancha federada (ej: Los Leones)
- [ ] Formato: Stroke Play, Modo: Gross
- [ ] 18 hoyos, 1 jugador (yo)
- [ ] Tee: Blanco
- [ ] Iniciar ronda
- [ ] **Verificar:** badge "18 HOYOS" visible en header
- [ ] Ingresar scores: hoyo 1 par, hoyo 2 bogey, hoyo 3 birdie, resto par
- [ ] **Verificar:** leaderboard muestra "+0"
- [ ] **Verificar:** vista espectador muestra el mismo "+0"
- [ ] Finalizar ronda (todos los hoyos con score)
- [ ] Compartir resultado
- [ ] **Verificar:** share card muestra gross=72, +0, badge "18 HOYOS"

## Test 2: Ronda 9 hoyos gross individual
- [ ] Crear ronda libre
- [ ] Seleccionar cancha federada
- [ ] Formato: Stroke Play, Modo: Gross
- [ ] **9 hoyos**, 1 jugador
- [ ] Iniciar
- [ ] **Verificar:** badge "9 HOYOS" visible y prominente
- [ ] Ingresar scores: +11 total (ej: todos los hoyos 1 sobre par + 2 más)
- [ ] **Verificar:** leaderboard muestra "+11"
- [ ] **Verificar:** gross calculado = 47 (36 + 11), NO 83
- [ ] Finalizar
- [ ] Compartir
- [ ] **Verificar:** share card muestra gross=47, badge "9 HOYOS"

## Test 3: Ronda 18 hoyos neto (con handicap)
- [ ] Crear ronda con otro jugador (invitado con HCP 15)
- [ ] Formato: Stroke Play, Modo: Neto
- [ ] **Verificar:** app pide course handicap
- [ ] Iniciar
- [ ] Ingresar scores reales
- [ ] **Verificar:** leaderboard muestra columnas gross y neto
- [ ] **Verificar:** neto = gross - handicap ajustado por SI

## Test 4: Ronda incompleta (solo 10 de 18 hoyos)
- [ ] Crear ronda 18h gross
- [ ] Ingresar score solo hoyos 1-10
- [ ] **Verificar:** leaderboard muestra "+X en 10 hoyos"
- [ ] **Verificar:** vista espectador dice "en curso, 10/18"
- [ ] **Verificar:** NO extrapola el resultado

## Test 5: Edge cases
- [ ] Cancha par 70 (si existe en BD): verificar vsPar usa 70, no 72
- [ ] Jugador con eagle en hoyo 1: verificar que se cuenta -2
- [ ] Múltiples jugadores (2, 3, 4): verificar orden por vsPar
- [ ] Empate en primer lugar: verificar UI muestra "Empate"

## Test 6: Vistas derivadas
- [ ] Ir a "En vivo" mientras la ronda está activa
- [ ] **Verificar:** ranking por vsPar correcto
- [ ] **Verificar:** badges de hoyos visibles
- [ ] Perfil > Historial
- [ ] **Verificar:** la ronda aparece con gross y vsPar correctos

## Bugs encontrados
_(Llenar si aparecen. Cada bug = test canario nuevo antes de arreglar.)_

- [ ] ___________
- [ ] ___________

## Firma
Ejecutado por: _______________
Fecha: _______________
Resultado: PASS / FAIL
