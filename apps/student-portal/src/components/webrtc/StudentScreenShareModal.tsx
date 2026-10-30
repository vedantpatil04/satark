import React from "react";
import { Monitor, AlertCircle, ShieldAlert, Radio, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface StudentScreenShareModalProps {
  incomingRequest: {
    teacher_id: string;
    exam_id?: string;
    teacher_name?: string;
    exam_title?: string;
  } | null;
  isSharing: boolean;
  onAccept: () => void;
  onReject: () => void;
  onStop: () => void;
}

export const StudentScreenShareModal: React.FC<StudentScreenShareModalProps> = ({
  incomingRequest,
  isSharing,
  onAccept,
  onReject,
  onStop,
}) => {
  return (
    <>
      {/* 1. Explicit Consent Request Dialog */}
      <Dialog open={!!incomingRequest} onOpenChange={(open) => !open && onReject()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
              <Monitor className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-lg font-bold">Proctor Screen Share Request</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-relaxed">
              Your instructor{" "}
              <strong className="text-foreground">
                {incomingRequest?.teacher_name || "Exam Proctor"}
              </strong>{" "}
              has requested to view your active desktop screen to verify assessment integrity
              {incomingRequest?.exam_title ? ` for ${incomingRequest.exam_title}` : ""}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 my-2">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Browser Permission Required:</strong> You will be prompted by your browser to choose which screen, application window, or tab to share. Audio and camera are disabled by default.
              </span>
            </div>

            <div className="bg-muted/40 border border-border/50 rounded-xl p-3 text-[11px] text-muted-foreground flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-primary" />
              <span>You retain full control and can stop sharing at any moment during the exam.</span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={onReject} className="text-xs">
              Decline Request
            </Button>
            <Button size="sm" onClick={onAccept} className="text-xs font-bold gap-1.5 bg-primary hover:bg-primary/90">
              <Monitor className="w-3.5 h-3.5" /> Accept & Select Screen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Persistent Live Sharing Indicator Banner */}
      {isSharing && (
        <aside
          aria-label="Active screen sharing notification"
          className="fixed bottom-6 right-6 z-50 bg-rose-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-rose-400/40 backdrop-blur-md animate-in slide-in-from-bottom-3 duration-300"
        >
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
            </span>
            <div>
              <div className="text-xs font-black tracking-wider uppercase flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 animate-pulse" /> Live Screen Sharing
              </div>
              <div className="text-[10px] text-white/80 font-medium">
                Monitored by exam supervisor
              </div>
            </div>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={onStop}
            className="h-8 text-xs font-bold bg-white text-rose-600 hover:bg-white/90 shadow-sm ml-2"
          >
            Stop Sharing
          </Button>
        </aside>
      )}
    </>
  );
};
