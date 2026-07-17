export const queryKeys = {
  me: ["auth", "me"] as const,
  customers: (search = "") => ["customers", { search }] as const,
  conversations: (customerId?: string) =>
    ["conversations", { customerId: customerId || null }] as const,
  messages: (conversationId?: string) =>
    ["messages", { conversationId: conversationId || null }] as const,
};
