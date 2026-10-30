import { useEffect, useRef, useState, useCallback } from "react";
import { authApi } from "@/api/auth";
import { useAuth } from "@/context/AuthContext";

const getWsBaseUrl = (): string => {
  // 1. Check for runtime custom API server override
  if (typeof window !== "undefined") {
    const custom = localStorage.getItem("custom_api_server");
    if (custom) {
      const wsProto = custom.startsWith("https") ? "wss:" : "ws:";
      const clean = custom.replace(/^https?:\/\//, "").replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "");
      return `${wsProto}//${clean}/ws`;
    }
  }

  // 2. Check build-time env variable
  const envUrl = import.meta.env.VITE_WS_BASE_URL;
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl;
  }

  // 3. Fallback to browser hostname
  if (typeof window !== "undefined" && window.location) {
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostname = window.location.hostname;
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${wsProto}//${hostname}:8000/ws`;
    }
  }

  return envUrl || "ws://127.0.0.1:8000/ws";
};

interface RealtimeSocketOptions {
  channel: "teacher" | "student";
  onMessage?: (data: any) => void;
  enabled?: boolean;
}

export function useRealtimeSocket({ channel, onMessage, enabled = true }: RealtimeSocketOptions) {
  const { isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isUnmountedRef = useRef(false);

  // Keep latest onMessage callback in ref without triggering reconnects
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(async () => {
    if (!isAuthenticated || !enabled || isUnmountedRef.current) return;

    // Prevent redundant connections if already connecting or open
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      // 1. Fetch short-lived ticket
      const ticketRes = await authApi.getWsTicket(channel);
      if (!ticketRes.ticket || isUnmountedRef.current) return;

      const wsBase = getWsBaseUrl();
      const wsUrl = `${wsBase}/${channel}?ticket=${encodeURIComponent(ticketRes.ticket)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          ws.close();
          return;
        }
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setLastMessage(parsed);
          if (onMessageRef.current) {
            onMessageRef.current(parsed);
          }
        } catch (e) {
          console.error("Failed to parse WS frame:", e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (!isUnmountedRef.current && isAuthenticated && enabled) {
          // Exponential backoff reconnect: 2s, 4s, 8s, max 30s
          const delay = Math.min(2000 * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch (err) {
      console.warn("WebSocket ticket acquisition failed:", err);
      if (!isUnmountedRef.current && isAuthenticated && enabled) {
        const delay = Math.min(2000 * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    }
  }, [channel, enabled, isAuthenticated]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === "string" ? data : JSON.stringify(data));
    }
  }, []);

  return { isConnected, lastMessage, send };
}
