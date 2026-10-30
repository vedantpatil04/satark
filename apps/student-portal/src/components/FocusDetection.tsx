import { useEffect, useRef, useState } from "react";
import { Camera, AlertCircle, CheckCircle2, Loader2, Bell, Eye } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import * as tmImage from "@teachablemachine/image";
import { startContinuousAlarm, stopContinuousAlarm, isAlarmPlaying } from "@/utils/beep";

// Allow TypeScript to recognize the globally loaded OpenCV.js
declare global {
  interface Window {
    cv: any;
  }
}

interface FocusState {
  isFocused: boolean;
  confidence: number;
  status: "loading" | "ready" | "detecting" | "error";
  error?: string;
  predictions?: { className: string; probability: number }[];
}

interface FocusDetectionProps {
  onDistractedTooLong?: () => void;
}

const FocusDetection = ({ onDistractedTooLong }: FocusDetectionProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>();
  
  // Model Refs
  const tmModelRef = useRef<tmImage.CustomMobileNet | null>(null);
  const faceCascadeRef = useRef<any>(null);
  const eyeCascadeRef = useRef<any>(null);
  
  const distractedTimeRef = useRef<number>(0);
  const focusedTimeRef = useRef<number>(0);
  
  // Real-time eye tracking status
  const [eyesDetected, setEyesDetected] = useState<boolean>(false);

  const [focusState, setFocusState] = useState<FocusState>({
    isFocused: false,
    confidence: 0,
    status: "loading",
  });

  const [alarmActive, setAlarmActive] = useState(false);

  useEffect(() => {
    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            waitForOpenCV();
          };
        }
      } catch (err) {
        setFocusState({
          isFocused: false,
          confidence: 0,
          status: "error",
          error: "Camera access denied. Please enable camera permissions.",
        });
      }
    };

    startWebcam();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      stopContinuousAlarm();
      
      // Cleanup OpenCV objects
      if (faceCascadeRef.current) faceCascadeRef.current.delete();
      if (eyeCascadeRef.current) eyeCascadeRef.current.delete();
    };
  }, []);

  // Poll until the OpenCV.js script fully loads from index.html
  const waitForOpenCV = () => {
    const checkCv = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        clearInterval(checkCv);
        loadModels();
      }
    }, 200);
  };

  const loadFileToOpenCV = async (url: string, path: string) => {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    window.cv.FS_createDataFile('/', path, data, true, false, false);
  };

  const loadModels = async () => {
    try {
      const cv = window.cv;
      
      // 1. Load Custom Teachable Machine Posture Model
      const modelURL = window.location.origin + "/models/model.json";
      const metadataURL = window.location.origin + "/models/metadata.json";
      const tmModel = await tmImage.load(modelURL, metadataURL);
      tmModelRef.current = tmModel;
      
      // 2. Load OpenCV Haar Cascades
      setFocusState(prev => ({ ...prev, status: "loading" }));
      
      await loadFileToOpenCV('/models/haarcascade_frontalface_default.xml', 'haarcascade_frontalface_default.xml');
      await loadFileToOpenCV('/models/haarcascade_eye.xml', 'haarcascade_eye.xml');

      faceCascadeRef.current = new cv.CascadeClassifier();
      faceCascadeRef.current.load('haarcascade_frontalface_default.xml');

      eyeCascadeRef.current = new cv.CascadeClassifier();
      eyeCascadeRef.current.load('haarcascade_eye.xml');
      
      setFocusState((prev) => ({ ...prev, status: "ready" }));
      startDetection();
    } catch (error) {
      console.error("Model load error:", error);
      setFocusState({
        isFocused: false,
        confidence: 0,
        status: "error",
        error: "Failed to load AI models. Please ensure XML files are in public/models/.",
      });
    }
  };

  const startDetection = () => {
    const cv = window.cv;
    
    const detect = async () => {
      if (!videoRef.current || !canvasRef.current || !tmModelRef.current || !faceCascadeRef.current) return;

      try {
        // --- 1. RUN TEACHABLE MACHINE POSTURE CHECK ---
        const tmPredictions = await tmModelRef.current.predict(videoRef.current);
        const sortedPredictions = tmPredictions.sort((a, b) => b.probability - a.probability);
        const topPrediction = sortedPredictions[0];
        const isTmFocused = topPrediction.className.toLowerCase().includes("focused");
        const confidence = topPrediction.probability;

        // --- 2. RUN OPENCV.JS HAAR CASCADE EYE DETECTION ---
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          // Draw video frame to hidden canvas for OpenCV processing
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          let src = cv.imread(canvas);
          let gray = new cv.Mat();
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

          let faces = new cv.RectVector();
          // detectMultiScale(image, objects, scaleFactor, minNeighbors)
          faceCascadeRef.current.detectMultiScale(gray, faces, 1.3, 5);
          
          let areEyesVisible = false;

          if (faces.size() > 0) {
            let face = faces.get(0);
            let roiGray = gray.roi(face);
            let eyes = new cv.RectVector();
            
            eyeCascadeRef.current.detectMultiScale(roiGray, eyes);
            if (eyes.size() >= 1) {
              areEyesVisible = true;
            }
            
            roiGray.delete();
            eyes.delete();
          }

          setEyesDetected(areEyesVisible);

          // Clean up C++ memory allocated by OpenCV.js
          src.delete();
          gray.delete();
          faces.delete();

          // --- 3. HYBRID FOCUS LOGIC ---
          const isFocused = isTmFocused && areEyesVisible;

          // Alarm and distraction logic
          if (!isFocused) {
            distractedTimeRef.current += 1; 
            focusedTimeRef.current = 0; 
            
            if (distractedTimeRef.current >= 15 && !isAlarmPlaying()) {
              startContinuousAlarm(1200, 400, 300);
              setAlarmActive(true);
              onDistractedTooLong?.();
            }
          } else {
            distractedTimeRef.current = 0; 
            focusedTimeRef.current += 1; 
            
            if (focusedTimeRef.current >= 2 && isAlarmPlaying()) {
              stopContinuousAlarm();
              setAlarmActive(false);
            }
          }

          setFocusState({
            isFocused,
            confidence,
            status: "detecting",
            predictions: sortedPredictions,
          });
        }

        // Run next frame roughly every 1 second to save CPU
        setTimeout(() => {
          animationFrameRef.current = requestAnimationFrame(detect);
        }, 1000);

      } catch (error) {
        console.error("Detection loop error:", error);
      }
    };

    detect();
  };

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      <div className="relative rounded-lg overflow-hidden bg-black/50 aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        
        {/* OpenCV Tracking Status Overlay */}
        <div className="absolute top-4 left-4 bg-black/60 px-3 py-1.5 rounded-full flex items-center gap-2 text-sm backdrop-blur-md">
          <Eye className={`h-4 w-4 ${eyesDetected ? 'text-green-400' : 'text-red-400'}`} />
          <span className="text-white/80 font-medium">
            {eyesDetected ? "Eyes Detected (OpenCV)" : "No Eyes Detected"}
          </span>
        </div>
        
        {alarmActive && (
          <div className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 animate-pulse shadow-lg">
            <Bell className="h-5 w-5 animate-bounce" />
            <span className="font-bold">REFOCUS!</span>
          </div>
        )}
        
        {focusState.status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-center">
              <Loader2 className="h-12 w-12 mx-auto mb-2 animate-spin" />
              <p className="text-lg">Loading OpenCV Haar Cascades...</p>
            </div>
          </div>
        )}
      </div>

      {focusState.status === "error" ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{focusState.error}</AlertDescription>
        </Alert>
      ) : focusState.status === "detecting" ? (
        <div className="space-y-3">
          {alarmActive && (
            <div className="bg-red-500/20 border-2 border-red-500 rounded-lg p-4 flex items-start gap-3 animate-pulse">
              <Bell className="h-6 w-6 text-red-400 mt-0.5 animate-bounce" />
              <div>
                <p className="text-red-400 font-bold text-lg">⚠️ DISTRACTION ALERT!</p>
                <p className="text-sm text-white/90 mt-1">
                  Alarm will stop when you focus for 2 seconds
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-4 rounded-lg bg-white/10">
            <div className="flex items-center gap-3">
              {focusState.isFocused ? (
                <>
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                  <div>
                    <span className="font-semibold text-green-400 text-lg">Focused ✓</span>
                    <p className="text-xs text-white/70">
                      {alarmActive ? `Hold focus... ${focusedTimeRef.current}s` : "Great work!"}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-6 w-6 text-yellow-400" />
                  <div>
                    <span className="font-semibold text-yellow-400 text-lg">
                      Distracted
                    </span>
                    <p className="text-xs text-white/70">
                      {distractedTimeRef.current}s distracted
                      {distractedTimeRef.current >= 15 ? " - ALARM ACTIVE!" : ""}
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold">
                {(focusState.confidence * 100).toFixed(0)}%
              </span>
              <p className="text-xs text-white/70">Posture Confidence</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default FocusDetection;