@echo off
rem Slide Koubou launcher: starts the local server and opens the browser.
python "%~dp0tools\serve.py" --open
if errorlevel 1 pause
