import torch
torch.set_num_threads(1)

import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", message=".*Eventlet is deprecated.*")

import os
import cv2
import numpy as np
import base64
from flask import Flask, request, jsonify, render_template
from flask_socketio import SocketIO, emit
from ultralytics import YOLO

base_dir = os.path.abspath(os.path.dirname(__file__))
folder_page = os.path.join(base_dir, 'pages')

app = Flask(__name__, 
            template_folder=folder_page, 
            static_folder=base_dir, 
            static_url_path='')
socketio = SocketIO(app, cors_allowed_origins="*")

path_model = os.path.join(base_dir, 'best.pt')
model = None

def get_model():
    global model
    if model is None:
        try:
            model = YOLO(path_model)
            print("Model dimuat:", path_model)
        except Exception as e:
            print(f"Gagal memuat model: {e}")
            model = None
    return model

THRESHOLD_AKURASI = 0.25

INFO_PENYAKIT = {
    'Bacterial_Leaf_Blight': {
        'nama': 'Hawar Daun Bakteri (Bacterial Leaf Blight)',
        'desc': 'Penyakit yang disebabkan oleh bakteri Xanthomonas oryzae. Gejalanya berupa garis kemerahan atau kecokelatan yang memanjang di tepi daun.',
        'solusi': 'Gunakan pupuk nitrogen sesuai dosis (jangan berlebihan), atur jarak tanam agar tidak terlalu lembap, dan gunakan bakterisida jika serangan parah.'
    },
    'Brown_Spot': {
        'nama': 'Bercak Cokelat (Brown Spot)',
        'desc': 'Disebabkan oleh jamur Helminthosporium oryzae. Gejalanya berupa bercak berbentuk oval berwarna cokelat tua dengan pusat abu-abu pada permukaan daun.',
        'solusi': 'Pastikan kecukupan unsur kalium (K) pada tanah, lakukan drainase berkala, dan gunakan fungisida berbahan aktif mankozeb jika diperlukan.'
    },
    'Leaf_Blast': {
        'nama': 'Blas Daun (Leaf Blast)',
        'desc': 'Disebabkan oleh jamur Magnaporthe oryzae. Gejalanya berupa bercak khas berbentuk belah ketupat dengan ujung meruncing pada daun padi.',
        'solusi': 'Hindari penggunaan pupuk urea berlebih pada fase vegetatif, gunakan varietas tahan blas, dan semprotkan fungisida sistemik.'
    }
}

def core_proses_ai(image_bytes):
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img_asli = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img_asli is None:
            return {'terdeteksi': False, 'label': 'Gambar Korup', 'score': 0, 'penjelasan': '', 'saran': '', 'img_output': None}

        m = get_model()
        if m is None:
            return {'terdeteksi': False, 'label': 'Model Error', 'score': 0, 'penjelasan': 'Model tidak tersedia.', 'saran': '-', 'img_output': None}
        
        results = m(img_asli, conf=THRESHOLD_AKURASI)[0]
        
        terdeteksi_valid = False
        best_conf = 0.0
        best_box = None
        best_label_norm = None
        best_label_asli = None

        for box in results.boxes:
            confidence = float(box.conf[0])
            class_idx = int(box.cls[0])
            pred_label = m.names[class_idx]
            label_norm = pred_label.replace(' ', '_').replace('-', '_')

            if label_norm in INFO_PENYAKIT:
                if confidence > best_conf:
                    best_conf = confidence
                    best_box = box.xyxy[0].tolist()
                    best_label_norm = label_norm
                    best_label_asli = pred_label
                    terdeteksi_valid = True

        if terdeteksi_valid:
            info = INFO_PENYAKIT[best_label_norm]
            xmin, ymin, xmax, ymax = map(int, best_box)
            # PERUBAHAN: Ketebalan kotak menjadi 4, font scale 0.8, ketebalan teks 3
            cv2.rectangle(img_asli, (xmin, ymin), (xmax, ymax), (0, 0, 255), 4)
            teks = f"{best_label_asli} {best_conf:.2f}"
            cv2.putText(img_asli, teks, (xmin, ymin - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 3, cv2.LINE_AA)
        else:
            info = {
                'nama': 'Tidak Terdeteksi',
                'desc': 'Sistem tidak mendeteksi adanya gejala penyakit tanaman padi pada foto ini.',
                'solusi': '-'
            }

        return {
            'terdeteksi': terdeteksi_valid,
            'label': info['nama'] if terdeteksi_valid else "Tidak Terdeteksi",
            'score': best_conf,
            'penjelasan': info['desc'],
            'saran': info['solusi'],
            'img_output': img_asli
        }
    except Exception as e:
        print(f"Error AI processing: {e}")
        return {'terdeteksi': False, 'label': 'Error', 'score': 0, 'penjelasan': 'Gagal memproses analisis.', 'saran': '-', 'img_output': None}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({'error': 'Tidak ada file gambar'}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'Nama file kosong'}), 400

    m = get_model()
    if m is None:
        return jsonify({'error': 'Model tidak tersedia saat ini.'}), 503

    # Menggunakan cv2.imdecode untuk mempertahankan akurasi 58%
    file_bytes = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    if img is None:
        return jsonify({'error': 'Gambar tidak valid'}), 400

    img_clean = img.copy()
    
    # Parameter inference awal yang menghasilkan 58%
    results = m(img, conf=0.30, iou=0.45)[0]
    
    ada_penyakit = False
    best_conf = 0.0
    best_box = None
    best_label = ""
    best_label_norm = ""

    for box in results.boxes:
        conf = float(box.conf[0])
        cls_id = int(box.cls[0])
        label = results.names[cls_id]
        label_norm = label.replace(' ', '_').replace('-', '_')

        if label_norm in INFO_PENYAKIT:
            if conf > best_conf:
                best_conf = conf
                best_box = box.xyxy[0].tolist()
                best_label = label
                best_label_norm = label_norm
                ada_penyakit = True

    deskripsi_penyakit = "Sistem tidak mendeteksi adanya gejala penyakit tanaman padi pada foto ini."
    solusi_penyakit = "Silakan coba unggah kembali foto daun tanaman padi yang lebih jelas untuk analisis ulang."
    tingkat_kepercayaan = 0.0
    nama_penyakit = "Tidak Terdeteksi"

    if ada_penyakit:
        tingkat_kepercayaan = best_conf
        nama_penyakit = INFO_PENYAKIT[best_label_norm]['nama']
        deskripsi_penyakit = INFO_PENYAKIT[best_label_norm]['desc']
        solusi_penyakit = INFO_PENYAKIT[best_label_norm]['solusi']

        # PERUBAHAN: Menggambar kotak dengan ketebalan 4, font scale 0.8, ketebalan teks 3
        x1, y1, x2, y2 = int(best_box[0]), int(best_box[1]), int(best_box[2]), int(best_box[3])
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), 4)
        teks_label = f"{best_label} {best_conf:.2f}"
        cv2.putText(img, teks_label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 3, cv2.LINE_AA)
    
    os.makedirs(os.path.join(base_dir, 'static'), exist_ok=True)
    output_path = "static/hasil_prediksi.jpg"
    cv2.imwrite(os.path.join(base_dir, output_path), img if ada_penyakit else img_clean)

    return jsonify({
        'result_image_url': '/' + output_path,
        'terdeteksi': ada_penyakit,
        'nama_penyakit': nama_penyakit,
        'confidence': f"{tingkat_kepercayaan * 100:.1f}%" if ada_penyakit else "-",
        'deskripsi': deskripsi_penyakit,
        'solusi': solusi_penyakit
    })

@socketio.on('video_frame')
def handle_video_frame(data_url):
    try:
        header, encoded = data_url.split(",", 1)
        image_bytes = base64.b64decode(encoded)
        hasil = core_proses_ai(image_bytes)
        
        if hasil['img_output'] is not None:
            _, buffer = cv2.imencode('.jpg', hasil['img_output'])
            jpg_as_text = base64.b64encode(buffer).decode('utf-8')
            response_url = f"data:image/jpeg;base64,{jpg_as_text}"
            
            emit('response_frame', {
                'image_url': response_url,
                'terdeteksi': hasil['terdeteksi'],
                'label': hasil['label'],
                'confidence': f"{hasil['score'] * 100:.1f}%" if hasil['terdeteksi'] else "-",
                'penjelasan': hasil['penjelasan'],
                'saran': hasil['saran']
            })
    except Exception as e:
        print(f"Socket error: {e}")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)