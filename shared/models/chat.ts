// Re-export from canonical schema — definitions live in shared/schema.ts
export {
  conversations,
  messages,
  insertConversationSchema,
  insertMessageSchema,
} from "@shared/schema";
export type { Conversation, InsertConversation, Message, InsertMessage } from "@shared/schema";
