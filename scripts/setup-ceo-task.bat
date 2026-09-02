@echo off
REM CEO Autonomo — registra 5 tareas programadas en Windows Task Scheduler.
REM Cada agente corre como proceso independiente (no daemon).
REM Ejecutar UNA VEZ con permisos de administrador.

set SCRIPT_DIR=%~dp0
set NODE_PATH=node

echo Registrando tareas del CEO Autonomo...

schtasks /Create /TN "GolfersPlus-CEO-1-FlowE2E" /TR "%NODE_PATH% \"%SCRIPT_DIR%ceo-autonomo.mjs\" --now 1" /SC DAILY /ST 09:00 /RL HIGHEST /F
schtasks /Create /TN "GolfersPlus-CEO-2-DeadEndHunter" /TR "%NODE_PATH% \"%SCRIPT_DIR%ceo-autonomo.mjs\" --now 2" /SC DAILY /ST 11:30 /RL HIGHEST /F
schtasks /Create /TN "GolfersPlus-CEO-3-RefactorSecurity" /TR "%NODE_PATH% \"%SCRIPT_DIR%ceo-autonomo.mjs\" --now 3" /SC DAILY /ST 14:00 /RL HIGHEST /F
schtasks /Create /TN "GolfersPlus-CEO-4-QADesign" /TR "%NODE_PATH% \"%SCRIPT_DIR%ceo-autonomo.mjs\" --now 4" /SC DAILY /ST 16:30 /RL HIGHEST /F
schtasks /Create /TN "GolfersPlus-CEO-5-ResumenCEO" /TR "%NODE_PATH% \"%SCRIPT_DIR%ceo-autonomo.mjs\" --now 5" /SC DAILY /ST 18:00 /RL HIGHEST /F

REM Eliminar la tarea vieja (daemon) si existe
schtasks /Delete /TN "GolfersPlus-CEO-Autonomo" /F 2>nul

echo.
echo Listo. 5 tareas registradas:
echo   09:00  FlowE2E
echo   11:30  DeadEndHunter
echo   14:00  RefactorSecurity
echo   16:30  QADesign
echo   18:00  ResumenCEO
echo.
echo Para verificar: schtasks /Query /TN "GolfersPlus-CEO-1-FlowE2E"
pause
