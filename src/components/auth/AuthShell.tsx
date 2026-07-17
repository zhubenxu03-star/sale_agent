import Link from "next/link";
import { Icon } from "@/components/Icon";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.1fr)] bg-[var(--background)]">
      <section className="relative flex overflow-hidden bg-[var(--navy)] px-14 py-12 text-white">
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full border border-white/5" />
        <div className="absolute -left-10 top-1/3 h-48 w-48 rounded-full border border-white/5" />
        <div className="relative z-10 flex max-w-lg flex-col">
          <Link href="/" className="flex items-center gap-3" aria-label="智销 AI 首页">
            <span className="grid h-11 w-11 place-items-center rounded-[13px] bg-[var(--gold)] shadow-[0_8px_24px_rgba(185,138,82,0.25)]">
              <Icon name="sparkles" className="h-5 w-5" />
            </span>
            <span><b className="block text-base tracking-[0.08em]">智销 AI</b><small className="mt-1 block tracking-[0.2em] text-white/40">SALES COPILOT</small></span>
          </Link>
          <div className="my-auto py-20">
            <p className="mb-4 text-xs tracking-[0.18em] text-[var(--champagne)]">企业销售智能工作台</p>
            <h2 className="max-w-md text-[34px] font-semibold leading-[1.35] tracking-[-0.02em]">让每一次客户沟通，都沉淀为可持续的成交能力</h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-white/52">统一管理客户、会话与销售跟进记录。在安全的企业租户空间中，让真实数据驱动每一步销售决策。</p>
          </div>
          <p className="text-[11px] text-white/30">多租户数据隔离 · 企业级身份认证 · 安全会话</p>
        </div>
      </section>
      <section className="flex items-center justify-center p-10">
        <div className="w-full max-w-[430px]">
          <p className="text-xs font-medium tracking-[0.14em] text-[var(--gold-deep)]">WELCOME</p>
          <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em] text-[var(--navy)]">{title}</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{description}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-7 border-t border-[var(--border)] pt-6 text-center text-xs text-[var(--text-muted)]">{footer}</div>
        </div>
      </section>
    </main>
  );
}

export function FormField({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-xs font-medium text-[var(--navy)]">{label}</label>
      {children}
      {error && <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-[11px] text-[#A34E43]">{error}</p>}
    </div>
  );
}

export const authInputClass = "h-11 w-full rounded-xl border border-[var(--border-strong)] bg-white px-3.5 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--text-light)] focus:border-[var(--champagne)] focus:shadow-[0_0_0_3px_rgba(216,208,193,0.2)]";
