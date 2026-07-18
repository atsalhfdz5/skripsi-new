let currentStream = null;
let modalBackdrop = null;
let streamInterval = null; 
let currentCameraIndex = 0;

const socket = io.connect(window.location.origin);

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const preview = document.getElementById('preview');
    const fileInfo = document.getElementById('fileInfo');
    const clearBtn = document.getElementById('clearBtn');
    const submitBtn = document.getElementById('submitBtn');
    const cameraBtn = document.getElementById('cameraBtn');
    const cameraModal = document.getElementById('cameraModal');
    const videoStream = document.getElementById('videoStream');
    const captureCanvas = document.getElementById('captureCanvas');
    const captureBtn = document.getElementById('captureBtn');
    const stopCameraBtn = document.getElementById('stopCameraBtn');
    const closeModalBtn = document.getElementById('closeModal');
    const tryBtn = document.getElementById('tryBtn');
    const zoomSlider = document.getElementById('zoomSlider'); 

    if (captureBtn) captureBtn.style.display = 'none';

    // Handler Upload Manual
    function showPreview(file) {
        if (!file) return;
        const url = URL.createObjectURL(file);
        preview.src = url;
        preview.style.display = 'block';
        fileInfo.style.display = 'block';
        fileInfo.textContent = `${file.name} — ${formatBytes(file.size)}`;
        clearBtn.style.display = 'inline-block';
        submitBtn.style.display = 'inline-block';
    }

    function clearPreview() {
        preview.src = '';
        preview.style.display = 'none';
        fileInfo.style.display = 'none';
        fileInfo.textContent = '';
        clearBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        if (fileInput) fileInput.value = '';
        
        if (document.getElementById('textPenyakit')) document.getElementById('textPenyakit').innerText = '-';
        if (document.getElementById('textAkurasi')) document.getElementById('textAkurasi').innerText = '-';
        if (document.getElementById('textPenjelasan')) document.getElementById('textPenjelasan').innerText = 'Silakan unggah foto daun padi terlebih dahulu.';
        if (document.getElementById('textSaran')) document.getElementById('textSaran').innerText = '-';

        const oldResult = document.getElementById('hasil-analisis');
        if (oldResult) oldResult.remove();
        const uploadResult = document.getElementById('uploadResult');
        if (uploadResult) { uploadResult.style.display = 'none'; uploadResult.innerHTML = ''; }
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) showPreview(f);
        });
    }

    if (dropZone) {
        ['dragenter', 'dragover'].forEach(ev => {
            dropZone.addEventListener(ev, (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });
        });
        ['dragleave', 'drop'].forEach(ev => {
            dropZone.addEventListener(ev, (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
            });
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files[0]) {
                const f = dt.files[0];
                if (fileInput) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(f);
                    fileInput.files = dataTransfer.files;
                }
                showPreview(f);
            }
        });
        dropZone.addEventListener('click', () => fileInput && fileInput.click());
    }

    if (clearBtn) clearBtn.addEventListener('click', clearPreview);

    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            const file = fileInput.files[0];
            if (!file) {
                alert("Silakan pilih atau seret gambar terlebih dahulu!");
                return;
            }
            eksekusiPrediksi(file, submitBtn, false);
        });
    }

    if (tryBtn) tryBtn.addEventListener('click', () => fileInput && fileInput.click());

    function startRealtime() {
        if (cameraModal) cameraModal.style.display = 'flex';

        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        navigator.mediaDevices.getUserMedia({ video: true })
        .then(() => navigator.mediaDevices.enumerateDevices())
        .then(devices => {
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            let targetDeviceId = null;

            for (const device of videoDevices) {
                const label = device.label.toLowerCase();
                if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
                    if (!label.includes('ultra') && !label.includes('0.5')) {
                        targetDeviceId = device.deviceId;
                        break;
                    }
                }
            }

            const constraints = targetDeviceId 
                ? { video: { deviceId: { exact: targetDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } }
                : { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } };

            return navigator.mediaDevices.getUserMedia(constraints);
        })
        .then(stream => {
            initStream(stream);
        })
        .catch(err => {
            console.error("Gagal mengakses kamera presisi:", err);
            navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => initStream(stream))
            .catch(() => {
                alert("Mohon izinkan akses kamera di browser Anda!");
                if (cameraModal) cameraModal.style.display = 'none';
            });
        });
    }

    function initStream(stream) {
        videoStream.srcObject = stream;
        currentStream = stream;
        videoStream.play();
        
        // Sembunyikan hasil jepretan sebelumnya jika ada
        const existingImg = document.getElementById('captureResult');
        if (existingImg) existingImg.style.display = 'none';

        if (streamInterval) clearInterval(streamInterval);
        
        if (captureBtn) {
            captureBtn.style.display = 'inline-block';
            captureBtn.textContent = "📸 Jepret & Analisis";
            captureBtn.disabled = false;
        }

        // Logika Hybrid Zoom
        if (zoomSlider) {
            const track = stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities ? track.getCapabilities() : {};
            
            zoomSlider.disabled = false;
            zoomSlider.min = 1;
            zoomSlider.max = 3;
            zoomSlider.step = 0.1;
            zoomSlider.value = 1;
            videoStream.style.transform = `scale(1)`;
            videoStream.style.transformOrigin = 'center center';

            window.supportHardwareZoom = 'zoom' in capabilities;

            if (window.supportHardwareZoom) {
                zoomSlider.min = capabilities.zoom.min;
                zoomSlider.max = capabilities.zoom.max;
                zoomSlider.step = capabilities.zoom.step;
                zoomSlider.value = track.getSettings().zoom || 1;
            }

            zoomSlider.oninput = () => {
                const zoomValue = parseFloat(zoomSlider.value);
                if (window.supportHardwareZoom) {
                    track.applyConstraints({ advanced: [{ zoom: zoomValue }] })
                         .catch(err => console.error("Hardware zoom error:", err));
                } else {
                    videoStream.style.transform = `scale(${zoomValue})`;
                }
            };
        }
    }

    // Logika Mengambil Foto & Reset State Kamera
    if (captureBtn) {
        captureBtn.addEventListener('click', () => {
            const existingImg = document.getElementById('captureResult');
            
            // MODE RESET: Jika gambar hasil sedang tampil, kembalikan ke live kamera utuh
            if (existingImg && existingImg.style.display === 'block') {
                existingImg.style.display = 'none'; // Sembunyikan overlay
                captureBtn.textContent = "📸 Jepret & Analisis";
                
                // Reset teks hasil kembali bersih
                const elPenyakit = document.getElementById('textPenyakit');
                const elAkurasi = document.getElementById('textAkurasi');
                const elPenjelasan = document.getElementById('textPenjelasan');
                const elSaran = document.getElementById('textSaran');
                const confBox = document.getElementById('hasil-kamera-text');

                if (elPenyakit) elPenyakit.innerText = '-';
                if (elAkurasi) elAkurasi.innerText = '-';
                if (elPenjelasan) elPenjelasan.innerText = '-';
                if (elSaran) elSaran.innerText = '-';
                if (confBox) confBox.className = 'confidence-box';
                
                return; // Batalkan proses dan biarkan user membidik lagi
            }

            // MODE JEPRET: Tangkap frame dan kirim ke API
            if (videoStream.readyState === videoStream.HAVE_ENOUGH_DATA && captureCanvas) {
                captureCanvas.width = videoStream.videoWidth;
                captureCanvas.height = videoStream.videoHeight;
                
                const ctx = captureCanvas.getContext('2d');
                const currentScale = zoomSlider ? parseFloat(zoomSlider.value) : 1;

                if (!window.supportHardwareZoom && currentScale > 1) {
                    const w = captureCanvas.width;
                    const h = captureCanvas.height;
                    const sw = w / currentScale;
                    const sh = h / currentScale;
                    const sx = (w - sw) / 2;
                    const sy = (h - sh) / 2;
                    
                    ctx.drawImage(videoStream, sx, sy, sw, sh, 0, 0, w, h);
                } else {
                    ctx.drawImage(videoStream, 0, 0, captureCanvas.width, captureCanvas.height);
                }
                
                captureCanvas.toBlob((blob) => {
                    if (!blob) return;
                    eksekusiPrediksi(blob, captureBtn, true);
                }, 'image/jpeg', 0.9);
            }
        });
    }

    function eksekusiPrediksi(fileOrBlob, buttonComponent, isSnapshotMode) {
        const textAwal = buttonComponent.innerText;
        buttonComponent.innerText = "Menganalisis...";
        buttonComponent.disabled = true;

        let formData = new FormData();
        formData.append("image", fileOrBlob, isSnapshotMode ? "snapshot.jpg" : undefined);

        fetch("/predict", {
            method: "POST",
            body: formData
        })
        .then(response => {
            if (!response.ok) throw new Error("HTTP error " + response.status);
            return response.json();
        })
        .then(data => {
            if (isSnapshotMode) {
                const elPenyakit   = document.getElementById('textPenyakit');
                const elAkurasi    = document.getElementById('textAkurasi');
                const elPenjelasan = document.getElementById('textPenjelasan');
                const elSaran      = document.getElementById('textSaran');
                const confBox      = document.getElementById('hasil-kamera-text');

                if (elPenyakit)   elPenyakit.innerText   = (data.terdeteksi ? "✅ " : "⚠️ ") + data.nama_penyakit;
                if (elAkurasi)    elAkurasi.innerText    = data.confidence;
                if (elPenjelasan) elPenjelasan.innerText = data.deskripsi;
                if (elSaran)      elSaran.innerText      = data.solusi;

                if (confBox) {
                    confBox.classList.remove('detected', 'not-detected');
                    confBox.classList.add(data.terdeteksi ? 'detected' : 'not-detected');
                }

                // Tampilkan gambar OVERLAY absolut, di atas kamera agar tidak geser
                if (data.result_image_url) {
                    let img = document.getElementById('captureResult');
                    if (!img) {
                        img = document.createElement('img');
                        img.id = 'captureResult';
                        // Gaya absolute agar menutupi video tanpa merusak layout kotak
                        img.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 10; border-radius: inherit;';
                        videoStream.parentNode.appendChild(img);
                    }
                    img.src = data.result_image_url + '?t=' + new Date().getTime();
                    img.style.display = 'block'; 
                }
            } else {
                const resultDiv = document.getElementById('uploadResult');
                if (resultDiv) {
                    resultDiv.className = 'upload-result ' + (data.terdeteksi ? 'detected' : 'not-detected');
                    if (data.terdeteksi) {
                        resultDiv.innerHTML = `
                            <p><strong>✅ ${data.nama_penyakit}</strong></p>
                            <p><strong>Akurasi:</strong> ${data.confidence}</p>
                            <p><strong>Deskripsi:</strong> ${data.deskripsi}</p>
                            <p><strong>Solusi:</strong> ${data.solusi}</p>
                            ${data.result_image_url ? `<img src="${data.result_image_url}?t=${new Date().getTime()}" alt="Hasil deteksi">` : ''}
                        `;
                    } else {
                        resultDiv.innerHTML = `<p>⚠️ <strong>${data.nama_penyakit}</strong></p><p>${data.deskripsi}</p>`;
                    }
                    resultDiv.style.display = 'block';
                }
                if (data.result_image_url) {
                    preview.src = data.result_image_url + '?t=' + new Date().getTime();
                }
            }
        })
        .catch(error => {
            console.error("Error Core AI Predict:", error);
            alert("Terjadi kesalahan saat menyambung ke server AI.");
        })
        .finally(() => {
            buttonComponent.textContent = isSnapshotMode ? "📸 Jepret Lagi" : textAwal;
            buttonComponent.disabled = false;
        });
    }

    function stopCamera() {
        if (cameraModal) cameraModal.style.display = 'none';
        if (streamInterval) clearInterval(streamInterval);
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        if (videoStream) {
            videoStream.srcObject = null;
            videoStream.style.transform = 'scale(1)';
        }
        
        // Bersihkan riwayat gambar saat modal ditutup
        const existingImg = document.getElementById('captureResult');
        if (existingImg) existingImg.style.display = 'none';
    }

    if (cameraBtn) cameraBtn.addEventListener('click', startRealtime);
    if (stopCameraBtn) stopCameraBtn.addEventListener('click', stopCamera);
    if (closeModalBtn) closeModalBtn.addEventListener('click', stopCamera);

    window.closeCamera = stopCamera;

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && cameraModal && cameraModal.style.display !== 'none') {
            stopCamera();
        }
    });
});