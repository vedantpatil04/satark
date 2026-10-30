import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Camera,
  CameraOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Bell,
  Eye,
  RefreshCw,
  UserCheck,
  UserX,
  Play,
  Activity,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import * as tmImage from "@teachablemachine/image";
import { startContinuousAlarm, stopContinuousAlarm, isAlarmPlaying } from "@/utils/beep";

// Allow TypeScript to recognize globally loaded OpenCV.js
declare global {
  interface Window {
    cv: any;
    Module?: any;
  }
}

export type VisionMonitorStatus = "idle" | "loading" | "detecting" | "error";

interface FocusState {
  isFocused: boolean;
  confidence: number;
  status: VisionMonitorStatus;
  loadingStage?: string;
  error?: string;
  predictions?: { className: string; probability: number }[];
}

interface FocusDetectionProps {
  onDistractedTooLong?: () => void;
  onStatusChange?: (status: VisionMonitorStatus) => void;
}

// Processing resolution downsampled to 320x240 for fast OpenCV execution
const PROC_WIDTH = 320;
const PROC_HEIGHT = 240;
// Frame rate: 300ms delay between frames (~3.3 FPS)
const FRAME_INTERVAL_MS = 300;

// Structured Timestamped Logger with elapsed tracking
const logStep = (step: string, details?: any) => {
  const ts = new Date().toISOString().split("T")[1].replace("Z", "");
  console.log(`[SATARK AI VISION | ${ts}] [${step}]`, details ?? "");
};

const FocusDetection: React.FC<FocusDetectionProps> = ({
  onDistractedTooLong,
  onStatusChange,
}) => {
  // Stable refs for parent callbacks
  const onDistractedTooLongRef = useRef(onDistractedTooLong);
  useEffect(() => {
    onDistractedTooLongRef.current = onDistractedTooLong;
  }, [onDistractedTooLong]);

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  // Lifecycle & Concurrency Guards
  const isMountedRef = useRef<boolean>(true);
  const isInitializingRef = useRef<boolean>(false);
  const isInitializedRef = useRef<boolean>(false);
  const isDetectingRef = useRef<boolean>(false);
  const isProcessingFrameRef = useRef<boolean>(false);
  const initSessionIdRef = useRef<number>(0);

  // DOM & Media Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<any>(null);
  const animationFrameRef = useRef<number>();
  const initTimeoutRef = useRef<any>(null);

  // Model Refs
  const tmModelRef = useRef<tmImage.CustomMobileNet | null>(null);
  const faceCascadeRef = useRef<any>(null);
  const eyeCascadeRef = useRef<any>(null);

  // Tracking Counters
  const distractedTimeRef = useRef<number>(0);
  const focusedTimeRef = useRef<number>(0);

  // Performance Profiler Ref
  const profilerRef = useRef({
    frameCount: 0,
    totalProcessingMs: 0,
    lastFrameMs: 0,
    lastFaceMs: 0,
    lastEyeMs: 0,
    lastTmMs: 0,
    fps: 0,
    lastFpsTimestamp: performance.now(),
    framesThisSecond: 0,
  });

  // Component UI State (Starts strictly as "idle" - NEVER auto-starts on mount)
  const [faceDetected, setFaceDetected] = useState<boolean>(false);
  const [eyesDetected, setEyesDetected] = useState<boolean>(false);
  const [alarmActive, setAlarmActive] = useState<boolean>(false);
  const [perfStats, setPerfStats] = useState<{ frameMs: number; fps: number }>({
    frameMs: 0,
    fps: 0,
  });

  const [focusState, setFocusState] = useState<FocusState>({
    isFocused: false,
    confidence: 0,
    status: "idle",
  });

  // Notify parent of status change safely
  const updateStatus = useCallback((status: VisionMonitorStatus, stage?: string, error?: string) => {
    if (!isMountedRef.current) return;
    setFocusState((prev) => ({
      ...prev,
      status,
      loadingStage: stage,
      error: error,
    }));
    onStatusChangeRef.current?.(status);
  }, []);

  // 1. Load OpenCV.js with fast resolution, timeout protection, and thenable recursion fix
  const loadOpenCv = useCallback((): Promise<any> => {
    return new Promise((resolve, reject) => {
      const cvStart = performance.now();
      const timeoutMs = 15000;

      // Helper to finalize and resolve OpenCV without thenable trap
      const finalizeCv = () => {
        const cv = window.cv;
        if (!cv || !cv.Mat || !cv.CascadeClassifier) {
          return false;
        }

        // CRITICAL ROOT-CAUSE FIX:
        // In Emscripten OpenCV, Module['then'] exists which causes an infinite microtask
        // recursion when resolved via Promise resolution procedure.
        // We delete .then once OpenCV is ready so resolve(cv) treats it as a standard object.
        try {
          if (typeof cv.then === "function") {
            delete cv.then;
          }
        } catch (e) {
          console.warn("[FocusDetection] Notice: cv.then delete:", e);
        }

        logStep("OPENCV_INITIALIZATION_RESOLVED", {
          durationMs: Math.round(performance.now() - cvStart),
        });
        resolve(cv);
        return true;
      };

      // If already initialized in window, resolve immediately
      if (finalizeCv()) {
        return;
      }

      // Check if script tag exists
      let script = document.querySelector(`script[src*="opencv.js"]`) as HTMLScriptElement;
      if (!script) {
        logStep("OPENCV_INJECTING_SCRIPT_TAG");
        script = document.createElement("script");
        script.src = "/opencv.js";
        script.async = true;
        script.type = "text/javascript";
        script.onerror = () => {
          clearInterval(interval);
          clearTimeout(timeoutId);
          reject(new Error("Failed to load /opencv.js from server (network error or file missing)."));
        };
        document.body.appendChild(script);
      }

      // Attach to onRuntimeInitialized if cv object exists
      if (window.cv && typeof window.cv === "object") {
        const prevInit = window.cv.onRuntimeInitialized;
        window.cv.onRuntimeInitialized = () => {
          if (typeof prevInit === "function") {
            try {
              prevInit();
            } catch (e) {}
          }
          finalizeCv();
        };
      }

      // Polling interval with 15-second individual timeout
      const interval = setInterval(() => {
        if (!isMountedRef.current) {
          clearInterval(interval);
          clearTimeout(timeoutId);
          return;
        }

        if (finalizeCv()) {
          clearInterval(interval);
          clearTimeout(timeoutId);
        }
      }, 100);

      const timeoutId = setTimeout(() => {
        clearInterval(interval);
        reject(
          new Error("OpenCV WebAssembly engine timed out during load (15s limit reached).")
        );
      }, timeoutMs);
    });
  }, []);

  // 2. Load model XML into OpenCV virtual filesystem safely with fallback paths & 404 detection
  const loadFileToOpenCV = async (primaryUrl: string, fallbackUrl: string, filename: string): Promise<void> => {
    const cv = window.cv;
    if (!cv || !cv.FS_createDataFile) {
      throw new Error("OpenCV virtual filesystem is not available in memory.");
    }

    const fetchStart = performance.now();
    let response: Response;
    try {
      response = await fetch(primaryUrl);
      if (!response.ok && fallbackUrl) {
        logStep("CASCADE_FALLBACK_ATTEMPT", { primaryUrl, fallbackUrl, status: response.status });
        response = await fetch(fallbackUrl);
      }
    } catch (networkErr: any) {
      if (fallbackUrl) {
        response = await fetch(fallbackUrl);
      } else {
        throw new Error(`Network failure loading ${filename}: ${networkErr?.message || networkErr}`);
      }
    }

    if (!response.ok) {
      throw new Error(`Failed to load ${filename} (HTTP ${response.status}). Model file not found on server.`);
    }

    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      throw new Error(`Downloaded model ${filename} was empty (0 bytes).`);
    }

    const data = new Uint8Array(buffer);

    try {
      cv.FS_unlink("/" + filename);
    } catch {
      // Ignored if file does not exist yet
    }
    cv.FS_createDataFile("/", filename, data, true, false, false);
    logStep("CASCADE_VFS_FILE_CREATED", {
      filename,
      bytes: buffer.byteLength,
      durationMs: Math.round(performance.now() - fetchStart),
    });
  };

  // 3. Stop detection and cleanly release camera stream, timers, and OpenCV memory
  const stopVisionPipeline = useCallback((reason: string = "explicit") => {
    // Invalidate any in-flight initialization sessions
    initSessionIdRef.current += 1;

    const hadActiveResources =
      isDetectingRef.current || isInitializingRef.current || streamRef.current !== null;

    if (hadActiveResources) {
      logStep("STOP_VISION_PIPELINE", { reason });
    }
    isDetectingRef.current = false;
    isProcessingFrameRef.current = false;
    isInitializingRef.current = false;
    isInitializedRef.current = false;

    // Clear initialization timeout
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }

    // Cancel detection loops & timers
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    // Stop and release camera tracks (Webcam LED turns OFF)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
          logStep("CAMERA_TRACK_STOPPED", { label: track.label });
        } catch (e) {
          console.warn("Track stop error:", e);
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Silence alarm
    stopContinuousAlarm();

    // Free OpenCV classifiers from C++ heap
    try {
      if (faceCascadeRef.current) {
        faceCascadeRef.current.delete();
        faceCascadeRef.current = null;
      }
      if (eyeCascadeRef.current) {
        eyeCascadeRef.current.delete();
        eyeCascadeRef.current = null;
      }
    } catch (e) {
      console.warn("Classifier cleanup warning:", e);
    }

    // Reset UI state
    if (isMountedRef.current) {
      setFaceDetected(false);
      setEyesDetected(false);
      setAlarmActive(false);
      setPerfStats({ frameMs: 0, fps: 0 });
      setFocusState({
        isFocused: false,
        confidence: 0,
        status: "idle",
      });
    }
    onStatusChangeRef.current?.("idle");
  }, []);

  // 4. Main Detection Loop (3 FPS, 320x240, Non-Blocking, Fully Memoized)
  const startDetectionLoop = useCallback(() => {
    if (isDetectingRef.current) return;
    isDetectingRef.current = true;
    logStep("DETECTION_LOOP_ACTIVATED", { resolution: `${PROC_WIDTH}x${PROC_HEIGHT}`, intervalMs: FRAME_INTERVAL_MS });

    const cv = window.cv;

    const detect = async () => {
      if (!isMountedRef.current || !isDetectingRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Video must be ready with valid dimensions
      if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        if (isMountedRef.current && isDetectingRef.current) {
          loopTimerRef.current = setTimeout(() => {
            animationFrameRef.current = requestAnimationFrame(detect);
          }, 200);
        }
        return;
      }

      // Re-entrancy guard: skip if previous frame is still processing
      if (isProcessingFrameRef.current) {
        if (isMountedRef.current && isDetectingRef.current) {
          loopTimerRef.current = setTimeout(() => {
            animationFrameRef.current = requestAnimationFrame(detect);
          }, FRAME_INTERVAL_MS);
        }
        return;
      }

      isProcessingFrameRef.current = true;
      const frameStartTime = performance.now();

      let src: any = null;
      let gray: any = null;
      let faces: any = null;
      let areFacesVisible = false;
      let areEyesVisible = false;
      let isTmFocused = true;
      let postureConfidence = 0.9;
      let sortedPredictions: any[] = [];
      let faceMs = 0;
      let eyeMs = 0;
      let tmMs = 0;

      try {
        // --- A. Teachable Machine Posture Check (Non-blocking) ---
        if (tmModelRef.current) {
          try {
            const tmStart = performance.now();
            const tmPredictions = await tmModelRef.current.predict(video);
            sortedPredictions = tmPredictions.sort((a, b) => b.probability - a.probability);
            const topPrediction = sortedPredictions[0];
            isTmFocused = topPrediction.className.toLowerCase().includes("focused");
            postureConfidence = topPrediction.probability;
            tmMs = performance.now() - tmStart;
          } catch (tmErr) {
            console.warn("[FocusDetection] TM inference warning:", tmErr);
          }
        }

        // --- B. Downsampled OpenCV Frame Processing (320x240) ---
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          canvas.width = PROC_WIDTH;
          canvas.height = PROC_HEIGHT;
          ctx.drawImage(video, 0, 0, PROC_WIDTH, PROC_HEIGHT);

          src = cv.imread(canvas);
          gray = new cv.Mat();
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

          faces = new cv.RectVector();
          if (faceCascadeRef.current) {
            const faceStart = performance.now();
            faceCascadeRef.current.detectMultiScale(gray, faces, 1.25, 4);
            faceMs = performance.now() - faceStart;

            if (faces.size() > 0) {
              areFacesVisible = true;
              const face = faces.get(0);
              const roiGray = gray.roi(face);
              const eyes = new cv.RectVector();

              if (eyeCascadeRef.current) {
                const eyeStart = performance.now();
                eyeCascadeRef.current.detectMultiScale(roiGray, eyes, 1.15, 3);
                eyeMs = performance.now() - eyeStart;
                if (eyes.size() >= 1) {
                  areEyesVisible = true;
                }
              }

              roiGray.delete();
              eyes.delete();
            }
          }
        }

        // --- C. Hybrid Attention Decision ---
        const isCurrentlyFocused = areFacesVisible && (areEyesVisible || isTmFocused);

        if (!isCurrentlyFocused) {
          distractedTimeRef.current += 1;
          focusedTimeRef.current = 0;

          if (distractedTimeRef.current >= 12 && !isAlarmPlaying()) {
            startContinuousAlarm(1200, 400, 300);
            if (isMountedRef.current) setAlarmActive(true);
            onDistractedTooLongRef.current?.();
          }
        } else {
          distractedTimeRef.current = 0;
          focusedTimeRef.current += 1;

          if (focusedTimeRef.current >= 2 && isAlarmPlaying()) {
            stopContinuousAlarm();
            if (isMountedRef.current) setAlarmActive(false);
          }
        }

        // Update detection indicator states only on changes
        if (isMountedRef.current) {
          setFaceDetected((prev) => (prev !== areFacesVisible ? areFacesVisible : prev));
          setEyesDetected((prev) => (prev !== areEyesVisible ? areEyesVisible : prev));

          setFocusState((prev) => {
            if (
              prev.isFocused === isCurrentlyFocused &&
              Math.abs(prev.confidence - postureConfidence) < 0.05 &&
              prev.status === "detecting"
            ) {
              return prev; // Skip render
            }
            return {
              isFocused: isCurrentlyFocused,
              confidence: postureConfidence,
              status: "detecting",
              predictions: sortedPredictions,
            };
          });
        }

        // Profiler accounting
        const totalFrameMs = performance.now() - frameStartTime;
        const p = profilerRef.current;
        p.frameCount += 1;
        p.framesThisSecond += 1;
        p.lastFrameMs = Math.round(totalFrameMs);
        p.lastFaceMs = Math.round(faceMs);
        p.lastEyeMs = Math.round(eyeMs);
        p.lastTmMs = Math.round(tmMs);

        const now = performance.now();
        if (now - p.lastFpsTimestamp >= 1000) {
          p.fps = p.framesThisSecond;
          p.framesThisSecond = 0;
          p.lastFpsTimestamp = now;

          if (isMountedRef.current) {
            setPerfStats({ frameMs: p.lastFrameMs, fps: p.fps });
          }

          if (p.frameCount % 30 === 0) {
            console.log(
              `[AI Vision Profiler] Total: ${p.lastFrameMs}ms (Face: ${p.lastFaceMs}ms, Eyes: ${p.lastEyeMs}ms, TM: ${p.lastTmMs}ms) | FPS: ${p.fps}`
            );
          }
        }
      } catch (loopErr) {
        console.warn("[FocusDetection] Frame loop warning:", loopErr);
      } finally {
        if (src) src.delete();
        if (gray) gray.delete();
        if (faces) faces.delete();
        isProcessingFrameRef.current = false;
      }

      // Schedule next frame with FRAME_INTERVAL_MS
      if (isMountedRef.current && isDetectingRef.current) {
        loopTimerRef.current = setTimeout(() => {
          animationFrameRef.current = requestAnimationFrame(detect);
        }, FRAME_INTERVAL_MS);
      }
    };

    detect();
  }, []);

  // 5. Explicit "Start AI Vision" Pipeline with Strict Concurrency & Microtask Loop Prevention
  const startVisionPipeline = useCallback(async () => {
    if (isInitializingRef.current || isDetectingRef.current) {
      logStep("CAMERA_REQUEST_IGNORED", "Already initializing or active");
      return;
    }
    isInitializingRef.current = true;
    const currentSessionId = ++initSessionIdRef.current;
    const initStart = performance.now();

    logStep("CAMERA_REQUEST_STARTED", { sessionId: currentSessionId });
    updateStatus("loading", "Step 1/3: Requesting webcam access...");

    // Overall Safety Timeout Ceiling (45 seconds)
    initTimeoutRef.current = setTimeout(() => {
      if (isInitializingRef.current && initSessionIdRef.current === currentSessionId) {
        logStep("INITIALIZATION_TIMEOUT", "AI pipeline overall duration exceeded 45 seconds");
        stopVisionPipeline();
        updateStatus(
          "error",
          undefined,
          "AI Vision Engine initialization timed out. Please verify your camera is connected and unblocked, then click Retry."
        );
      }
    }, 45000);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          "Camera API is unavailable. Please run on http://localhost or HTTPS in Google Chrome / Edge."
        );
      }

      // Step 1: Acquire MediaStream
      const cameraStart = performance.now();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });

      // StrictMode / Cancellation check
      if (!isMountedRef.current || initSessionIdRef.current !== currentSessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      logStep("CAMERA_REQUEST_RESOLVED", {
        tracks: stream.getVideoTracks().length,
        durationMs: Math.round(performance.now() - cameraStart),
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== "live") {
        throw new Error("Webcam track was not active or stopped immediately.");
      }
      logStep("CAMERA_TRACK_LIVE", {
        label: videoTrack.label,
        readyState: videoTrack.readyState,
        enabled: videoTrack.enabled,
      });

      streamRef.current = stream;

      // Step 2: Bind stream to mounted video element
      const video = videoRef.current;
      if (!video) {
        throw new Error("Video element DOM reference was not found.");
      }
      logStep("VIDEO_ELEMENT_FOUND");

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      logStep("VIDEO_SRC_OBJECT_ASSIGNED");

      // Step 3: Wait for video element readiness (HAVE_ENOUGH_DATA)
      updateStatus("loading", "Step 2/3: Binding camera feed (HAVE_ENOUGH_DATA)...");
      const videoWaitStart = performance.now();

      await new Promise<void>((resolve, reject) => {
        let isDone = false;
        const videoTimeout = setTimeout(() => {
          if (!isDone) {
            isDone = true;
            cleanup();
            if (video.readyState >= 2 && video.videoWidth > 0) {
              logStep("VIDEO_PLAY_TIMEOUT_PROCEED", {
                readyState: video.readyState,
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
              });
              resolve();
            } else {
              reject(new Error("Webcam feed timed out waiting for active video data (HAVE_ENOUGH_DATA)."));
            }
          }
        }, 8000);

        const cleanup = () => {
          clearTimeout(videoTimeout);
          video.removeEventListener("loadeddata", onDataReady);
          video.removeEventListener("canplay", onDataReady);
          video.removeEventListener("playing", onDataReady);
        };

        const onDataReady = () => {
          if (!isDone && video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
            isDone = true;
            cleanup();
            logStep("VIDEO_PLAY_SUCCESS", {
              readyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              durationMs: Math.round(performance.now() - videoWaitStart),
            });
            resolve();
          }
        };

        video.addEventListener("loadeddata", onDataReady);
        video.addEventListener("canplay", onDataReady);
        video.addEventListener("playing", onDataReady);

        video.play().catch((playErr) => {
          console.warn("[FocusDetection] video.play() warning:", playErr);
        });

        if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
          onDataReady();
        }
      });

      // StrictMode / Cancellation check
      if (!isMountedRef.current || initSessionIdRef.current !== currentSessionId) {
        return;
      }

      logStep("CAMERA_PREVIEW_READY");

      // Step 4: Load OpenCV WebAssembly Runtime (with microtask recursion fix)
      logStep("OPENCV_INITIALIZATION_STARTED");
      updateStatus("loading", "Step 2/3: Loading OpenCV WebAssembly runtime...");
      const cvStart = performance.now();
      const cv = await loadOpenCv();

      // StrictMode / Cancellation check
      if (!isMountedRef.current || initSessionIdRef.current !== currentSessionId) {
        return;
      }
      logStep("OPENCV_INITIALIZATION_RESOLVED", { durationMs: Math.round(performance.now() - cvStart) });

      // Step 5: Load Haar Cascades into OpenCV Virtual Filesystem
      logStep("CASCADE_INITIALIZATION_STARTED");
      updateStatus("loading", "Step 2/3: Loading Haar Cascade face & eye models...");
      const cascadeStart = performance.now();

      await loadFileToOpenCV(
        "/models/haarcascade_frontalface_default.xml",
        "/model/haarcascade_frontalface_default.xml",
        "haarcascade_frontalface_default.xml"
      );
      await loadFileToOpenCV(
        "/models/haarcascade_eye.xml",
        "/model/haarcascade_eye.xml",
        "haarcascade_eye.xml"
      );

      // StrictMode / Cancellation check
      if (!isMountedRef.current || initSessionIdRef.current !== currentSessionId) {
        return;
      }

      // Initialize Face Classifier
      if (!faceCascadeRef.current) {
        faceCascadeRef.current = new cv.CascadeClassifier();
      }
      const faceLoaded = faceCascadeRef.current.load("haarcascade_frontalface_default.xml");
      if (!faceLoaded || faceCascadeRef.current.empty()) {
        throw new Error("Face detection classifier failed to compile from XML into OpenCV memory.");
      }

      // Initialize Eye Classifier
      if (!eyeCascadeRef.current) {
        eyeCascadeRef.current = new cv.CascadeClassifier();
      }
      const eyeLoaded = eyeCascadeRef.current.load("haarcascade_eye.xml");
      if (!eyeLoaded || eyeCascadeRef.current.empty()) {
        throw new Error("Eye detection classifier failed to compile from XML into OpenCV memory.");
      }

      logStep("CASCADE_INITIALIZATION_RESOLVED", {
        durationMs: Math.round(performance.now() - cascadeStart),
      });

      // Step 6: Load Teachable Machine Posture Model (Graceful fallback with 15s timeout)
      updateStatus("loading", "Step 3/3: Initializing Posture Model...");
      try {
        const tmStart = performance.now();
        const modelURL = window.location.origin + "/models/model.json";
        const metadataURL = window.location.origin + "/models/metadata.json";

        const loadTmWithTimeout = Promise.race([
          tmImage.load(modelURL, metadataURL),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Posture model loading exceeded 15s timeout")), 15000)
          ),
        ]);

        const tmModel = await loadTmWithTimeout;
        if (isMountedRef.current && initSessionIdRef.current === currentSessionId) {
          tmModelRef.current = tmModel;
          logStep("TM_MODEL_INITIALIZATION_RESOLVED", {
            durationMs: Math.round(performance.now() - tmStart),
          });
        }
      } catch (tmErr: any) {
        logStep("TM_MODEL_LOAD_SKIPPED", { reason: tmErr?.message });
        console.warn("[FocusDetection] Posture model load skipped, continuing with Haar Cascades:", tmErr);
        tmModelRef.current = null;
      }

      // Final StrictMode / Cancellation check
      if (!isMountedRef.current || initSessionIdRef.current !== currentSessionId) {
        return;
      }

      // Success: Clear timeout ceiling and activate detection loop
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }

      isInitializedRef.current = true;
      isInitializingRef.current = false;
      logStep("DETECTION_LOOP_STARTED", {
        totalInitDurationMs: Math.round(performance.now() - initStart),
      });
      updateStatus("detecting");
      startDetectionLoop();
    } catch (err: any) {
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      isInitializingRef.current = false;
      stopVisionPipeline("init_error");

      logStep("INITIALIZATION_FAILED", { message: err?.message, name: err?.name });
      console.error("[FocusDetection] Initialization error:", err);

      let msg = err?.message || "Failed to initialize AI Vision engine.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "Camera permission was denied. Please click the camera icon in your address bar, allow access, and try again.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        msg = "No webcam detected. Please connect a camera to use AI Focus monitoring.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        msg = "Webcam is currently in use by another application. Please close Zoom/Teams and try again.";
      }

      updateStatus("error", undefined, msg);
    }
  }, [loadOpenCv, startDetectionLoop, stopVisionPipeline, updateStatus]);

  // Cleanup strictly on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopVisionPipeline("component_unmount");
    };
  }, [stopVisionPipeline]);

  return (
    <div className="space-y-4">
      {/* Hidden processing canvas (fixed at 320x240) */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Main Video & Display Container */}
      <div className="relative rounded-xl overflow-hidden bg-black/80 aspect-video shadow-md border border-border/40">
        {/* Video element is ALWAYS mounted and rendered with layout so Chrome decodes frames immediately */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            focusState.status === "detecting" ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{ transform: "scaleX(-1)" }}
        />

        {/* 1. IDLE STATE: Clean Placeholder with Explicit "Start AI Vision" Button */}
        {focusState.status === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-black/85 via-black/70 to-black/85 p-6 text-center space-y-3 z-10">
            <div className="p-3.5 rounded-full bg-primary/10 border border-primary/20 text-primary">
              <Camera className="w-8 h-8" />
            </div>
            <div className="space-y-1 max-w-xs">
              <p className="text-sm font-semibold text-white">AI Vision Monitor is Standby</p>
              <p className="text-xs text-muted-foreground">
                Activate webcam posture & eye tracking when ready. Focus timer runs independently.
              </p>
            </div>
            <Button
              onClick={startVisionPipeline}
              size="sm"
              className="gap-2 bg-primary hover:bg-primary/90 text-white font-medium shadow-md shadow-primary/20"
            >
              <Play className="w-4 h-4" />
              Start AI Vision Monitor
            </Button>
          </div>
        )}

        {/* 2. LOADING STATE: Progressive Status Spinner with Sub-Stage Text & Cancel Button */}
        {focusState.status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-6 text-center space-y-3 z-10">
            <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin" />
            <div className="space-y-1 max-w-xs">
              <p className="text-sm font-semibold text-white">Initializing AI Vision Engine</p>
              <p className="text-xs text-primary/80 animate-pulse font-mono">
                {focusState.loadingStage || "Starting engine..."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => stopVisionPipeline("user_cancel")}
              className="text-xs border-white/20 hover:bg-white/10 text-muted-foreground mt-1"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* 3. DETECTING STATE: Live Overlays */}
        {focusState.status === "detecting" && (
          <>
            {/* Live OpenCV Face & Eye Tracking Badge */}
            <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 text-xs border border-white/15 shadow-sm z-10">
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

            {/* Live Performance Profiler Pill */}
            {perfStats.fps > 0 && (
              <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-md flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground border border-white/10 z-10">
                <Activity className="h-3 w-3 text-primary" />
                <span>{perfStats.frameMs}ms</span>
                <span>•</span>
                <span>{perfStats.fps} FPS</span>
              </div>
            )}

            {/* Refocus Alarm Pulsing Badge */}
            {alarmActive && (
              <div className="absolute top-3 right-3 bg-rose-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 animate-pulse shadow-lg text-xs font-bold z-10">
                <Bell className="h-4 w-4 animate-bounce" />
                <span>LOOK AT SCREEN!</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ERROR STATE: Actionable Alert with Retry */}
      {focusState.status === "error" && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-sm font-semibold">Camera / AI Monitor Issue</AlertTitle>
          <AlertDescription className="text-xs mt-1 flex flex-col gap-2">
            <span>{focusState.error}</span>
            <div className="flex items-center gap-2 mt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={startVisionPipeline}
                className="gap-1.5 text-xs h-7 border-destructive/40 hover:bg-destructive/20"
              >
                <RefreshCw className="w-3 h-3" />
                Retry AI Vision
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => stopVisionPipeline("user_dismiss")}
                className="text-xs h-7 text-muted-foreground hover:bg-destructive/10"
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* DETECTING CONTROLS & STATUS CARD */}
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

          <div className="pt-2 border-t border-border/40 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => stopVisionPipeline("user_stop")}
              className="gap-1.5 text-xs h-7 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <CameraOff className="w-3.5 h-3.5" />
              Stop AI Vision Monitor
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FocusDetection;
