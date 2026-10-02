@echo off
REM CEO Autonomo v3 — pipeline de 2 rondas + warmup + deadman.
REM Ronda 1: 00:00 (tokens frescos de medianoche)
REM Ronda 2: 05:00 (tokens frescos 5h despues)
REM Briefing: 07:30 (cubre ambas rondas)
REM Ejecutar UNA VEZ con permisos de administrador.

set REPO_DIR=C:\Users\juanj\OneDrive\Escritorio\Proyectos IA\tu-golf
set SCRIPT=%REPO_DIR%\scripts\ceo-autonomo.mjs

echo Registrando tareas del CEO Autonomo v3 (2 rondas nocturnas)...
echo Repo: %REPO_DIR%
echo.

REM Eliminar TODAS las tareas viejas
schtasks /Delete /TN "GolfersPlus-CEO-Autonomo" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-FlowE2E" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DeadEndHunter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-RefactorSecurity" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-4-QADesign" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-5-ResumenCEO" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-DeadEndHunter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DataQuality" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-E2EWriter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-DataQuality" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DeadEndHunter2" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-QADesign" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-4-E2EWriter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-DeadmanSwitch" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-TokenWarmup" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-TokenWarmup2" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-NightPipeline" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-Round2" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-TokenWarmup-R2" /F 2>nul

powershell -Command ^
  "$repo = '%REPO_DIR%'; $script = '%SCRIPT%'; " ^
  "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -DontStopOnIdleEnd -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit (New-TimeSpan -Hours 8); " ^
  "" ^
  "# Token warmup pre-ronda 1" ^
  "$wuAction = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --warmup') -WorkingDirectory $repo; " ^
  "$wuTrigger = New-ScheduledTaskTrigger -Daily -At '23:30'; " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-CEO-TokenWarmup' -Action $wuAction -Trigger $wuTrigger -Settings $settings -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-CEO-TokenWarmup a las 23:30'; " ^
  "" ^
  "# Ronda 1: 4 agentes en cadena" ^
  "$r1Action = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --now all --round 1') -WorkingDirectory $repo; " ^
  "$r1Trigger = New-ScheduledTaskTrigger -Daily -At '00:00'; " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-CEO-NightPipeline' -Action $r1Action -Trigger $r1Trigger -Settings $settings -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-CEO-NightPipeline (Ronda 1) a las 00:00'; " ^
  "" ^
  "# Token warmup pre-ronda 2" ^
  "$wu2Action = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --warmup') -WorkingDirectory $repo; " ^
  "$wu2Trigger = New-ScheduledTaskTrigger -Daily -At '04:50'; " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-CEO-TokenWarmup-R2' -Action $wu2Action -Trigger $wu2Trigger -Settings $settings -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-CEO-TokenWarmup-R2 a las 04:50'; " ^
  "" ^
  "# Ronda 2: retoma + secciones nuevas + briefing a las 7:30" ^
  "$r2Action = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --now all --round 2') -WorkingDirectory $repo; " ^
  "$r2Trigger = New-ScheduledTaskTrigger -Daily -At '05:00'; " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-CEO-Round2' -Action $r2Action -Trigger $r2Trigger -Settings $settings -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-CEO-Round2 (Ronda 2) a las 05:00'; " ^
  "" ^
  "# Deadman switch" ^
  "$dmAction = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --deadman') -WorkingDirectory $repo; " ^
  "$dmTrigger = New-ScheduledTaskTrigger -Daily -At '08:00'; " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-CEO-DeadmanSwitch' -Action $dmAction -Trigger $dmTrigger -Settings $settings -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-CEO-DeadmanSwitch a las 08:00'"

echo.
echo Listo. 5 tareas registradas.
echo.
echo PIPELINE NOCTURNO (2 ventanas de tokens):
echo   23:30  TokenWarmup      (refresca OAuth)
echo   00:00  Ronda 1          (4 agentes en cadena)
echo   04:50  TokenWarmup R2   (refresca OAuth antes de ronda 2)
echo   05:00  Ronda 2          (retoma + secciones nuevas + briefing 7:30)
echo   08:00  DeadmanSwitch    (alerta si algo fallo)
echo.
echo Para verificar: powershell -Command "Get-ScheduledTask | Where { $_.TaskName -like 'GolfersPlus*' }"
pause
