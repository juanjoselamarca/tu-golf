# Checklist Auditoría — Scramble

## Preparación
- [ ] `npm run test -- scramble` pasar
- [ ] Abrir producción

## Test 1: Scramble 4-person gross
- [ ] Crear ronda Scramble, 4 jugadores en 1 equipo
- [ ] Modo Gross, 18h
- [ ] Iniciar
- [ ] **Verificar:** app pide un score por hoyo (no 4 scores)
- [ ] Ingresar scores del equipo
- [ ] **Verificar:** leaderboard muestra score equipo

## Test 2: Scramble 4-person neto
- [ ] Modo Neto
- [ ] Cada jugador con HCP distinto (ej: 8, 15, 22, 28)
- [ ] **Verificar:** app calcula HCP combinado del equipo
- [ ] **Verificar:** muestra HCP combinado antes de iniciar
- [ ] Iniciar
- [ ] **Verificar:** scores netos del equipo correctos

## Test 3: Scramble 2-person
- [ ] Crear ronda con 2 equipos de 2
- [ ] **Verificar:** fórmula HCP combinado 2-person

## Test 4: Comparación de equipos
- [ ] 3 equipos de 4
- [ ] **Verificar:** ranking correcto por gross/neto

## Test 5: 9 hoyos scramble
- [ ] 9h scramble
- [ ] **Verificar:** badge "9 HOYOS"

## Bugs encontrados
- [ ] ___________
