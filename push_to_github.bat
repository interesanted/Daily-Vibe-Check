@echo off
title Push Daily Vibe Check to GitHub
echo =======================================================
echo         Daily Vibe Check - Auto-Publisher
echo =======================================================
echo.

:: Move to the directory where this batch file is located
cd /d "%~dp0"

:: Check if git is installed
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git command-line tool was not found in your system PATH.
    echo.
    echo If you use GitHub Desktop, please open it, commit your changes,
    echo and click "Push origin" at the top!
    echo.
    echo If you want to install Git, download it from:
    echo https://git-scm.com/downloads
    echo.
    pause
    exit /b 1
)

echo Adding modified files to Git...
git add .

echo.
echo Committing changes...
git commit -m "Fix Android Chrome voice dictation doubling and add Cozy Toasts"

echo.
echo Uploading to GitHub...
git push

echo.
echo =======================================================
echo [SUCCESS] Changes uploaded to GitHub successfully!
echo Netlify will update your live site in 3-5 seconds.
echo =======================================================
echo.
pause
