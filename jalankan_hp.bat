@echo off
echo Menyalakan Akses HP (Ngrok)...
cd /d "%~dp0"
if not exist ngrok.exe (
    echo [ERROR] File ngrok.exe tidak ditemukan di folder ini!
    echo Silakan pindahkan file ngrok.exe ke folder sahabatpeteniai terlebih dahulu.
    pause
    exit
)
ngrok http 8000
pause