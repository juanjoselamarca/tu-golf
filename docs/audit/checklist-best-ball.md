# Checklist Auditoría — Best Ball

## Preparación
- [ ] `npm run test -- best-ball` debe pasar
- [ ] Abrir producción

## Test 1: Best Ball 18h gross, 2 equipos
- [ ] Crear ronda, formato Best Ball
- [ ] Modo Gross
- [ ] Crear 2 equipos de 2 jugadores cada uno
- [ ] Equipo 1: yo + invitado
- [ ] Equipo 2: otros 2 invitados
- [ ] Iniciar
- [ ] Ingresar scores individuales
- [ ] **Verificar:** leaderboard muestra score por equipo (mejor bola)
- [ ] **Verificar:** ordena por menor gross del equipo

## Test 2: Best Ball 18h neto
- [ ] Misma estructura, modo Neto
- [ ] HCPs distintos por jugador
- [ ] **Verificar:** cada jugador recibe golpes según su HCP
- [ ] **Verificar:** equipo score = mejor neto por hoyo

## Test 3: Ver detalle de equipo
- [ ] Click en un equipo en el leaderboard
- [ ] **Verificar:** se ven los scores individuales
- [ ] **Verificar:** indica cuál score contó por hoyo (resaltado)

## Test 4: Pickup de un jugador
- [ ] Jugador hace pickup en hoyo 5 (no ingresa score)
- [ ] **Verificar:** equipo usa el score del compañero
- [ ] **Verificar:** no penaliza al equipo

## Test 5: 9 hoyos
- [ ] Ronda 9h best ball
- [ ] **Verificar:** badge "9 HOYOS"
- [ ] **Verificar:** par total equipo = 36

## Test 6: Share card
- [ ] Compartir
- [ ] **Verificar:** nombre del equipo ganador
- [ ] **Verificar:** ambos jugadores del equipo listados

## Bugs encontrados
- [ ] ___________
