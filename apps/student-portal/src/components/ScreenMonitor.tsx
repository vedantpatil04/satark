import { useEffect, useRef, useState } from "react";
import { Monitor, Square, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ScreenMonitor = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAttempted, setHasAttempted] = useState(false);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Auto-start screen monitoring on component mount
  useEffect(() => {
    const autoStartMonitoring = async () => {
      // Only attempt once
      if (hasAttempted) return;
      setHasAttempted(true);

      // Small delay to let page load
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await startScreenMonitoring();
    };

    autoStartMonitoring();

    return () => {
      stopScreenMonitoring();
    };
  }, []); // Empty dependency array - runs once on mount

  const startScreenMonitoring = async () => {
    try {
      // Request screen capture permission
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
          cursor: "never",
        },
        audio: false,
      });

      screenStreamRef.current = displayStream;
      setIsMonitoring(true);
      setError(null);

      // Stop monitoring when user stops sharing
      displayStream.getVideoTracks()[0].addEventListener("ended", () => {
        stopScreenMonitoring();
      });

      // Monitor activity
      console.log("Screen monitoring active");
    } catch (err) {
      console.error("Screen capture error:", err);
      
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          setError("Screen sharing was declined. You can start it manually if needed.");
        } else if (err.name === "NotFoundError") {
          setError("No screen source found.");
        } else {
          setError("Screen sharing not available on this device.");
        }
      }
      setIsMonitoring(false);
    }
  };

  const stopScreenMonitoring = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    setIsMonitoring(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 rounded-lg bg-white/10">
        <div className="flex items-center gap-3">
          <Monitor className="h-5 w-5" />
          <div>
            <span className="font-semibold block">Screen Monitoring</span>
            <span className="text-xs text-white/70">
              {isMonitoring ? "Tracking your focus" : "Not active"}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {isMonitoring ? (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              </div>
              <Button
                onClick={stopScreenMonitoring}
                size="sm"
                variant="destructive"
              >
                <Square className="h-3 w-3 mr-1" />
                Stop
              </Button>
            </>
          ) : (
            <Button 
              onClick={startScreenMonitoring} 
              size="sm"
              className="bg-purple-500 hover:bg-purple-600"
            >
              <Monitor className="h-3 w-3 mr-1" />
              Start
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {isMonitoring && (
        <div className="text-sm text-white/80 p-3 bg-green-500/10 rounded border border-green-500/30">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5" />
            <div>
              <p className="font-medium text-green-400">Screen monitoring active</p>
              <p className="text-xs text-white/70 mt-1">
                Your screen activity is being tracked to help maintain focus during this study session.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenMonitor;
