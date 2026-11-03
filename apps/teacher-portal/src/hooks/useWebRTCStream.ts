import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface UseWebRTCStreamOptions {
  role: "teacher" | "student";
  sendMessage: (msg: any) => void;
  lastMessage?: any;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
];

const isMacOS = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /Macintosh|Mac OS X|MacPPC|MacIntel/i.test(navigator.userAgent || navigator.platform);
};

const getMediaPermissionErrorMessage = (err: any, streamType: "camera" | "screen" | "both"): string => {
  const isMac = isMacOS();
  const errName = err?.name || "";
  const errMsg = err?.message || "";

  if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
    if (isMac) {
      if (streamType === "screen" || streamType === "both") {
        return "macOS Screen Recording permission required: Open System Settings > Privacy & Security > Screen & System Audio Recording, enable your browser, and restart the browser.";
      }
      return "macOS Camera permission required: Open System Settings > Privacy & Security > Camera, enable your browser, and restart the browser.";
    }
    return `Permission denied. ${streamType === "both" ? "Both Webcam and Screen sharing" : streamType === "screen" ? "Screen sharing" : "Webcam"} are required for exam integrity.`;
  }

  if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
    return "No compatible camera or display capture device detected.";
  }

  if (errName === "NotReadableError" || errName === "TrackStartError") {
    return isMac
      ? "Capture device is in use by another app or requires permission in System Settings > Privacy & Security."
      : "Camera or Screen stream is currently in use by another application. Please close conflicting apps and retry.";
  }

  return `Media capture error: ${errMsg || "Failed to initialize stream."}`;
};

export function useWebRTCStream({ role, sendMessage, lastMessage }: UseWebRTCStreamOptions) {
  // State for student: pending share request from a teacher
  const [incomingRequest, setIncomingRequest] = useState<{
    teacher_id: string;
    exam_id?: string;
  } | null>(null);

  // Active sharing state
  const [isSharing, setIsSharing] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Clean up peer connection & media tracks
  const cleanup = useCallback(() => {
    pendingCandidatesRef.current = [];
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setIsSharing(false);
    setIsViewing(false);
    setActivePeerId(null);
    setRemoteStream(null);
    setIncomingRequest(null);
  }, []);

  // Initialize RTCPeerConnection
  const createPeerConnection = useCallback(
    (targetUserId: string, examId?: string) => {
      if (pcRef.current) {
        pcRef.current.close();
      }

      const pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendMessage({
            type: "ice_candidate",
            target_user_id: targetUserId,
            candidate: event.candidate,
            exam_id: examId,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
          cleanup();
        }
      };

      if (role === "teacher") {
        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            setRemoteStream(event.streams[0]);
            setIsViewing(true);
            toast.success("Connected to student live screen stream!");
          }
        };
      }

      return pc;
    },
    [role, sendMessage, cleanup]
  );

  // --- Student Actions ---
  const acceptScreenShare = useCallback(async () => {
    if (!incomingRequest) return;
    const { teacher_id, exam_id } = incomingRequest;

    try {
      // 1. Prompt browser display media
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" },
        audio: false,
      });

      localStreamRef.current = stream;
      setIsSharing(true);
      setActivePeerId(teacher_id);
      setIncomingRequest(null);

      // Handle user clicking native browser "Stop sharing" bar
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare(teacher_id, exam_id);
      };

      // 2. Establish peer connection & add tracks
      const pc = createPeerConnection(teacher_id, exam_id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // 3. Notify teacher that request was accepted
      sendMessage({
        type: "screen_share_accepted",
        teacher_id,
        exam_id,
      });

      // 4. Create and send WebRTC Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendMessage({
        type: "webrtc_offer",
        target_user_id: teacher_id,
        sdp: offer,
        exam_id,
      });

      toast.success("Screen sharing active. Proctor is now viewing your display.");
    } catch (err: any) {
      console.error("Screen share start error:", err);
      toast.error(getMediaPermissionErrorMessage(err, "screen"));
      rejectScreenShare();
    }
  }, [incomingRequest, createPeerConnection, sendMessage]);

  const rejectScreenShare = useCallback(() => {
    if (incomingRequest) {
      sendMessage({
        type: "screen_share_rejected",
        teacher_id: incomingRequest.teacher_id,
        exam_id: incomingRequest.exam_id,
      });
      setIncomingRequest(null);
      toast.info("Screen share request declined.");
    }
  }, [incomingRequest, sendMessage]);

  const stopScreenShare = useCallback(
    (targetUserId?: string, examId?: string) => {
      const target = targetUserId || activePeerId;
      if (target) {
        sendMessage({
          type: "screen_share_stopped",
          target_user_id: target,
          exam_id: examId,
        });
      }
      cleanup();
      toast.info("Screen sharing ended.");
    },
    [activePeerId, sendMessage, cleanup]
  );

  // --- Teacher Actions ---
  const requestScreenShare = useCallback(
    (studentId: string, examId?: string) => {
      setActivePeerId(studentId);
      sendMessage({
        type: "screen_share_request",
        student_id: studentId,
        exam_id: examId,
      });
      toast.info("Sent screen share request to student. Awaiting authorization...");
    },
    [sendMessage]
  );

  // --- WebSocket Signaling Message Dispatcher ---
  useEffect(() => {
    if (!lastMessage || !lastMessage.type) return;

    const handleSignaling = async () => {
      const msg = lastMessage;

      if (role === "student") {
        if (msg.type === "screen_share_request") {
          setIncomingRequest({
            teacher_id: msg.teacher_id,
            exam_id: msg.exam_id,
          });
        } else if (msg.type === "webrtc_answer" && pcRef.current) {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          } catch (e) {
            console.error("Error setting remote answer:", e);
          }
        } else if (msg.type === "ice_candidate" && pcRef.current && msg.candidate) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (e) {
            console.error("Error adding ICE candidate:", e);
          }
        } else if (msg.type === "screen_share_stopped") {
          cleanup();
          toast.info("Proctor ended the screen-viewing session.");
        }
      } else if (role === "teacher") {
        if (msg.type === "screen_share_rejected") {
          cleanup();
          toast.warning("Candidate declined the screen share request.");
        } else if (msg.type === "screen_share_accepted") {
          toast.info("Candidate accepted. Negotiating secure WebRTC stream...");
        } else if (msg.type === "webrtc_offer") {
          try {
            const studentId = msg.student_id || msg.sender_id;
            const pc = createPeerConnection(studentId, msg.exam_id);
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

            // Drain any pending ICE candidates received before remote description was set
            const queued = pendingCandidatesRef.current || [];
            pendingCandidatesRef.current = [];
            for (const cand of queued) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.warn("Error draining ICE candidate:", e);
              }
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            sendMessage({
              type: "webrtc_answer",
              target_user_id: studentId,
              sdp: answer,
              exam_id: msg.exam_id,
            });
          } catch (e) {
            console.error("Error responding to offer:", e);
            toast.error("Failed to establish video connection with student.");
          }
        } else if (msg.type === "ice_candidate" && msg.candidate) {
          if (pcRef.current && pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch (e) {
              console.warn("Error adding ICE candidate:", e);
            }
          } else {
            pendingCandidatesRef.current.push(msg.candidate);
          }
        } else if (msg.type === "screen_share_stopped") {
          cleanup();
          toast.info("Candidate stopped screen sharing.");
        }
      }
    };

    handleSignaling();
  }, [lastMessage, role, createPeerConnection, sendMessage, cleanup]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    incomingRequest,
    isSharing,
    isViewing,
    remoteStream,
    activePeerId,
    acceptScreenShare,
    rejectScreenShare,
    stopScreenShare,
    requestScreenShare,
  };
}

