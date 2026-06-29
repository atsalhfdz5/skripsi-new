@echo off
title Peluncur Otomatis SahabatPetani AI
echo --------------------------------------------------
echo [1/2] Membersihkan sisa koneksi port lama yang macet...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /F /PID %%a 2>nul
echo --------------------------------------------------
echo [2/2] Menyalakan Server SahabatPetani AI...
echo --------------------------------------------------
python app.py
pause