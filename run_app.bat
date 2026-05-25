@echo off
title Daily Vibe PWA Static Web Server
echo =======================================================
echo           Daily Vibe PWA Web Launcher
echo =======================================================
echo.

:: Move to the directory where this batch file is located
cd /d "%~dp0"

:: Check if Python is installed
where py >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python launcher 'py' was not found on your system.
    echo Please install Python from https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

:: Automatically open default browser to localhost
echo Opening your web browser to http://localhost:8000...
start http://localhost:8000

:: Start the built-in python static server
echo Starting Python static file server on port 8000...
echo Keep this window open while using the app. Close it to shut down.
echo.
py -m http.server 8000
