import { useEffect, useRef, useState } from "react";
import * as tmImage from "@teachablemachine/image";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface CameraFeedProps {
  onFocusStateChange: (state: string) => void;
}

const CameraFeed = ({ onFocusStateChange }: CameraFeedProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    initCamera();
    loadModel();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      stopCamera();
    };
  }, []);

  const loadModel = async () => {
    try {
      const modelURL = "/model/model.json";
      const metadataURL = "/model/metadata.json";
      
      const loadedModel = await tmImage.load(modelURL, metadataURL);
      setModel(loadedModel);
      setIsLoading(false);
      toast({
        title: "Model loaded",
        description: "Focus detection is now active",
      });
    } catch (error) {
      console.error("Error loading model:", error);
      toast({
        title: "Model loading failed",
        description: "Please refresh the page to try again",
        variant: "destructive",
      });
    }
  };

  const initCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          startPrediction();
        };
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      toast({
        title: "Camera access denied",
        description: "Please allow camera access for focus detection",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  const startPrediction = async () => {
    if (!model || !videoRef.current || !canvasRef.current) return;

    const predict = async () => {
      if (videoRef.current && model) {
        const prediction = await model.predict(videoRef.current);
        
        // Find the class with highest probability
        const topPrediction = prediction.reduce((prev, current) =>
          prev.probability > current.probability ? prev : current
        );

        onFocusStateChange(topPrediction.className);

        // Draw on canvas
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx && videoRef.current) {
          ctx.drawImage(
            videoRef.current,
            0,
            0,
            canvasRef.current!.width,
            canvasRef.current!.height
          );

          // Draw prediction text
          ctx.font = "24px Inter";
          ctx.fillStyle = getColorForState(topPrediction.className);
          ctx.fillRect(0, 0, canvasRef.current!.width, 60);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(
            `${topPrediction.className} (${(topPrediction.probability * 100).toFixed(1)}%)`,
            20,
            40
          );
        }
      }

      animationFrameRef.current = requestAnimationFrame(predict);
    };

    predict();
  };

  const getColorForState = (state: string) => {
    switch (state) {
      case "Focused":
        return "hsl(142, 76%, 36%)"; // Success green
      case "Distracted":
        return "hsl(0, 84%, 60%)"; // Warning red
      case "Confused":
        return "hsl(38, 92%, 50%)"; // Warning orange
      default:
        return "hsl(262, 83%, 58%)"; // Primary
    }
  };

  return (
    <div className="relative w-full aspect-video bg-muted rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Loading focus detection model...</p>
          </div>
        </div>
      )}
      <video ref={videoRef} className="hidden" />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="w-full h-full object-cover"
      />
    </div>
  );
};

export default CameraFeed;
