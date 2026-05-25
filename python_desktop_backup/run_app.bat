@echo off
title Launching DailyAAR Journal App...
echo =======================================================
echo           DailyAAR Journal App Launcher
echo =======================================================
echo.

:: Move to the directory where this batch file is located
cd /d "%~dp0"

:: Check if Python is installed via 'py' command
where py >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python launcher 'py' was not found on your system.
    echo Please install Python 3.13 from https://www.python.org/downloads/
    echo and ensure "Add Python to PATH" is checked during installation.
    echo.
    pause
    exit /b 1
)

:: Confirm dependencies are installed
echo Checking for required python dependencies...
py -c "import customtkinter, google.genai" >nul 2>&1
if %errorlevel% neq 0 (
    echo Dependencies not found. Installing now...
    py -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install python dependencies. Please check your internet connection.
        pause
        exit /b 1
    )
    echo Dependencies installed successfully!
    echo.
)

:: Launch the main application
echo Launching the application...
echo You can close this window after you close the application.
echo.
py app.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] The application closed with an error code.
    pause
)
