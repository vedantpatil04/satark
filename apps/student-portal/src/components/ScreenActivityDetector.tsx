import { useEffect, useState, useRef } from "react";
import { Monitor, Loader2, AlertCircle, CheckCircle, Share2, BookOpen, Code, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { createWorker, Worker } from 'tesseract.js';
import { textClassifier } from "@/lib/textClassifier";
import { startGamingAlarm, stopGamingAlarm } from "@/utils/beep";

interface ActivityResult {
  activity: string;
  confidence: number;
  probabilities: {
    Studying: number;
    Coding: number;
    Gaming: number;
  };
}

interface Props {
  autoStart?: boolean;
}

const ScreenActivityDetector = ({ autoStart = false }: Props) => {
  const [isSharing, setIsSharing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [activityResult, setActivityResult] = useState<ActivityResult | null>(null);
  const [lastOcrText, setLastOcrText] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [ocrStatus, setOcrStatus] = useState<string>("");
  const [gamingDetectedCount, setGamingDetectedCount] = useState(0);
  
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ocrWorkerRef = useRef<Worker | null>(null);
  const detectionIntervalRef = useRef<number | null>(null);

  const iconMap = {
    "Studying": BookOpen,
    "Coding": Code,
    "Gaming": Gamepad2
  };

  const colorMap = {
    "Studying": "green",
    "Coding": "blue",
    "Gaming": "red"
  };

  useEffect(() => {
    if (autoStart) {
      setTimeout(() => {
        startScreenShare();
      }, 1000);
    }

    return () => {
      cleanup();
    };
  }, [autoStart]);

  const cleanup = async () => {
    stopGamingAlarm();
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    if (ocrWorkerRef.current) {
      await ocrWorkerRef.current.terminate();
      ocrWorkerRef.current = null;
    }
  };

  const startScreenShare = async () => {
    try {
      setError("");
      setIsInitializing(true);
      setOcrStatus("Requesting screen access...");

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" },
        audio: false,
        preferCurrentTab: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      // @ts-ignore
      const displaySurface = settings.displaySurface;
      
      if (displaySurface && displaySurface !== "monitor") {
        stream.getTracks().forEach(track => track.stop());
        setError("❌ You must share your ENTIRE SCREEN, not a window or tab. Please click 'Share Screen' again and select 'Entire Screen'.");
        setIsInitializing(false);
        return;
      }

      streamRef.current = stream;
      setOcrStatus("Loading AI model...");
      await textClassifier.load();

      setOcrStatus("Initializing OCR engine...");
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrStatus(`OCR: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      ocrWorkerRef.current = worker;

      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      videoRef.current = video;

      const canvas = document.createElement('canvas');
      canvasRef.current = canvas;

      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          resolve(true);
        };
      });

      setIsSharing(true);
      setIsInitializing(false);
      setOcrStatus("Active - Detecting every 10s");

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        stopScreenShare();
      });

      startDetectionLoop();

    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setError("❌ Screen sharing was denied. Please click 'Share Screen' and allow access.");
      } else if (err.name === "NotFoundError") {
        setError("❌ No screen available to share.");
      } else {
        setError(`❌ Error: ${err.message || "Screen sharing failed"}`);
      }
      setIsSharing(false);
      setIsInitializing(false);
      await cleanup();
    }
  };

  const stopScreenShare = async () => {
    await cleanup();
    setIsSharing(false);
    setActivityResult(null);
    setLastOcrText("");
    setOcrStatus("");
    setGamingDetectedCount(0);
  };

  const startDetectionLoop = () => {
    performOCRAndClassify();
    detectionIntervalRef.current = window.setInterval(() => {
      performOCRAndClassify();
    }, 10000);
  };

  const performOCRAndClassify = async () => {
    if (!videoRef.current || !canvasRef.current || !ocrWorkerRef.current) return;

    try {
      setOcrStatus("Capturing screen...");
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      setOcrStatus("Extracting text...");
      const { data: { text } } = await ocrWorkerRef.current.recognize(canvas);

      const cleanText = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
      setLastOcrText(cleanText.substring(0, 500));

      if (cleanText.length > 20) {
        setOcrStatus("Analyzing activity...");
        const result = await textClassifier.predict(cleanText);

        setActivityResult({
          activity: result.class,
          confidence: result.confidence,
          probabilities: {
            Studying: result.probabilities[0],
            Coding: result.probabilities[1],
            Gaming: result.probabilities[2]
          }
        });

        if (result.class === "Gaming") {
          setGamingDetectedCount(prev => prev + 1);
          startGamingAlarm();
        } else if (result.class === "Studying" || result.class === "Coding") {
          setGamingDetectedCount(0);
          stopGamingAlarm();
        }

        setOcrStatus("Active - Next scan in 10s");
      } else {
        setOcrStatus("Not enough text detected");
      }
    } catch (error) {
      setOcrStatus("Detection failed - retrying...");
    }
  };

  const getActivityColor = () => {
    if (!activityResult) return "gray";
    return colorMap[activityResult.activity as keyof typeof colorMap] || "gray";
  };

  const ActivityIcon = activityResult ? iconMap[activityResult.activity as keyof typeof iconMap] : Monitor;

  return (
    <div className="space-y-4">
      {!isSharing && !isInitializing ? (
        <div className="text-center py-6">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-4">
            <Monitor className="h-10 w-10 mx-auto mb-3 text-blue-400" />
            <p className="text-sm text-white/80 font-semibold mb-2">
              📢 Important: Share Your ENTIRE SCREEN
            </p>
            <p className="text-xs text-white/60">
              When the browser asks, select "Entire Screen" or "Your Entire Screen" - NOT a window or tab
            </p>
          </div>

          <Button onClick={startScreenShare} className="bg-blue-500 hover:bg-blue-600" size="lg">
            <Share2 className="h-4 w-4 mr-2" />
            Share Screen & Start Detection
          </Button>
          
          {error && (
            <div className="mt-4 p-3 bg-red-500/20 border border-red-500 rounded text-red-300 text-sm">
              <AlertCircle className="h-4 w-4 inline mr-2" />
              {error}
            </div>
          )}

           {/* FIX: Removed the list of technical features ("OCR extracts...", etc.) */}
        </div>
      ) : isInitializing ? (
        <div className="text-center py-8">
          <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-blue-400" />
          <p className="text-white/80 font-semibold">{ocrStatus}</p>
          <p className="text-white/50 text-sm mt-2">Please wait...</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge className="bg-green-500/20 text-green-300 border-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              {ocrStatus}
            </Badge>
            <Button
              onClick={stopScreenShare}
              variant="outline"
              size="sm"
              className="border-red-500 text-red-300 hover:bg-red-500/20"
            >
              Stop Sharing
            </Button>
          </div>

          {activityResult?.activity === "Gaming" && (
            <div className="p-4 bg-red-500/20 border-2 border-red-500 rounded-lg animate-pulse">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-6 w-6 text-red-300 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-red-300 text-lg">⚠️ GAMING DETECTED!</p>
                  <p className="text-sm text-red-200 mt-1">
                    Please return to studying immediately. Alarm is active.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs text-red-300">
                      <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></div>
                      <span>Alarm: Active ({gamingDetectedCount} detection{gamingDetectedCount !== 1 ? 's' : ''})</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activityResult && (
            <div className={`p-4 rounded-lg bg-${getActivityColor()}-500/20 border-2 border-${getActivityColor()}-500`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full bg-${getActivityColor()}-500/30`}>
                    <ActivityIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs text-white/70">Detected Activity</p>
                    <p className="text-2xl font-bold">{activityResult.activity}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold">{(activityResult.confidence * 100).toFixed(0)}%</p>
                  <p className="text-xs text-white/60">Confidence</p>
                </div>
              </div>

              <div className="space-y-2 mt-3 pt-3 border-t border-white/10">
                {Object.entries(activityResult.probabilities).map(([activity, prob]) => (
                  <div key={activity} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="flex items-center gap-1">
                        {activity === "Studying" && <BookOpen className="h-3 w-3" />}
                        {activity === "Coding" && <Code className="h-3 w-3" />}
                        {activity === "Gaming" && <Gamepad2 className="h-3 w-3" />}
                        {activity}
                      </span>
                      <span className="font-mono">{(prob * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={prob * 100} className="h-1" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {lastOcrText && (
            <div className="p-3 bg-white/5 rounded text-xs font-mono text-white/60 max-h-20 overflow-y-auto">
              <p className="font-bold text-white/80 mb-1">📝 OCR Text:</p>
              {lastOcrText}
            </div>
          )}

          {/* FIX: Removed the "Info Footer" containing the text "Using real OCR... " entirely */}
        </div>
      )}
    </div>
  );
};

export default ScreenActivityDetector;