import React from "react";
import { Monitor, AlertCircle, ShieldAlert, X } from "lucide-react";
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
  incomingRequest: { teacher_id: string; exam_id?: string } | null;
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
              <Monitor className="w-6 h-6" />
            </div>
            <DialogTitle className="text-lg font-bold">Proctor Screen Share Request</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              Your exam supervisor has requested to view your desktop display to verify exam integrity.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-500 flex items-start gap-2.5 my-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              You will be prompted to select which screen, window, or tab to share. You can stop sharing at any time.
            </span>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" onClick={onReject} className="text-xs">
              Decline
            </Button>
            <Button onClick={onAccept} className="text-xs font-bold gap-1.5">
              <Monitor className="w-4 h-4" /> Accept & Select Screen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Persistent Live Sharing Banner */}
      {isSharing && (
        <div className="fixed bottom-6 right-6 z-50 bg-destructive text-destructive-foreground px-4 py-3 rounded-xl shadow-2xl flex items-center gap-4 animate-pulse border border-white/20">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
            <ShieldAlert className="w-4 h-4 text-white" />
            <span className="text-xs font-bold tracking-wide">LIVE SCREEN SHARING ACTIVE</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={onStop}
            className="h-7 text-xs font-bold bg-white text-destructive hover:bg-white/90"
          >
            Stop Sharing
          </Button>
        </div>
      )}
    </>
  );
};
