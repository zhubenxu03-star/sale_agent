export const queryKeys = {
  me: ["auth", "me"] as const,
  customers: (search = "") => ["customers", { search }] as const,
  conversations: (customerId?: string) =>
    ["conversations", { customerId: customerId || null }] as const,
  messages: (conversationId?: string) =>
    ["messages", { conversationId: conversationId || null }] as const,
  knowledgeBases: ["knowledge", "bases"] as const,
  knowledgeConfig: ["knowledge", "config"] as const,
  knowledgeDocuments: (baseId?: string) => ["knowledge", "documents", baseId] as const,
  knowledgeDocument: (documentId?: string) => ["knowledge", "document", documentId] as const,
  knowledgeChunks: (documentId?: string, page = 1) =>
    ["knowledge", "chunks", documentId, page] as const,
};
