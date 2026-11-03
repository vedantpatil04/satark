import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { mediaApi } from "@satark/shared-api";

interface UseWebRTCStreamOptions {
  role: "teacher" | "student";
  sendMessage: (msg: any) => void;
  lastMessage?: any;
  examId?: string;
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

export function useWebRTCStream({ role, sendMessage, lastMessage, examId }: UseWebRTCStreamOptions) {
  // Pending screen share request from proctor
  const [incomingRequest, setIncomingRequest] = useState<{
    teacher_id: string;
    exam_id?: string;
    teacher_name?: string;
    exam_title?: string;
  } | null>(null);

  // Active sharing states: Primary = Screen, Optional = Camera
  const [isSharing, setIsSharing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Detect Android/Mobile client
  const isMobile = useCallback(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }, []);

  // Clean up all peer connections & media tracks
  const cleanup = useCallback(() => {
    pendingCandidatesRef.current = [];
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setIsSharing(false);
    setIsCameraActive(false);
    setIsViewing(false);
    setActivePeerId(null);
    setRemoteStream(null);
    setIncomingRequest(null);
  }, []);

  // Initialize RTCPeerConnection for Native WebRTC
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
            exam_id: targetExamId || examId,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          if (isSharing) {
            console.warn("Screen share WebRTC connection dropped. Peer state:", pc.connectionState);
          }
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
    [role, sendMessage, examId, isSharing]
  );

  // Negotiate and transmit offer to teacher
  const sendOffer = useCallback(
    async (
      pc: RTCPeerConnection,
      targetUserId: string,
      targetExamId?: string,
      streamType: string = "both",
      extraMeta?: {
        screen_track_id?: string;
        camera_track_id?: string;
        screen_stream_id?: string;
        camera_stream_id?: string;
      }
    ) => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        sendMessage({
          type: "webrtc_offer",
          target_user_id: targetUserId,
          sdp: offer,
          exam_id: targetExamId || examId,
          stream_type: streamType,
          ...extraMeta,
        });
      } catch (err) {
        console.error("Failed to generate WebRTC offer:", err);
      }
    },
    [sendMessage, examId]
  );

  // --- Student Actions ---

  // PRIMARY: Start Screen Share (Desktop + Android MediaProjection native screen capture)
  const startScreenShare = useCallback(
    async (targetTeacherId?: string) => {
      const teacher_id = targetTeacherId || incomingRequest?.teacher_id || activePeerId || "";
      const activeExamId = incomingRequest?.exam_id || examId;

      // Verify browser support for screen capture API
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== "function") {
        toast.error(
          "Native screen capture is not supported on this browser. On Android devices, please use Google Chrome or a modern browser supporting native MediaProjection."
        );
        return null;
      }

      try {
        // Native screen capture (Desktop or Android Chrome MediaProjection prompt)
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "monitor",
            width: { max: 1280, ideal: 1280 },
            height: { max: 720, ideal: 720 },
            frameRate: { max: 15, ideal: 15 },
          },
          audio: false,
        });

        screenStreamRef.current = stream;
        setIsSharing(true);
        if (teacher_id) setActivePeerId(teacher_id);
        setIncomingRequest(null);

        // Handle candidate clicking native OS/browser "Stop sharing" bar
        stream.getVideoTracks()[0].onended = () => {
          stopScreenShare(teacher_id, activeExamId);
        };

        // Notify backend of consent approval and screen active
        if (activeExamId) {
          await mediaApi.respondToShare(activeExamId, true).catch(() => {});
          await mediaApi.updateStreamState(activeExamId, true, isCameraActive).catch(() => {});
        }

        // Establish Native P2P WebRTC Connection to Teacher
        if (teacher_id) {
          const pc = createPeerConnection(teacher_id, activeExamId);

          // Add primary screen track
          stream.getTracks().forEach((track) => {
            track.contentHint = "detail";
            pc.addTrack(track, stream);
          });

          // If optional webcam is active, also attach it as secondary track
          if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach((camTrack) => {
              camTrack.contentHint = "motion";
              pc.addTrack(camTrack, cameraStreamRef.current!);
            });
          }

          sendMessage({
            type: "screen_share_accepted",
            teacher_id,
            exam_id: activeExamId,
          });

          await sendOffer(pc, teacher_id, activeExamId, cameraStreamRef.current ? "both" : "screen");
        }

        toast.success("Live screen sharing active. Proctor is now monitoring your display.");
        return stream;
      } catch (err: any) {
        console.error("Screen share activation error:", err);
        toast.error(getMediaPermissionErrorMessage(err, "screen"));
        if (incomingRequest) {
          rejectScreenShare();
        }
        return null;
      }
    },
    [incomingRequest, activePeerId, examId, isCameraActive, createPeerConnection, sendOffer, sendMessage]
  );

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

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setIsSharing(false);

      if (effectiveExam) {
        mediaApi.updateStreamState(effectiveExam, false, isCameraActive).catch(() => {});
      }

      if (target) {
        sendMessage({
          type: "screen_share_stopped",
          target_user_id: target,
          exam_id: effectiveExam,
        });
      }

      if (!isCameraActive) {
        cleanup();
      }
      toast.info("Screen sharing ended.");
    },
    [activePeerId, examId, incomingRequest, isCameraActive, sendMessage, cleanup]
  );

  // OPTIONAL: Start/stop secondary webcam stream
  const startCameraStream = useCallback(
    async (targetTeacherId?: string) => {
      const teacher_id = targetTeacherId || incomingRequest?.teacher_id || activePeerId || "";
      const activeExamId = incomingRequest?.exam_id || examId;

      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { max: 640, ideal: 480 },
            height: { max: 480, ideal: 360 },
            frameRate: { max: 15, ideal: 12 },
          },
          audio: false,
        });

        cameraStreamRef.current = camStream;
        setIsCameraActive(true);
        if (teacher_id) setActivePeerId(teacher_id);

        // Notify backend of secondary camera active
        if (activeExamId) {
          await mediaApi.updateStreamState(activeExamId, isSharing, true).catch(() => {});
        }

        if (teacher_id) {
          const pc = pcRef.current || createPeerConnection(teacher_id, activeExamId);
          camStream.getTracks().forEach((track) => {
            track.contentHint = "motion";
            pc.addTrack(track, camStream);
          });
          await sendOffer(pc, teacher_id, activeExamId, isSharing ? "both" : "camera");
        }

        toast.success("Optional webcam stream active.");
        return camStream;
      } catch (err: any) {
        console.error("Camera access error:", err);
        toast.error("Could not activate optional webcam. Please check camera permissions.");
        return null;
      }
    },
    [incomingRequest, activePeerId, examId, isSharing, createPeerConnection, sendOffer]
  );

  const stopCameraShare = useCallback(
    (targetUserId?: string, targetExamId?: string) => {
      const effectiveExam = targetExamId || examId || incomingRequest?.exam_id;
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
      setIsCameraActive(false);

      if (effectiveExam) {
        mediaApi.updateStreamState(effectiveExam, isSharing, false).catch(() => {});
      }

      if (!isSharing) {
        cleanup();
      }
      toast.info("Optional webcam stream stopped.");
    },
    [examId, incomingRequest, isSharing, cleanup]
  );

  // MANDATORY: Request both webcam and screen simultaneously/sequentially for exam entry
  const startDualStream = useCallback(
    async (targetTeacherId?: string) => {
      const teacher_id = targetTeacherId || incomingRequest?.teacher_id || activePeerId || "";
      const activeExamId = incomingRequest?.exam_id || examId;

      try {
        // 1. Mandatory Webcam
        let camStream = cameraStreamRef.current;
        if (!camStream || !camStream.getVideoTracks().some((t) => t.readyState === "live")) {
          camStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "user",
              width: { max: 480, ideal: 320 },
              height: { max: 360, ideal: 240 },
              frameRate: { max: 15, ideal: 12 },
            },
            audio: false,
          });
          cameraStreamRef.current = camStream;
        }
        setIsCameraActive(true);

        // 2. Mandatory Screen Sharing
        let scrStream = screenStreamRef.current;
        if (!scrStream || !scrStream.getVideoTracks().some((t) => t.readyState === "live")) {
          scrStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              displaySurface: "monitor",
              width: { max: 1280, ideal: 1280 },
              height: { max: 720, ideal: 720 },
              frameRate: { max: 15, ideal: 15 },
            },
            audio: false,
          });
          screenStreamRef.current = scrStream;
        }
        setIsSharing(true);

        if (teacher_id) setActivePeerId(teacher_id);
        setIncomingRequest(null);

        const scrTrack = scrStream.getVideoTracks()[0];
        const camTrack = camStream.getVideoTracks()[0];
        if (scrTrack) scrTrack.contentHint = "detail";
        if (camTrack) camTrack.contentHint = "motion";

        // Interruption listeners on both tracks
        if (scrTrack) {
          scrTrack.onended = () => {
            stopScreenShare(teacher_id, activeExamId);
          };
        }
        if (camTrack) {
          camTrack.onended = () => {
            stopCameraShare(teacher_id, activeExamId);
          };
        }

        // Notify backend
        if (activeExamId) {
          await mediaApi.respondToShare(activeExamId, true).catch(() => {});
          await mediaApi.updateStreamState(activeExamId, true, true).catch(() => {});
        }

        // Establish WebRTC connection if teacher is present
        if (teacher_id) {
          const pc = createPeerConnection(teacher_id, activeExamId);
          if (scrTrack) pc.addTrack(scrTrack, scrStream);
          if (camTrack) pc.addTrack(camTrack, camStream);

          sendMessage({
            type: "screen_share_accepted",
            teacher_id,
            exam_id: activeExamId,
          });

          await sendOffer(pc, teacher_id, activeExamId, "both", {
            screen_track_id: scrTrack?.id,
            camera_track_id: camTrack?.id,
            screen_stream_id: scrStream.id,
            camera_stream_id: camStream.id,
          });
        }

        toast.success("Webcam & Screen monitoring active. Assessment unlocked.");
        return { cameraStream: camStream, screenStream: scrStream };
      } catch (err: any) {
        console.error("Dual stream authorization error:", err);
        if (cameraStreamRef.current && !screenStreamRef.current) {
          cameraStreamRef.current.getTracks().forEach((t) => t.stop());
          cameraStreamRef.current = null;
          setIsCameraActive(false);
        }
        if (screenStreamRef.current && !cameraStreamRef.current) {
          screenStreamRef.current.getTracks().forEach((t) => t.stop());
          screenStreamRef.current = null;
          setIsSharing(false);
        }
        toast.error(getMediaPermissionErrorMessage(err, "both"));
        return null;
      }
    },
    [incomingRequest, activePeerId, examId, createPeerConnection, sendOffer, sendMessage, stopScreenShare, stopCameraShare]
  );

  // Accept Screen Share (invoked from consent modal)
  const acceptScreenShare = useCallback(async () => {
    return startDualStream();
  }, [startDualStream]);

  // --- Teacher Actions ---
  const requestScreenShare = useCallback(
    (studentId: string, targetExamId?: string) => {
      setActivePeerId(studentId);
      sendMessage({
        type: "screen_share_request",
        student_id: studentId,
        exam_id: targetExamId || examId,
      });
      toast.info("Sent screen monitoring request to student. Awaiting authorization...");
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
          const teacher_id = msg.teacher_id;
          const targetExamId = msg.exam_id || examId;

          // If student already has active streams, automatically establish WebRTC connection without disturbing exam!
          const hasCam = cameraStreamRef.current && cameraStreamRef.current.getVideoTracks().some((t) => t.readyState === "live");
          const hasScr = screenStreamRef.current && screenStreamRef.current.getVideoTracks().some((t) => t.readyState === "live");

          if (hasCam && hasScr && teacher_id) {
            setActivePeerId(teacher_id);
            const scrStream = screenStreamRef.current!;
            const camStream = cameraStreamRef.current!;
            const scrTrack = scrStream.getVideoTracks()[0];
            const camTrack = camStream.getVideoTracks()[0];

            const pc = createPeerConnection(teacher_id, targetExamId);
            if (scrTrack) {
              scrTrack.contentHint = "detail";
              pc.addTrack(scrTrack, scrStream);
            }
            if (camTrack) {
              camTrack.contentHint = "motion";
              pc.addTrack(camTrack, camStream);
            }

            sendMessage({
              type: "screen_share_accepted",
              teacher_id,
              exam_id: targetExamId,
            });

            await sendOffer(pc, teacher_id, targetExamId, "both", {
              screen_track_id: scrTrack?.id,
              camera_track_id: camTrack?.id,
              screen_stream_id: scrStream.id,
              camera_stream_id: camStream.id,
            });
            toast.info("Connected live monitoring stream to proctor.");
          } else {
            setIncomingRequest({
              teacher_id: msg.teacher_id,
              exam_id: msg.exam_id,
              teacher_name: msg.teacher_name,
              exam_title: msg.exam_title,
            });
          }
        } else if (msg.type === "webrtc_answer" && pcRef.current) {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            // Drain any pending candidates received before answer
            const queued = pendingCandidatesRef.current || [];
            pendingCandidatesRef.current = [];
            for (const cand of queued) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.warn("Error draining ICE candidate:", e);
              }
            }
          } catch (e) {
            console.error("Error setting remote answer:", e);
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
          toast.info("Proctor concluded the live viewing session.");
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
            console.warn("Error adding ICE candidate:", e);
          }
        } else if (msg.type === "screen_share_stopped") {
          cleanup();
          toast.info("Candidate stopped streaming.");
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
    isCameraActive,
    isViewing,
    remoteStream,
    activePeerId,
    startDualStream,
    startScreenShare,
    acceptScreenShare,
    rejectScreenShare,
    stopScreenShare,
    startCameraStream,
    stopCameraShare,
    requestScreenShare,
    isMobile: isMobile(),
  };
}
