import { AuthGate } from "@/components/auth/AuthGate";
import { KnowledgeDashboard } from "@/components/knowledge/KnowledgeDashboard";

export default function KnowledgePage() {
  return (
    <AuthGate>
      <KnowledgeDashboard />
    </AuthGate>
  );
}
