import React, { useEffect, useRef } from "react";
import { Monitor, X, Maximize2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TeacherScreenViewerModalProps {
  isOpen: boolean;
  studentId: string | null;
  remoteStream: MediaStream | null;
  onClose: () => void;
}

export const TeacherScreenViewerModal: React.FC<TeacherScreenViewerModalProps> = ({
  isOpen,
  studentId,
  remoteStream,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, isOpen]);

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background border-border/80">
        <DialogHeader className="p-4 border-b border-border/40 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Monitor className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                Live Candidate Display Stream
                <span className="flex items-center gap-1 text-[10px] bg-destructive/15 text-destructive px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-ping" /> Live
                </span>
              </DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                Student ID: {studentId || "Candidate"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={toggleFullscreen} className="h-8 text-xs gap-1">
              <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
            </Button>
            <Button size="sm" variant="destructive" onClick={onClose} className="h-8 text-xs font-bold gap-1">
              <X className="w-3.5 h-3.5" /> End Stream
            </Button>
          </div>
        </DialogHeader>

        {/* Video Player Box */}
        <div className="relative bg-black aspect-video flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-contain"
          />
          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <ShieldCheck className="w-8 h-8 animate-pulse text-primary" />
              <p className="text-xs">Awaiting candidate video feed...</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

