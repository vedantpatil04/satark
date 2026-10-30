import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, AlertCircle, CheckCircle2, Loader2, Bell, Eye, EyeOff, RefreshCw, UserCheck, UserX } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import * as tmImage from "@teachablemachine/image";
import { startContinuousAlarm, stopContinuousAlarm, isAlarmPlaying } from "@/utils/beep";

// Allow TypeScript to recognize the globally loaded OpenCV.js
declare global {
  interface Window {
    cv: any;
    Module?: any;
  }
}

interface FocusState {
  isFocused: boolean;
  confidence: number;
  status: "loading" | "ready" | "detecting" | "error";
  loadingStage?: string;
  error?: string;
  predictions?: { className: string; probability: number }[];
}

interface FocusDetectionProps {
  onDistractedTooLong?: () => void;
}

const OPENCV_CDN_URL = "https://docs.opencv.org/4.8.0/opencv.js";

const FocusDetection = ({ onDistractedTooLong }: FocusDetectionProps) => {
  const isMountedRef = useRef<boolean>(true);
  const isDetectingRef = useRef<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>();
  const loopTimerRef = useRef<any>(null);

  // Model Refs
  const tmModelRef = useRef<tmImage.CustomMobileNet | null>(null);
  const faceCascadeRef = useRef<any>(null);
  const eyeCascadeRef = useRef<any>(null);

  const distractedTimeRef = useRef<number>(0);
  const focusedTimeRef = useRef<number>(0);

  // Detection Status
  const [faceDetected, setFaceDetected] = useState<boolean>(false);
  const [eyesDetected, setEyesDetected] = useState<boolean>(false);
  const [alarmActive, setAlarmActive] = useState<boolean>(false);

  const [focusState, setFocusState] = useState<FocusState>({
    isFocused: false,
    confidence: 0,
    status: "loading",
    loadingStage: "Starting camera & AI vision engine...",
  });

  // 1. Ensure OpenCV.js script is loaded and initialized
  const loadOpenCv = useCallback((): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (window.cv && window.cv.Mat && window.cv.CascadeClassifier) {
        return resolve(window.cv);
      }

      // Check if script tag exists
      let script = document.querySelector(`script[src*="opencv.js"]`) as HTMLScriptElement;
      if (!script) {
        script = document.createElement("script");
        script.src = OPENCV_CDN_URL;
        script.async = true;
        script.type = "text/javascript";
        document.body.appendChild(script);
      }

      const startTime = Date.now();
      const timeoutMs = 30000; // 30 seconds max for CDN download

      const interval = setInterval(() => {
        if (!isMountedRef.current) {
          clearInterval(interval);
          return;
        }

        if (window.cv && window.cv.Mat && window.cv.CascadeClassifier) {
          clearInterval(interval);
          resolve(window.cv);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          reject(new Error("OpenCV runtime download timed out. Check internet connection."));
        }
      }, 200);
    });
  }, []);

  // 2. Write remote XML file into OpenCV virtual filesystem safely
  const loadFileToOpenCV = async (url: string, path: string) => {
    const cv = window.cv;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${url} (HTTP ${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);

    // Clean up existing virtual file if already present (prevents ErrnoError: 17 on re-mount)
    try {
      cv.FS_unlink('/' + path);
    } catch {
      // Ignored if file does not exist yet
    }
    cv.FS_createDataFile('/', path, data, true, false, false);
  };

  // 3. Detection Loop (Declared BEFORE initPipeline to prevent TDZ ReferenceError)
  const startDetectionLoop = useCallback(() => {
    if (isDetectingRef.current) return;
    isDetectingRef.current = true;

    const cv = window.cv;

    const detect = async () => {
      if (!isMountedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        // Video not ready yet, retry in 300ms
        loopTimerRef.current = setTimeout(() => {
          animationFrameRef.current = requestAnimationFrame(detect);
        }, 300);
        return;
      }

      let src: any = null;
      let gray: any = null;
      let faces: any = null;

      try {
        // -------------------------------------------------------------
        // A. Teachable Machine Posture Inference
        // -------------------------------------------------------------
        let isTmFocused = true;
        let postureConfidence = 0.85;
        let sortedPredictions: { className: string; probability: number }[] = [];

        if (tmModelRef.current) {
          try {
            const tmPredictions = await tmModelRef.current.predict(video);
            sortedPredictions = tmPredictions.sort((a, b) => b.probability - a.probability);
            const topPrediction = sortedPredictions[0];
            if (topPrediction) {
              isTmFocused = topPrediction.className.toLowerCase().includes("focused");
              postureConfidence = topPrediction.probability;
            }
          } catch (e) {
            // TM predict error, ignore and fall back
          }
        }

        // -------------------------------------------------------------
        // B. OpenCV Haar Cascade Face & Eye Detection
        // -------------------------------------------------------------
        const ctx = canvas.getContext("2d");
        let areFacesVisible = false;
        let areEyesVisible = false;

        if (ctx && cv && faceCascadeRef.current && eyeCascadeRef.current) {
          canvas.width = Math.min(video.videoWidth, 320);
          canvas.height = Math.min(video.videoHeight, 240);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          src = cv.imread(canvas);
          gray = new cv.Mat();
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

          faces = new cv.RectVector();
          faceCascadeRef.current.detectMultiScale(gray, faces, 1.25, 4);

          if (faces.size() > 0) {
            areFacesVisible = true;
            const face = faces.get(0);
            const roiGray = gray.roi(face);
            const eyes = new cv.RectVector();

            // Run eye detection inside upper portion of face ROI
            eyeCascadeRef.current.detectMultiScale(roiGray, eyes, 1.15, 3);
            if (eyes.size() >= 1) {
              areEyesVisible = true;
            }

            roiGray.delete();
            eyes.delete();
          }

          if (isMountedRef.current) {
            setFaceDetected(areFacesVisible);
            setEyesDetected(areEyesVisible);
          }
        }

        // -------------------------------------------------------------
        // C. Hybrid Decision & Attention Alert Logic
        // -------------------------------------------------------------
        // Focused condition: Face detected AND either eyes detected or high posture focus
        const isCurrentlyFocused = areFacesVisible && (areEyesVisible || isTmFocused);

        if (!isCurrentlyFocused) {
          distractedTimeRef.current += 1;
          focusedTimeRef.current = 0;

          if (distractedTimeRef.current >= 12 && !isAlarmPlaying()) {
            startContinuousAlarm(1200, 400, 300);
            if (isMountedRef.current) setAlarmActive(true);
            onDistractedTooLong?.();
          }
        } else {
          distractedTimeRef.current = 0;
          focusedTimeRef.current += 1;

          if (focusedTimeRef.current >= 2 && isAlarmPlaying()) {
            stopContinuousAlarm();
            if (isMountedRef.current) setAlarmActive(false);
          }
        }

        if (isMountedRef.current) {
          setFocusState({
            isFocused: isCurrentlyFocused,
            confidence: postureConfidence,
            status: "detecting",
            predictions: sortedPredictions,
          });
        }
      } catch (loopErr) {
        console.warn("Detection frame error:", loopErr);
      } finally {
        // Free OpenCV memory allocations
        if (src) src.delete();
        if (gray) gray.delete();
        if (faces) faces.delete();
      }

      // Schedule next frame in 1 second to preserve client battery & CPU
      if (isMountedRef.current) {
        loopTimerRef.current = setTimeout(() => {
          animationFrameRef.current = requestAnimationFrame(detect);
        }, 1000);
      }
    };

    detect();
  }, [onDistractedTooLong]);

  // 4. Main initialization pipeline
  const initPipeline = useCallback(async () => {
    if (!isMountedRef.current) return;

    setFocusState({
      isFocused: false,
      confidence: 0,
      status: "loading",
      loadingStage: "Starting camera & AI vision engine...",
    });

    try {
      // 1. Load OpenCV and Haar Cascades concurrently
      const modelsPromise = (async () => {
        if (isMountedRef.current) {
          setFocusState((prev) => ({
            ...prev,
            loadingStage: "Loading OpenCV computer vision engine...",
          }));
        }
        const cv = await loadOpenCv();

        if (isMountedRef.current) {
          setFocusState((prev) => ({
            ...prev,
            loadingStage: "Loading face & eye detection models...",
          }));
        }

        // Load Haar Cascade XML files into virtual filesystem
        await loadFileToOpenCV('/models/haarcascade_frontalface_default.xml', 'haarcascade_frontalface_default.xml');
        await loadFileToOpenCV('/models/haarcascade_eye.xml', 'haarcascade_eye.xml');

        if (!faceCascadeRef.current) {
          faceCascadeRef.current = new cv.CascadeClassifier();
        }
        faceCascadeRef.current.load('haarcascade_frontalface_default.xml');

        if (!eyeCascadeRef.current) {
          eyeCascadeRef.current = new cv.CascadeClassifier();
        }
        eyeCascadeRef.current.load('haarcascade_eye.xml');

        // Load Teachable Machine posture model in parallel (optional)
        try {
          const modelURL = window.location.origin + "/models/model.json";
          const metadataURL = window.location.origin + "/models/metadata.json";
          const tmModel = await tmImage.load(modelURL, metadataURL);
          tmModelRef.current = tmModel;
        } catch (tmErr) {
          console.warn("Teachable machine model load warning, proceeding with Haar Cascades:", tmErr);
        }

        return cv;
      })();

      // 2. Request camera stream (with timeout)
      const cameraPromise = (async () => {
        if (isMountedRef.current) {
          setFocusState((prev) => ({
            ...prev,
            loadingStage: "Connecting to camera (please allow browser permission)...",
          }));
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        });

        if (!isMountedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return null;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((playErr) => {
            console.warn("Video auto-play warning:", playErr);
          });
        }

        return stream;
      })();

      // Wait for both models and camera to be ready
      await Promise.all([modelsPromise, cameraPromise]);

      if (isMountedRef.current) {
        setFocusState((prev) => ({
          ...prev,
          status: "detecting",
          loadingStage: undefined,
        }));
        startDetectionLoop();
      }
    } catch (err: any) {
      console.error("AI Vision initialization error:", err);
      if (isMountedRef.current) {
        let msg = err.message || "Failed to initialize camera and AI models.";
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          msg = "Camera permission was not granted. Please click the camera/lock icon in your browser address bar, set Camera to 'Allow', and click Retry.";
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          msg = "No webcam found. Please connect a camera to use AI Focus monitoring.";
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
          msg = "Webcam is already in use by another app (e.g. Zoom, Teams, or another browser window). Please close that app and click Retry.";
        }
        setFocusState({
          isFocused: false,
          confidence: 0,
          status: "error",
          error: msg,
        });
      }
    }
  }, [loadOpenCv, startDetectionLoop]);

  // 5. Mount effect
  useEffect(() => {
    isMountedRef.current = true;
    initPipeline();

    return () => {
      isMountedRef.current = false;
      isDetectingRef.current = false;

      // Stop camera stream tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      // Cancel loops
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Stop sound alarm
      stopContinuousAlarm();

      // Free classifiers
      try {
        if (faceCascadeRef.current) {
          faceCascadeRef.current.delete();
          faceCascadeRef.current = null;
        }
        if (eyeCascadeRef.current) {
          eyeCascadeRef.current.delete();
          eyeCascadeRef.current = null;
        }
      } catch {
        // Ignored
      }
    };
  }, [initPipeline]);

  return (
    <div className="space-y-4">
      {/* Hidden canvas used for OpenCV frame reading */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Video Container */}
      <div className="relative rounded-xl overflow-hidden bg-black/60 aspect-video shadow-md border border-border/40">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Live OpenCV Detection Status Overlay */}
        {focusState.status === "detecting" && (
          <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 text-xs border border-white/10 shadow-sm">
            {eyesDetected ? (
              <>
                <Eye className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-medium">Face & Eyes Detected</span>
              </>
            ) : faceDetected ? (
              <>
                <UserCheck className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-amber-300 font-medium">Face Detected (Eyes Unclear)</span>
              </>
            ) : (
              <>
                <UserX className="h-3.5 w-3.5 text-rose-400" />
                <span className="text-rose-300 font-medium">No Face Detected</span>
              </>
            )}
          </div>
        )}

        {/* Refocus Alarm Pulsing Badge */}
        {alarmActive && (
          <div className="absolute top-3 right-3 bg-rose-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 animate-pulse shadow-lg text-xs font-bold">
            <Bell className="h-4 w-4 animate-bounce" />
            <span>LOOK AT SCREEN!</span>
          </div>
        )}

        {/* Progressive Loading Spinner Overlay */}
        {focusState.status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="text-center space-y-3 max-w-xs">
              <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin" />
              <p className="text-sm font-semibold text-white">Initializing AI Vision</p>
              <p className="text-xs text-muted-foreground animate-pulse">
                {focusState.loadingStage || "Loading OpenCV Haar Cascades..."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error State with Actionable Recovery */}
      {focusState.status === "error" && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-sm font-semibold">Camera / AI Monitor Issue</AlertTitle>
          <AlertDescription className="text-xs mt-1 flex flex-col gap-2">
            <span>{focusState.error}</span>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={initPipeline}
                className="gap-1.5 text-xs h-7 mt-1 border-destructive/40 hover:bg-destructive/20"
              >
                <RefreshCw className="w-3 h-3" />
                Retry Camera & AI
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Real-time Status Card */}
      {focusState.status === "detecting" && (
        <div className="p-3.5 rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm space-y-3">
          {alarmActive && (
            <div className="bg-rose-500/15 border border-rose-500/40 rounded-lg p-3 flex items-start gap-3">
              <Bell className="h-5 w-5 text-rose-400 mt-0.5 animate-bounce flex-shrink-0" />
              <div className="text-xs">
                <p className="text-rose-400 font-bold">Distraction Alert Active</p>
                <p className="text-muted-foreground mt-0.5">
                  Look directly at the screen for 2 seconds to dismiss the alarm.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {focusState.isFocused ? (
                <>
                  <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-emerald-400">Deep Focus Verified</span>
                    <p className="text-[11px] text-muted-foreground">
                      {alarmActive ? `Holding focus... ${focusedTimeRef.current}s` : "Optimal posture & screen gaze"}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-amber-400">Distraction Detected</span>
                    <p className="text-[11px] text-muted-foreground">
                      {distractedTimeRef.current}s away from study focus
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="text-right">
              <span className="text-xl font-bold font-mono">
                {(focusState.confidence * 100).toFixed(0)}%
              </span>
              <p className="text-[10px] text-muted-foreground">Posture Confidence</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FocusDetection;
