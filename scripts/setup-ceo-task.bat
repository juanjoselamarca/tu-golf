@echo off
REM CEO Autonomo v4 — cola persistente: trabaja hasta que se acaba el cupo y despues retoma.
REM Plan: docs\superpowers\plans\2026-10-01-scheduler-nocturno-v4.md
REM Rollback: setup-ceo-task.v3.bat (+ git revert del PR del scheduler v4).
REM Ejecutar UNA VEZ con permisos de administrador.

set REPO_DIR=C:\Users\juanj\OneDrive\Escritorio\Proyectos IA\tu-golf
set SCRIPT=%REPO_DIR%\scripts\ceo-autonomo.mjs

echo Registrando tareas del CEO Autonomo v4...
echo Repo: %REPO_DIR%
echo.

REM Tareas de versiones anteriores
schtasks /Delete /TN "GolfersPlus-CEO-NightPipeline" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-Round2" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-TokenWarmup-R2" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-DeadmanSwitch" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-Recupero-30sep" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-Autonomo" /F 2>nul

REM RestartCount 0: si Task Scheduler reintentara por su cuenta habria dos noches compitiendo.
REM StartWhenAvailable: si el PC estaba apagado (o el cambio de hora salta las 00:00), corre al volver.
powershell -NoProfile -Command ^
  "$repo = '%REPO_DIR%'; $script = '%SCRIPT%'; " ^
  "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Hours 16); " ^
  "$short = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 30); " ^
  "function Reg($name, $arg, $at, $s) { $a = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" ' + $arg) -WorkingDirectory $repo; $t = New-ScheduledTaskTrigger -Daily -At $at; Register-ScheduledTask -TaskName $name -Action $a -Trigger $t -Settings $s -Force | Out-Null; Write-Host ('  OK: ' + $name + ' a las ' + $at) }; " ^
  "Reg 'GolfersPlus-CEO-TokenWarmup' '--warmup' '23:30' $short; " ^
  "Reg 'GolfersPlus-CEO-Night' '--night' '00:00' $settings; " ^
  "Reg 'GolfersPlus-CEO-Watchdog' '--watchdog' '08:00' $short; " ^
  "Reg 'GolfersPlus-CEO-Watchdog-Noon' '--watchdog' '12:00' $short; " ^
  "$mon = New-ScheduledTaskAction -Execute 'node' -Argument '--env-file=.env.local scripts\monitor\uptime.mjs --local' -WorkingDirectory $repo; " ^
  "$monT = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5); " ^
  "$monS = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2); " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-Monitor-Caidas' -Action $mon -Trigger $monT -Settings $monS -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-Monitor-Caidas cada 5 min'; " ^
  "$dia = New-ScheduledTaskAction -Execute 'node' -Argument '--env-file=.env.local scripts\monitor\incidente.mjs' -WorkingDirectory $repo; " ^
  "$diaS = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20); " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-Diagnostico' -Action $dia -Settings $diaS -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-Diagnostico (sin horario: la lanza el monitor al confirmar una caida)'"

echo.
echo Listo. 6 tareas registradas.
echo   23:30  TokenWarmup        refresca el token OAuth
echo   00:00  Night              preflight de cupo + cola de agentes
echo   08:00  Watchdog           relanza una vez si el scheduler murio; reenvia avisos
echo   12:00  Watchdog-Noon      idem
echo   c/5min Monitor-Caidas     web + BD + auth; alerta Telegram si prod cae y reinicia la base
echo   (auto) Diagnostico        la lanza el monitor al confirmar una caida: Claude (solo lectura) explica la causa
echo   (auto) GolfersPlus-CEO-Resume: la crea el scheduler cuando el cupo se agota y
echo          despierta el PC a la hora de la renovacion.
echo.
echo Pausa inmediata: crear el archivo .claude\ceo-locks\PAUSE
echo Verificar: powershell -Command "Get-ScheduledTask GolfersPlus*"
pause
