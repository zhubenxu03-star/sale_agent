import { AuthGate } from "@/components/auth/AuthGate";
import { AgentSettingsDashboard } from "@/components/agent/AgentSettingsDashboard";

export default function AgentSettingsPage() {
  return <AuthGate><AgentSettingsDashboard /></AuthGate>;
}
