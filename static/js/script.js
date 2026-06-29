let currentStream = null;
let modalBackdrop = null;
let streamInterval = null; 

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
        
        if (document.getElementById('textPenyakit')) document.getElementById('textPenyakit').innerText = '-';
        if (document.getElementById('textAkurasi')) document.getElementById('textAkurasi').innerText = '-';
        if (document.getElementById('textPenjelasan')) document.getElementById('textPenjelasan').innerText = 'Silakan unggah foto daun padi terlebih dahulu.';
        if (document.getElementById('textSaran')) document.getElementById('textSaran').innerText = '-';
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

    function startRealtime() {
        if (cameraModal) cameraModal.style.display = 'flex';

        navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: 640, 
                height: 640,
                facingMode: "environment" 
            } 
        })
        .then(function(stream) {
            initStream(stream);
        })
        .catch(function(err) {
            console.warn("Kamera belakang tidak ditemukan, mencoba kamera default...", err);
            navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 640 } })
            .then(function(stream) {
                initStream(stream);
            })
            .catch(function(finalErr) {
                console.error("Gagal membuka kamera: " + finalErr);
                alert("Mohon izinkan akses kamera di browser Anda!");
                if (cameraModal) cameraModal.style.display = 'none';
            });
        });
    }

    function initStream(stream) {
        videoStream.srcObject = stream;
        currentStream = stream;
        videoStream.play();
        
        streamInterval = setInterval(() => {
            if (videoStream.readyState === videoStream.HAVE_ENOUGH_DATA && captureCanvas) {
                captureCanvas.width = videoStream.videoWidth;
                captureCanvas.height = videoStream.videoHeight;
                const ctx = captureCanvas.getContext('2d');
                ctx.drawImage(videoStream, 0, 0, captureCanvas.width, captureCanvas.height);
                
                let dataURL = captureCanvas.toDataURL('image/jpeg', 0.6);
                socket.emit('video_frame', dataURL);
            }
        }, 250);
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
        if (e.key === 'Escape' && cameraModal.style.display !== 'none') {
            stopCamera();
        }
    });
});

socket.on('response_frame', function(data) {
    const videoStream = document.getElementById('videoStream');
    const cameraModal = document.getElementById('cameraModal');
    if (data.image_url && cameraModal && cameraModal.style.display !== 'none' && videoStream) {
        videoStream.style.backgroundImage = `url('${data.image_url}')`;
        videoStream.style.backgroundSize = 'cover';
        videoStream.style.backgroundPosition = 'center';
        
        if (document.getElementById('textPenyakit')) document.getElementById('textPenyakit').innerText = data.label;
        if (document.getElementById('textAkurasi')) document.getElementById('textAkurasi').innerText = data.confidence;
        if (document.getElementById('textPenjelasan')) document.getElementById('textPenjelasan').innerText = data.penjelasan;
        if (document.getElementById('textSaran')) document.getElementById('textSaran').innerText = data.saran;
    }
});
