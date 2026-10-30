import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface UseWebRTCStreamOptions {
  role: "teacher" | "student";
  sendMessage: (msg: any) => void;
  lastMessage?: any;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

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

  // Clean up peer connection & media tracks
  const cleanup = useCallback(() => {
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
      toast.error(err.name === "NotAllowedError" ? "Screen share permission was declined." : "Could not start screen sharing.");
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
        } else if (msg.type === "ice_candidate" && pcRef.current && msg.candidate) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (e) {
            console.error("Error adding ICE candidate:", e);
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

