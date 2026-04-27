
@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Multi-Server Instance Launcher (Background)
echo ========================================

REM Get inputs from user
echo NOTE: Camera simulator must use ports 3000-3606 (port = camera_id).
echo       RFID simulator should use a different range e.g. starting at 5000.
echo.
set /p N="Enter number of instances (N): "
set /p BASE_PORT="Enter base port number (P, must start at 3000): "
set /a LAST_INDEX=%N%-1

REM Validate inputs
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
echo Starting %N% server instances in background from port %BASE_PORT% to %BASE_PORT% + %N% - 1...
echo.

REM Create log directory if it doesn't exist
if not exist logs mkdir logs

REM Clear previous port list
if exist server_ports.txt del server_ports.txt
if exist server_pids.txt del server_pids.txt

REM Start each server instance in background
for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    echo Starting server on port !PORT!...
    
    REM Run in background with output redirected to log files
    start /B node server.js !PORT! > logs\server_!PORT!.log 2>&1
    
    REM Store the port number
    echo !PORT! >> server_ports.txt
    
    echo Server on port !PORT! started (running in background)
    echo.
)

echo.
echo ========================================
echo All %N% servers started in background!
echo.
echo Ports used: 
for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    echo Port !PORT!
)
echo.
echo Log files are in 'logs\' folder: 
for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    echo logs\server_!PORT!.log
)
echo.
echo Check each server at:
for /l %%i in (0,1,%LAST_INDEX%) do (
    set /a PORT=%BASE_PORT% + %%i
    echo http://localhost:!PORT!/cgi-bin/videoStatServer.cgi
)
echo ========================================
echo.
echo Use 'tasklist /fi "imagename eq node.exe"' to see running servers
echo Use 'kill-servers.bat' to stop all servers
echo.
pause
