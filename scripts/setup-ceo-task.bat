@echo off
REM CEO Autonomo v2 — registra 3 tareas nocturnas en Windows Task Scheduler.
REM El resumen-ceo (agente 4) se auto-dispara al terminar el agente 3.
REM Ejecutar UNA VEZ con permisos de administrador.
REM
REM FIX 20-sep-2026: Modern Standby (S0) no honra WakeToRun confiablemente.
REM Solución: agregar trigger secundario AtLogOn + StartWhenAvailable para que
REM si el PC estuvo dormido toda la noche, las tareas corran al despertar.
REM El catch-up del script evita duplicación (agentes que ya corrieron no re-corren).

set REPO_DIR=C:\Users\juanj\OneDrive\Escritorio\Proyectos IA\tu-golf
set SCRIPT=%REPO_DIR%\scripts\ceo-autonomo.mjs

echo Registrando tareas del CEO Autonomo v2 (horario nocturno)...
echo Repo: %REPO_DIR%
echo.

REM Eliminar tareas viejas (v1 y v2)
schtasks /Delete /TN "GolfersPlus-CEO-Autonomo" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-FlowE2E" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DeadEndHunter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-RefactorSecurity" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-4-QADesign" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-5-ResumenCEO" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-DeadEndHunter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DataQuality" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-E2EWriter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-DeadmanSwitch" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-TokenWarmup" /F 2>nul

REM 3 agentes nocturnos + deadman switch.
REM Cada tarea tiene:
REM   - Trigger Daily a su hora con WakeToRun
REM   - StartWhenAvailable = true (si se pierde el trigger, corre al despertar)
REM   - RunOnlyIfIdle = false (CRÍTICO: sin esto las tareas no corren)
REM   - StopOnIdleEnd = false
REM   - RestartCount = 3 con intervalo de 5min (retry automático si falla)
REM
REM Modern Standby (S0) workaround: WakeToRun + StartWhenAvailable.
REM StartWhenAvailable le dice a Task Scheduler: "si el trigger pasó mientras
REM el PC dormía, corré la tarea tan pronto como el PC vuelva a estar activo".
REM Ventana de gracia: 48h por defecto en Windows.
REM
REM El catch-up en ceo-autonomo.mjs (catchUpMissedAgents) garantiza que si
REM agente 2 corre tarde, primero verifica que agente 1 haya corrido. Si no,
REM lo corre antes. Esto da resiliencia end-to-end.

powershell -Command ^
  "$repo = '%REPO_DIR%'; $script = '%SCRIPT%'; " ^
  "$agents = @(" ^
  "  @{Name='GolfersPlus-CEO-1-DeadEndHunter'; Time='00:00'; Id='1'}," ^
  "  @{Name='GolfersPlus-CEO-2-DataQuality';   Time='02:30'; Id='2'}," ^
  "  @{Name='GolfersPlus-CEO-3-E2EWriter';     Time='05:00'; Id='3'}" ^
  "); " ^
  "" ^
  "foreach ($a in $agents) {" ^
  "  $action = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --now ' + $a.Id) -WorkingDirectory $repo; " ^
  "  $trigger = New-ScheduledTaskTrigger -Daily -At $a.Time; " ^
  "  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -DontStopOnIdleEnd -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5); " ^
  "  Register-ScheduledTask -TaskName $a.Name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null; " ^
  "  Write-Host ('  OK: ' + $a.Name + ' a las ' + $a.Time)" ^
  "}; " ^
  "" ^
  "$dmAction = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --deadman') -WorkingDirectory $repo; " ^
  "$dmTrigger = New-ScheduledTaskTrigger -Daily -At '08:00'; " ^
  "$dmSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -DontStopOnIdleEnd -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5); " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-CEO-DeadmanSwitch' -Action $dmAction -Trigger $dmTrigger -Settings $dmSettings -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-CEO-DeadmanSwitch a las 08:00'; " ^
  "" ^
  "$wuAction = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --warmup') -WorkingDirectory $repo; " ^
  "$wuTrigger = New-ScheduledTaskTrigger -Daily -At '23:30'; " ^
  "$wuSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -DontStopOnIdleEnd -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5); " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-CEO-TokenWarmup' -Action $wuAction -Trigger $wuTrigger -Settings $wuSettings -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-CEO-TokenWarmup a las 23:30'"

echo.
echo Listo. 3 tareas nocturnas + warmup + deadman switch registradas.
echo Horario: 23:30 (warmup) ^> 00:00 ^> 02:30 ^> 05:00 ^> resumen ~07:30 (listo a las 8am)
echo Token warmup a las 23:30 (refresca OAuth ANTES de que expire).
echo Deadman switch a las 08:00 (recupera agentes perdidos).
echo.
echo CONFIGURACION:
echo   WakeToRun:          SI (despierta el PC)
echo   StartWhenAvailable: SI (corre al despertar si se perdio el trigger)
echo   RunOnlyIfIdle:      NO (corre siempre)
echo   StopOnIdleEnd:      NO (no se detiene si el PC vuelve a idle)
echo   RestartOnFailure:   3 reintentos cada 5min
echo.
echo Para verificar: powershell -Command "Get-ScheduledTask | Where { $_.TaskName -like 'GolfersPlus*' }"
pause
