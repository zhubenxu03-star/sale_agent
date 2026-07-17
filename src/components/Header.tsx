"use client";

import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { useLogout } from "@/hooks/useAuth";
import { useToast } from "@/components/providers/AppProviders";
import type { AuthIdentity } from "@/types/api";

const roleNames = {
  admin: "企业管理员",
  manager: "销售经理",
  sales: "销售顾问",
};

export function Header({
  identity,
  collapsed,
  onToggleSidebar,
  title = "销转智能工作台",
  subtitle = "真实客户与会话管理",
}: {
  identity: AuthIdentity;
  collapsed: boolean;
  onToggleSidebar: () => void;
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const logout = useLogout();
  const { showToast } = useToast();
  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } finally {
      showToast("已安全退出登录", "success");
      router.replace("/login");
    }
  };
  const tenantInitial = identity.tenant.name.slice(0, 1);
  return (
    <header
      className={`fixed right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-white/8 bg-[var(--navy-deep)] px-5 text-white transition-[left] ${collapsed ? "left-[72px]" : "left-[220px]"}`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          aria-label={collapsed ? "展开导航栏" : "收起导航栏"}
          className="grid h-8 w-8 place-items-center rounded-lg text-white/55 hover:bg-white/8 hover:text-white"
        >
          <span className="text-lg leading-none">{collapsed ? "›" : "‹"}</span>
        </button>
        <h1 className="text-[16px] font-semibold tracking-[0.04em]">{title}</h1>
        <span className="h-4 w-px bg-white/15" />
        <span className="text-[11px] text-white/38">{subtitle}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 xl:flex">
          <span
            role={identity.tenant.logo_url ? "img" : undefined}
            aria-label={identity.tenant.logo_url ? "企业 Logo" : undefined}
            style={
              identity.tenant.logo_url
                ? {
                    backgroundImage: `url(${identity.tenant.logo_url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
            className="grid h-7 w-7 place-items-center overflow-hidden rounded-lg bg-[var(--gold)] text-[11px] font-semibold text-white"
          >
            {identity.tenant.logo_url ? null : tenantInitial}
          </span>
          <div className="max-w-[150px]">
            <p className="truncate text-[10px] font-medium">
              {identity.tenant.name}
            </p>
            <p className="mt-0.5 text-[9px] text-white/38">
              {identity.tenant.code}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--champagne)] text-[11px] font-semibold text-[var(--navy)]">
            {identity.user.name.slice(0, 1)}
          </span>
          <div className="hidden lg:block">
            <p className="text-[11px] font-medium">{identity.user.name}</p>
            <p className="mt-0.5 text-[9px] text-white/38">
              {roleNames[identity.user.role]}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={logout.isPending}
          className="h-8 rounded-lg border border-white/10 px-3 text-[10px] text-white/60 transition hover:bg-white/8 hover:text-white disabled:opacity-50"
          aria-label="退出登录"
        >
          {logout.isPending ? "退出中…" : "退出登录"}
        </button>
        <button
          aria-label="通知"
          className="relative grid h-9 w-9 place-items-center rounded-lg text-white/48 hover:bg-white/8 hover:text-white"
        >
          <Icon name="bell" className="h-[18px] w-[18px]" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--gold)]" />
        </button>
      </div>
    </header>
  );
}
