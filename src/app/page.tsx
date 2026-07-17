import { ChampionPanel } from "@/components/ChampionPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { CustomerPanel } from "@/components/CustomerPanel";
import { Header } from "@/components/Header";
import { KnowledgePanel } from "@/components/KnowledgePanel";
import { MetricCard } from "@/components/MetricCard";
import { Sidebar } from "@/components/Sidebar";
import { Workflow } from "@/components/Workflow";
import { metrics } from "@/data/mockData";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar />
      <Header />
      <main className="ml-[220px] mt-16 h-[calc(100vh-64px)] min-h-[736px] overflow-auto p-[18px] 2xl:p-6">
        <div className="mx-auto flex h-full min-w-[1040px] max-w-[1800px] flex-col gap-3.5 2xl:gap-4">
          <section className="grid shrink-0 grid-cols-4 gap-3.5 2xl:gap-4" aria-label="客户关键指标">
            {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
          </section>

          <div className="grid min-h-[480px] flex-1 grid-cols-[minmax(0,1fr)_330px] gap-3.5 2xl:grid-cols-[minmax(0,1fr)_370px] 2xl:gap-4">
            <ChatPanel />
            <aside className="grid min-h-0 grid-rows-[1.08fr_0.82fr_1fr] gap-3.5 2xl:gap-4" aria-label="客户与知识辅助信息">
              <CustomerPanel />
              <KnowledgePanel />
              <ChampionPanel />
            </aside>
          </div>

          <Workflow />
        </div>
      </main>
    </div>
  );
}
