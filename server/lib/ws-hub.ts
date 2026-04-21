import { WebSocketServer, WebSocket } from "ws";

type UserId = string;

const userSockets = new Map<UserId, Set<WebSocket>>();

export function initializeWsHub(wss: WebSocketServer) {
  wss.on("connection", (ws) => {
    let registeredUserId: UserId | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "register" && typeof msg.userId === "string") {
          registeredUserId = msg.userId;
          if (!userSockets.has(registeredUserId)) {
            userSockets.set(registeredUserId, new Set());
          }
          userSockets.get(registeredUserId)!.add(ws);
          ws.send(JSON.stringify({ type: "registered", userId: registeredUserId }));
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      if (registeredUserId) {
        const sockets = userSockets.get(registeredUserId);
        if (sockets) {
          sockets.delete(ws);
          if (sockets.size === 0) {
            userSockets.delete(registeredUserId);
          }
        }
      }
    });

    ws.on("error", () => {
      ws.terminate();
    });
  });
}

export function emitToUser(userId: UserId, payload: object) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const data = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}
