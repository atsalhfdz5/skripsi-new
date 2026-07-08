let currentStream = null;
let modalBackdrop = null;
let streamInterval = null; 

// Hubungan socket tetap dipertahankan jika backend membutuhkannya, 
// namun tidak lagi digunakan untuk mengirim frame video.
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

    // Sembunyikan tombol capture di awal sebelum kamera aktif
    if (captureBtn) captureBtn.style.display = 'none';

    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

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
        
        // Bersihkan teks kontainer hasil analisis halaman utama
        if (document.getElementById('textPenyakit')) document.getElementById('textPenyakit').innerText = '-';
        if (document.getElementById('textAkurasi')) document.getElementById('textAkurasi').innerText = '-';
        if (document.getElementById('textPenjelasan')) document.getElementById('textPenjelasan').innerText = 'Silakan unggah foto daun padi terlebih dahulu.';
        if (document.getElementById('textSaran')) document.getElementById('textSaran').innerText = '-';

        const oldResult = document.getElementById('hasil-analisis');
        if (oldResult) oldResult.remove();
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

    // Endpoint Handler untuk UPLOAD FILE MANUAL via HTTP POST
    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            const file = fileInput.files[0];
            if (!file) {
                alert("Silakan pilih atau seret gambar terlebih dahulu!");
                return;
            }

            submitBtn.innerText = "Sedang Menganalisis...";
            submitBtn.disabled = true;

            let formData = new FormData();
            formData.append("image", file);

            fetch("/predict", {
                method: "POST",
                body: formData
            })
            .then(response => {
                if (!response.ok) throw new Error("HTTP error " + response.status);
                return response.json();
            })
            .then(data => {
                if (data.result_image_url) {
                    preview.src = data.result_image_url + "?t=" + new Date().getTime();
                    
                    const oldResult = document.getElementById('hasil-analisis');
                    if (oldResult) oldResult.remove();

                    const resultDiv = document.createElement('div');
                    resultDiv.id = 'hasil-analisis';
                    resultDiv.style.marginTop = '15px';
                    resultDiv.style.padding = '15px';
                    resultDiv.style.backgroundColor = '#f4f9f4';
                    resultDiv.style.borderLeft = '5px solid #2e7d32';
                    resultDiv.style.borderRadius = '4px';
                    resultDiv.style.textAlign = 'left';

                    resultDiv.innerHTML = `
                        <h4 style="margin:0 0 5px 0; color:#2e7d32;">Hasil Deteksi: ${data.nama_penyakit}</h4>
                        <p style="margin: 0 0 10px 0; font-size: 14px;"><b>Tingkat Kepercayaan:</b> ${data.confidence}</p>
                        <p style="margin: 0 0 10px 0; font-size: 14px;"><b>Penjelasan:</b> ${data.deskripsi}</p>
                        <p style="margin: 0; font-size: 14px; color: #c62828;"><b>Saran Penanganan:</b> ${data.solusi}</p>
                    `;
                    
                    fileInfo.parentNode.insertBefore(resultDiv, fileInfo.nextSibling);

                } else {
                    alert("Gagal memproses gambar: " + data.error);
                }
            })
            .catch(error => {
                console.error("Error:", error);
                alert("Terjadi kesalahan saat menyambung ke server AI.");
            })
            .finally(() => {
                submitBtn.innerText = "Kirim ke AI";
                submitBtn.disabled = false;
            });
        });
    }

    if (tryBtn) tryBtn.addEventListener('click', () => fileInput && fileInput.click());

    // Fungsi Inisialisasi Kamera dengan Bypass Proteksi Enkripsi Label Kamera
    function startRealtime() {
        if (cameraModal) cameraModal.style.display = 'flex';

        // Langkah 1: Pancing izin akses kamera dasar untuk membuka enkripsi penamaan label perangkat oleh browser
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(function(initialStream) {
            
            // Langkah 2: Ambil rincian modul hardware yang tersedia
            return navigator.mediaDevices.enumerateDevices()
            .then(function(devices) {
                // Matikan stream pancingan agar modul perangkat kamera tidak sibuk (busy)
                initialStream.getTracks().forEach(track => track.stop());

                const videoDevices = devices.filter(device => device.kind === 'videoinput');
                
                // Cari kamera belakang utama berdasarkan kecocokan label sistem operasi
                const backCameras = videoDevices.filter(device => {
                    const label = device.label.toLowerCase();
                    return label.includes('back') || label.includes('rear') || label.includes('camera 0') || label.includes('lingkungan');
                });

                let constraints = {
                    video: {
                        facingMode: { ideal: "environment" },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                };

                // Jika modul multi-lensa terdeteksi, kunci id kamera utama di indeks pertama [0]
                // Catatan: Jika [0] masih memicu lensa wide pada tipe HP Anda, ubah nilai indeks ke [1]
                if (backCameras.length > 0) {
                    const mainCamera = backCameras[0]; 
                    constraints.video = {
                        deviceId: { exact: mainCamera.deviceId },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    };
                    console.log("Mengunci kamera utama:", mainCamera.label);
                }

                return navigator.mediaDevices.getUserMedia(constraints);
            });
        })
        .then(function(stream) {
            initStream(stream);
        })
        .catch(function(err) {
            console.error("Gagal mengunci spesifikasi kamera utama:", err);
            // Fallback otomatis jika skema penargetan ID khusus ditolak/gagal
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

    // Mengaktifkan aliran preview lokal ke elemen video tanpa pemancar interval loop socket
    function initStream(stream) {
        videoStream.srcObject = stream;
        currentStream = stream;
        videoStream.play();
        
        // Pastikan interval sisa loop websocket terhapus bersih
        if (streamInterval) clearInterval(streamInterval);
        
        // Munculkan tombol Ambil Foto (Snapshot) ke layar interface modal
        if (captureBtn) {
            captureBtn.style.display = 'inline-block';
            captureBtn.innerText = "Ambil Foto";
            captureBtn.disabled = false;
        }
    }

    // Fitur Pemicu Tombol Ambil Foto (SNAPSHOT) dan Kirim Data Ke Server AI via HTTP POST
    if (captureBtn) {
        captureBtn.addEventListener('click', () => {
            if (videoStream.readyState === videoStream.HAVE_ENOUGH_DATA && captureCanvas) {
                // Set resolusi canvas penangkap gambar setara resolusi asli input sensor kamera
                captureCanvas.width = videoStream.videoWidth;
                captureCanvas.height = videoStream.videoHeight;
                
                const ctx = captureCanvas.getContext('2d');
                ctx.drawImage(videoStream, 0, 0, captureCanvas.width, captureCanvas.height);
                
                // Konversi tangkapan matriks kanvas ke tipe Blob data biner JPEG kualitas tinggi (90%)
                captureCanvas.toBlob((blob) => {
                    if (!blob) return;

                    captureBtn.innerText = "Menganalisis...";
                    captureBtn.disabled = true;

                    let formData = new FormData();
                    formData.append("image", blob, "snapshot.jpg");

                    // Kirim ke endpoint analisis backend Flask
                    fetch("/predict", {
                        method: "POST",
                        body: formData
                    })
                    .then(response => {
                        if (!response.ok) throw new Error("HTTP error " + response.status);
                        return response.json();
                    })
                    .then(data => {
                        if (data.result_image_url) {
                            // Salin parameter teks umpan balik analisis ke komponen UI teks di dashboard Anda
                            if (document.getElementById('textPenyakit')) document.getElementById('textPenyakit').innerText = data.nama_penyakit;
                            if (document.getElementById('textAkurasi')) document.getElementById('textAkurasi').innerText = data.confidence;
                            if (document.getElementById('textPenjelasan')) document.getElementById('textPenjelasan').innerText = data.deskripsi;
                            if (document.getElementById('textSaran')) document.getElementById('textSaran').innerText = data.solusi;
                            
                            // Tampilkan frame statis ber-bounding box YOLO ke latar belakang monitor video preview
                            videoStream.style.backgroundImage = `url('${data.result_image_url}?t=${new Date().getTime()}')`;
                            videoStream.style.backgroundSize = 'cover';
                            videoStream.style.backgroundPosition = 'center';
                        } else {
                            alert("Gagal memproses snapshot: " + data.error);
                        }
                    })
                    .catch(error => {
                        console.error("Error Snapshot POST:", error);
                        alert("Terjadi kesalahan saat menyambung ke server AI.");
                    })
                    .finally(() => {
                        captureBtn.innerText = "Ambil Foto";
                        captureBtn.disabled = false;
                    });
                }, 'image/jpeg', 0.9);
            }
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
    if (closeModalBtn) closeModalBtn.addEventListener('click', (e) => { e.preventDefault(); stopCamera(); });

    window.closeCamera = stopCamera;

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && cameraModal && cameraModal.style.display !== 'none') {
            stopCamera();
        }
    });
});