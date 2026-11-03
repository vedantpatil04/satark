import React from "react";
import { Monitor, AlertCircle, ShieldAlert, Radio, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StudentScreenShareModalProps {
  incomingRequest: {
    teacher_id: string;
    exam_id?: string;
    teacher_name?: string;
    exam_title?: string;
  } | null;
  isSharing: boolean;
  isCameraActive?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onStop: () => void;
  onToggleCamera?: () => void;
  isMobile?: boolean;
}

export const StudentScreenShareModal: React.FC<StudentScreenShareModalProps> = ({
  incomingRequest,
  isSharing,
  isCameraActive = false,
  onAccept,
  onReject,
  onStop,
  onToggleCamera,
  isMobile = false,
}) => {
  return (
    <>
      {/* 1. Explicit Screen Sharing Consent Request Dialog */}
      <Dialog open={!!incomingRequest} onOpenChange={(open) => !open && onReject()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
              <Monitor className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-lg font-bold">
              Proctor Stream Request
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-relaxed">
              Your instructor{" "}
              <strong className="text-foreground">
                {incomingRequest?.teacher_name || "Exam Proctor"}
              </strong>{" "}
              has requested to view your active screen and camera to verify examination integrity
              {incomingRequest?.exam_title ? ` for ${incomingRequest.exam_title}` : ""}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 my-2">
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-3.5 text-xs text-primary flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Hardware Capture Consent:</strong> When you click accept, your browser will prompt you to allow webcam access and select your screen
                {isMobile ? " (choose 'Entire screen')" : " (choose 'Entire screen' or window)"}.
              </span>
            </div>

            <div className="bg-muted/40 border border-border/50 rounded-xl p-3 text-[11px] text-muted-foreground flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-primary" />
              <span>You retain full consent control and can stop sharing at any time.</span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={onReject} className="text-xs">
              Decline Request
            </Button>
            <Button size="sm" onClick={onAccept} className="text-xs font-bold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
              <Video className="w-3.5 h-3.5" /> Accept & Authorize Streams
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Persistent Live Sharing Indicator Banner */}
      {(isSharing || isCameraActive) && (
        <aside
          aria-label="Active live streaming notification"
          className="fixed bottom-6 right-6 z-50 bg-rose-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-rose-400/40 backdrop-blur-md animate-in slide-in-from-bottom-3 duration-300"
        >
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
            </span>
            <div>
              <div className="text-xs font-black tracking-wider uppercase flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                {isSharing && isCameraActive
                  ? "Screen & Webcam Monitored"
                  : isSharing
                  ? "Screen Monitored"
                  : "Webcam Monitored"}
              </div>
              <div className="text-[10px] text-white/80 font-medium">
                {isSharing ? "Screen feed live to instructor" : "Optional webcam active"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onToggleCamera && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleCamera}
                className="text-xs font-bold bg-white/15 hover:bg-white/25 text-white h-7 px-2"
                title={isCameraActive ? "Stop Optional Webcam" : "Start Optional Webcam"}
              >
                {isCameraActive ? <VideoOff className="w-3.5 h-3.5 mr-1" /> : <Video className="w-3.5 h-3.5 mr-1" />}
                {isCameraActive ? "Cam Off" : "Cam On"}
              </Button>
            )}

            {isSharing && (
              <Button
                variant="destructive"
                size="sm"
                onClick={onStop}
                className="text-xs font-bold bg-white text-rose-600 hover:bg-white/90 h-7 px-2.5 shadow-sm"
              >
                Stop Sharing
              </Button>
            )}
          </div>
        </aside>
      )}
    </>
  );
};
