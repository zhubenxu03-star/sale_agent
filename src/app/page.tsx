import { Suspense } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  return <AuthGate><Suspense fallback={null}><Dashboard /></Suspense></AuthGate>;
}
