# server.py
from flask import Flask, request, jsonify
import numpy as np
import cv2
import base64
from flask_cors import CORS

app = Flask(__name__)
CORS(app) 

face_cascade = cv2.CascadeClassifier('haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier('haarcascade_eye.xml')

@app.route('/detect', methods=['POST'])
def detect_eyes():
    image_data = request.json['image']
    
    encoded_data = image_data.split(',')[1]
    nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.1, 4)

    eyes_detected = False
    
    if len(faces) > 0:
        (x, y, w, h) = faces[0]
        cv2.rectangle(frame, (x, y), (x+w, y+h), (255, 0, 0), 2)
        
        roi_gray = gray[y:y+h, x:x+w]
        roi_color = frame[y:y+h, x:x+w]
        
        eyes = eye_cascade.detectMultiScale(roi_gray)
        if len(eyes) >= 2:
            eyes_detected = True
            for (ex, ey, ew, eh) in eyes:
                cv2.rectangle(roi_color, (ex, ey), (ex+ew, ey+eh), (0, 255, 0), 2)
    
    _, buffer = cv2.imencode('.jpg', frame)
    processed_image_b64 = base64.b64encode(buffer).decode('utf-8')
    processed_image_data_url = f"data:image/jpeg;base64,{processed_image_b64}"

    return jsonify({
        'eyes_detected': eyes_detected,
        'image': processed_image_data_url 
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)