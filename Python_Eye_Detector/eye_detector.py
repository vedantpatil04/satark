import cv2

# Load the pre-trained Haar Cascade models
face_cascade = cv2.CascadeClassifier('haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier('haarcascade_eye.xml')

# Start capturing video from the webcam (device 0)
cap = cv2.VideoCapture(0)

while True:
    # Read a frame from the webcam
    ret, frame = cap.read()
    if not ret:
        break

    # Convert the frame to grayscale for better detection
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # Detect faces in the grayscale frame
    # scaleFactor=1.3: How much the image size is reduced at each image scale.
    # minNeighbors=5: How many neighbors each candidate rectangle should have to retain it.
    faces = face_cascade.detectMultiScale(gray, 1.3, 5)

    # Assume only one person for simplicity
    if len(faces) > 0:
        (x, y, w, h) = faces[0] # Get the first detected face

        # Draw a rectangle around the face
        cv2.rectangle(frame, (x, y), (x+w, y+h), (255, 0, 0), 2)

        # Define the region of interest (ROI) as the face area
        roi_gray = gray[y:y+h, x:x+w]
        roi_color = frame[y:y+h, x:x+w]

        # Detect eyes within the face ROI
        eyes = eye_cascade.detectMultiScale(roi_gray)

        if len(eyes) >= 1:
            # If at least one eye is detected, the person is likely looking forward
            status_text = "Eyes Detected"
            status_color = (0, 255, 0) # Green
        else:
            status_text = "Eyes NOT Detected"
            status_color = (0, 0, 255) # Red

        # Display the status text on the frame
        cv2.putText(frame, status_text, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, status_color, 2)

        # Draw rectangles around the detected eyes for visualization
        for (ex, ey, ew, eh) in eyes:
            cv2.rectangle(roi_color, (ex, ey), (ex+ew, ey+eh), (0, 255, 0), 2)

    # Display the resulting frame in a window
    cv2.imshow('Eye Detection', frame)

    # Exit the loop if the 'q' key is pressed
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Release the webcam and close all windows
cap.release()
cv2.destroyAllWindows()