// nexus/frontend/src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/auth.store';

export type WSMessage = { type: string; [key: string]: unknown };
type MessageHandler = (msg: WSMessage) => void;

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`;

let globalWs: WebSocket | null = null;
const handlers = new Set<MessageHandler>();

function getOrCreateSocket(token: string): WebSocket {
  if (globalWs && globalWs.readyState === WebSocket.OPEN) return globalWs;

  globalWs = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

  globalWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handlers.forEach((h) => h(msg));
    } catch { /* ignore */ }
  };

  globalWs.onclose = () => { globalWs = null; };
  globalWs.onerror = (e) => console.warn('WS error', e);
  return globalWs;
}

export function useWebSocket(projectId?: string, onMessage?: MessageHandler) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((msg: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const ws = getOrCreateSocket(accessToken);
    wsRef.current = ws;

    const handler: MessageHandler = (msg) => {
      if (onMessage) onMessage(msg);
    };
    handlers.add(handler);

    const joinWhenReady = () => {
      if (projectId) ws.send(JSON.stringify({ type: 'join', projectId }));
    };
    if (ws.readyState === WebSocket.OPEN) joinWhenReady();
    else ws.addEventListener('open', joinWhenReady);

    return () => {
      handlers.delete(handler);
      if (projectId && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'leave', projectId }));
      }
    };
  }, [accessToken, projectId, onMessage]);

  return { send };
}
