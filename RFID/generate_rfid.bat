@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Multi-Server RFID Simulator Launcher (Background)
echo ========================================

REM RFID ports start at 5000 (rfid_id = port, maps to camera_id = port - 2000 in camps.json)
REM Camera simulator uses 3000-3606, so RFID uses 5000-5606 — no port conflicts.
echo NOTE: RFID ports must be 5000-5606 (rfid_id = port, camera_id = port - 2000).
echo       Camera simulator uses 3000-3606. Do NOT overlap.
echo.
set /p N="Enter number of instances (N): "
set /p BASE_PORT="Enter base port number (P, must start at 5000): "
set /a LAST_INDEX=%N%-1

if "%N%"=="" (
    echo Error: Number of instances cannot be empty!
    pause
    exit /b 1
)
if "%BASE_PORT%"=="" (
    echo Error: Base port cannot be empty!
    pause
    exit /b 1
)

echo.
echo Starting %N% RFID simulator instances in background...
set /a MAX_PORT=%BASE_PORT% + %LAST_INDEX%
echo Ports (rfid_id): %BASE_PORT% to !MAX_PORT!
echo.

if not exist logs mkdir logs

if exist rfid_server_ports.txt del rfid_server_ports.txt
if exist rfid_server_pids.txt del rfid_server_pids.txt

for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    echo Starting RFID simulator on port !PORT! (rfid_id=!PORT!)...

    start /B "" node server.js !PORT! > logs\rfid_server_!PORT!.log 2>&1

    echo !PORT! >> rfid_server_ports.txt
    echo RFID simulator on port !PORT! started
    echo.
)

echo.
echo ========================================
echo All %N% RFID simulator instances started!
echo.
echo Ports in use:
for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    echo   Port !PORT!
)
echo.
echo Individual log files:
for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    echo   logs\rfid_server_!PORT!.log
)
echo.
echo Access the streaming RFID data at:
for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    echo   http://localhost:!PORT!/cgi-bin/videoStatServer.cgi
)
echo.
echo Download today's event log at:
for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    echo   http://localhost:!PORT!/cgi-bin/logs
)
echo ========================================
echo.
echo Tip: Use 'tasklist /fi "imagename eq node.exe"' to view running Node processes
echo Tip: Run kill-rfid-servers-win.bat to stop all instances
echo.
pause
