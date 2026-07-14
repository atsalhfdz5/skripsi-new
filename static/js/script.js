let currentStream = null;
let modalBackdrop = null;
let streamInterval = null; 
let currentCameraIndex = 0; // Menyimpan indeks kamera yang aktif untuk fitur ganti lensa otomatis

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

    // Fungsi Utama Buka Kamera & Deteksi Lensa Utama (1x)
    function startRealtime() {
        if (cameraModal) cameraModal.style.display = 'flex';

        // Hentikan stream aktif sebelum membuka stream baru (mencegah kamera freeze/lock)
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(function(initialStream) {
            return navigator.mediaDevices.enumerateDevices()
            .then(function(devices) {
                initialStream.getTracks().forEach(track => track.stop());

                const videoDevices = devices.filter(device => device.kind === 'videoinput');
                
                // Urutkan dan saring kamera belakang secara ketat
                let backCameras = videoDevices.filter(device => {
                    const label = device.label.toLowerCase();
                    return label.includes('back') || label.includes('rear') || label.includes('camera 0') || label.includes('lingkungan');
                });

                // Jika pemfilteran string gagal, gunakan semua kamera input sebagai fallback
                if (backCameras.length === 0) backCameras = videoDevices;

                let constraints = {
                    video: {
                        facingMode: { ideal: "environment" },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                };

                if (backCameras.length > 0) {
                    // Berpindah indeks kamera setiap kali tombol "Buka Kamera" ditekan kembali
                    let targetIndex = currentCameraIndex % backCameras.length;
                    const selectedCamera = backCameras[targetIndex];
                    
                    constraints.video = {
                        deviceId: { exact: selectedCamera.deviceId },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    };
                    
                    console.log(`Mengaktifkan kamera lensa indeks ke-[${targetIndex}]:`, selectedCamera.label);
                    // Siapkan indeks berikutnya jika pengguna ingin mengganti kamera lagi
                    currentCameraIndex++;
                }

                return navigator.mediaDevices.getUserMedia(constraints);
            });
        })
        .then(function(stream) {
            initStream(stream);
        })
        .catch(function(err) {
            console.error("Gagal mengunci spesifikasi kamera khusus:", err);
            navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(function(stream) {
                initStream(stream);
            })
            .catch(function(finalErr) {
                alert("Mohon izinkan akses kamera di browser Anda!");
                if (cameraModal) cameraModal.style.display = 'none';
            });
        });
    }

    function initStream(stream) {
        videoStream.srcObject = stream;
        currentStream = stream;
        videoStream.play();
        
        if (streamInterval) clearInterval(streamInterval);
        
        if (captureBtn) {
            captureBtn.style.display = 'inline-block';
            captureBtn.textContent = "📸 Jepret";
            captureBtn.disabled = false;
        }
    }

    // Logika Mengambil Foto (Snapshot)
    if (captureBtn) {
        captureBtn.addEventListener('click', () => {
            if (videoStream.readyState === videoStream.HAVE_ENOUGH_DATA && captureCanvas) {
                captureCanvas.width = videoStream.videoWidth;
                captureCanvas.height = videoStream.videoHeight;
                
                const ctx = captureCanvas.getContext('2d');
                ctx.drawImage(videoStream, 0, 0, captureCanvas.width, captureCanvas.height);
                
                captureCanvas.toBlob((blob) => {
                    if (!blob) return;
                    eksekusiPrediksi(blob, captureBtn, true);
                }, 'image/jpeg', 0.9);
            }
        });
    }

    // Fungsi Berbagi Pengiriman Form Data ke API Backend Flask
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
                // Update teks di modal kamera
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

                // Tampilkan gambar hasil bounding box di video stream
                if (data.result_image_url) {
                    let img = document.getElementById('captureResult');
                    if (!img) {
                        img = document.createElement('img');
                        img.id = 'captureResult';
                        img.style.cssText = 'width:100%; border-radius:8px; margin-top:6px;';
                        videoStream.parentNode.insertBefore(img, videoStream.nextSibling);
                    }
                    img.src = data.result_image_url + '?t=' + new Date().getTime();
                }
            } else {
                // Update kotak hasil di bawah kartu upload
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
            videoStream.style.backgroundImage = 'none';
        }
    }

    if (cameraBtn) cameraBtn.addEventListener('click', startRealtime);
    if (stopCameraBtn) stopCameraBtn.addEventListener('click', stopCamera);

    window.closeCamera = stopCamera;

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && cameraModal && cameraModal.style.display !== 'none') {
            stopCamera();
        }
    });
});