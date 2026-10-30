import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Room, Track } from "livekit-client";
import { mediaApi } from "@satark/shared-api";

interface UseWebRTCStreamOptions {
  role: "teacher" | "student";
  sendMessage: (msg: any) => void;
  lastMessage?: any;
  examId?: string;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

export function useWebRTCStream({ role, sendMessage, lastMessage, examId }: UseWebRTCStreamOptions) {
  // State for student: pending share request from a teacher
  const [incomingRequest, setIncomingRequest] = useState<{
    teacher_id: string;
    exam_id?: string;
    teacher_name?: string;
    exam_title?: string;
  } | null>(null);

  // Active sharing state
  const [isSharing, setIsSharing] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const livekitRoomRef = useRef<Room | null>(null);

  // Clean up peer connection, LiveKit room & media tracks
  const cleanup = useCallback(() => {
    if (livekitRoomRef.current) {
      try {
        livekitRoomRef.current.disconnect();
      } catch (e) {
        console.warn("Error disconnecting LiveKit room:", e);
      }
      livekitRoomRef.current = null;
    }
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

  // Initialize RTCPeerConnection (P2P fallback)
  const createPeerConnection = useCallback(
    (targetUserId: string, targetExamId?: string) => {
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
            exam_id: targetExamId,
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
    if (!incomingRequest && !examId) return;
    const teacher_id = incomingRequest?.teacher_id || "";
    const activeExamId = incomingRequest?.exam_id || examId;

    try {
      // 1. Explicitly prompt browser display media selection
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" },
        audio: false,
      });

      localStreamRef.current = stream;
      setIsSharing(true);
      if (teacher_id) setActivePeerId(teacher_id);
      setIncomingRequest(null);

      // Handle user clicking native browser "Stop sharing" bar
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare(teacher_id, activeExamId);
      };

      // 2. Notify backend of consent approval
      if (activeExamId) {
        await mediaApi.respondToShare(activeExamId, true).catch((e) => {
          console.warn("Failed to record share response in backend:", e);
        });
      }

      // 3. Connect to LiveKit SFU room if configured
      if (activeExamId) {
        try {
          const tokenResp = await mediaApi.getToken(activeExamId, { can_publish: true });
          if (tokenResp.is_configured && tokenResp.url && tokenResp.token) {
            const room = new Room({
              adaptiveStream: true,
              dynacast: true,
            });
            livekitRoomRef.current = room;
            await room.connect(tokenResp.url, tokenResp.token);
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
              await room.localParticipant.publishTrack(videoTrack, {
                name: "student_screen",
                source: Track.Source.ScreenShare,
              });
            }
          }
        } catch (lkErr) {
          console.warn("LiveKit publisher connection attempt notice:", lkErr);
        }

        // 4. Update server stream state so teacher live grid reflects active sharing
        await mediaApi.updateStreamState(activeExamId, true).catch((e) => {
          console.warn("Failed to update stream state:", e);
        });
      }

      // 5. Establish P2P fallback signaling if teacher_id present
      if (teacher_id) {
        const pc = createPeerConnection(teacher_id, activeExamId);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        sendMessage({
          type: "screen_share_accepted",
          teacher_id,
          exam_id: activeExamId,
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        sendMessage({
          type: "webrtc_offer",
          target_user_id: teacher_id,
          sdp: offer,
          exam_id: activeExamId,
        });
      }

      toast.success("Screen sharing active. Proctor is now viewing your display.");
    } catch (err: any) {
      console.error("Screen share start error:", err);
      toast.error(err.name === "NotAllowedError" ? "Screen share permission was declined." : "Could not start screen sharing.");
      rejectScreenShare();
    }
  }, [incomingRequest, examId, createPeerConnection, sendMessage]);

  const rejectScreenShare = useCallback(() => {
    const activeExamId = incomingRequest?.exam_id || examId;
    if (activeExamId) {
      mediaApi.respondToShare(activeExamId, false, "Declined by student").catch(() => {});
    }
    if (incomingRequest) {
      sendMessage({
        type: "screen_share_rejected",
        teacher_id: incomingRequest.teacher_id,
        exam_id: activeExamId,
      });
      setIncomingRequest(null);
      toast.info("Screen share request declined.");
    }
  }, [incomingRequest, examId, sendMessage]);

  const stopScreenShare = useCallback(
    (targetUserId?: string, targetExamId?: string) => {
      const target = targetUserId || activePeerId;
      const effectiveExam = targetExamId || examId || incomingRequest?.exam_id;

      if (effectiveExam) {
        mediaApi.updateStreamState(effectiveExam, false).catch(() => {});
      }

      if (target) {
        sendMessage({
          type: "screen_share_stopped",
          target_user_id: target,
          exam_id: effectiveExam,
        });
      }
      cleanup();
      toast.info("Screen sharing ended.");
    },
    [activePeerId, examId, incomingRequest, sendMessage, cleanup]
  );

  // --- Teacher Actions ---
  const requestScreenShare = useCallback(
    (studentId: string, targetExamId?: string) => {
      setActivePeerId(studentId);
      sendMessage({
        type: "screen_share_request",
        student_id: studentId,
        exam_id: targetExamId || examId,
      });
      toast.info("Sent screen share request to student. Awaiting authorization...");
    },
    [sendMessage, examId]
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
            teacher_name: msg.teacher_name,
            exam_title: msg.exam_title,
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
