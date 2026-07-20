import type { Customer } from "@/types/api";
import { Icon } from "@/components/Icon";

type Props = {
  customers: Customer[];
  selectedId?: string;
  search: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

export function CustomerToolbar({ customers, selectedId, search, loading, onSearch, onSelect, onCreate }: Props) {
  return (
    <section className="workspace-toolbar panel-card flex min-h-[52px] shrink-0 items-center justify-between gap-3 px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="hidden shrink-0 xl:block"><p className="text-xs font-semibold text-[var(--navy)]">工作对象</p><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">选择客户后连续操作</p></div>
        <div className="relative min-w-0">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-light)]" />
          <input aria-label="搜索客户" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索客户或企业" className="workspace-control w-[180px] pl-9 2xl:w-[220px]" />
        </div>
        <select aria-label="选择客户" value={selectedId || ""} onChange={(event) => onSelect(event.target.value)} disabled={loading || !customers.length} className="workspace-control min-w-[210px] max-w-[320px] flex-1 disabled:text-[var(--text-light)]"><option value="">{loading ? "正在加载客户…" : customers.length ? "请选择客户" : "暂无客户"}</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.company_name ? ` · ${customer.company_name}` : ""}</option>)}</select>
      </div>
      <button type="button" onClick={onCreate} className="workspace-button shrink-0 bg-[var(--gold-soft)] text-[var(--gold-deep)]"><span className="text-lg leading-none">+</span>新建客户</button>
    </section>
  );
}
