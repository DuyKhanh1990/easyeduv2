import type { Response } from "express";

export type ZaloEventType =
  | "new_message"
  | "conversation_created"
  | "conversation_updated"
  | "message_sent"
  | "notification_sent";

export interface ZaloSSEEvent {
  type: ZaloEventType;
  locationId: string;
  oaConfigId?: string;
  conversationId?: string;
  [key: string]: unknown;
}

export type FacebookEventType =
  | "fb_new_message"
  | "fb_conversation_created"
  | "fb_conversation_updated"
  | "fb_message_sent";

export interface FacebookSSEEvent {
  type: FacebookEventType;
  locationId: string;
  pageConfigId?: string;
  conversationId?: string;
  [key: string]: unknown;
}

interface SSEClient {
  id: string;
  userId: string;
  isSuperAdmin: boolean;
  allowedLocationIds: string[];
  res: Response;
}

class SSEManager {
  private clients = new Map<string, SSEClient>();

  add(client: SSEClient): void {
    this.clients.set(client.id, client);
  }

  remove(id: string): void {
    this.clients.delete(id);
  }

  emitFacebook(event: FacebookSSEEvent): void {
    for (const [id, client] of this.clients.entries()) {
      if (client.isSuperAdmin || client.allowedLocationIds.includes(event.locationId)) {
        try {
          client.res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        } catch {
          this.clients.delete(id);
        }
      }
    }
  }

  emit(event: ZaloSSEEvent): void {
    for (const [id, client] of this.clients.entries()) {
      if (client.isSuperAdmin || client.allowedLocationIds.includes(event.locationId)) {
        try {
          client.res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        } catch {
          this.clients.delete(id);
        }
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const sseManager = new SSEManager();
