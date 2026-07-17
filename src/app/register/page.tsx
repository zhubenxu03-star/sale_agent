"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AuthShell, FormField, authInputClass } from "@/components/auth/AuthShell";
import { useRegister } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api/client";
import { registerSchema, type RegisterValues } from "@/schemas/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const registerTenant = useRegister();
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { tenant_name: "", tenant_code: "", admin_name: "", email: "", password: "", confirm_password: "" },
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      await registerTenant.mutateAsync(values);
      router.replace("/");
    } catch {
      // Mutation state renders the server-provided message.
    }
  });
  const error = registerTenant.error instanceof ApiError ? registerTenant.error.message : null;

  return (
    <AuthShell title="注册企业" description="创建独立、安全的企业销售空间" footer={<>已有企业账号？ <Link href="/login" className="font-medium text-[var(--gold-deep)] hover:underline">返回登录</Link></>}>
      {error && <div role="alert" className="mb-5 rounded-xl border border-[#E7C8C4] bg-[#FFF7F6] px-3.5 py-3 text-xs text-[#9A463D]">{error}</div>}
      <form onSubmit={submit} className="grid grid-cols-2 gap-x-4 gap-y-4" noValidate>
        <div className="col-span-2"><FormField label="企业名称" htmlFor="tenant_name" error={form.formState.errors.tenant_name?.message}><input id="tenant_name" className={authInputClass} autoComplete="organization" placeholder="测试科技有限公司" {...form.register("tenant_name")} /></FormField></div>
        <FormField label="企业编码" htmlFor="tenant_code" error={form.formState.errors.tenant_code?.message}><input id="tenant_code" className={authInputClass} placeholder="test-company" {...form.register("tenant_code")} /></FormField>
        <FormField label="管理员姓名" htmlFor="admin_name" error={form.formState.errors.admin_name?.message}><input id="admin_name" className={authInputClass} autoComplete="name" placeholder="管理员" {...form.register("admin_name")} /></FormField>
        <div className="col-span-2"><FormField label="管理员邮箱" htmlFor="email" error={form.formState.errors.email?.message}><input id="email" type="email" className={authInputClass} autoComplete="email" placeholder="admin@company.com" {...form.register("email")} /></FormField></div>
        <FormField label="密码" htmlFor="password" error={form.formState.errors.password?.message}><div className="relative"><input id="password" type={showPassword ? "text" : "password"} className={`${authInputClass} pr-16`} autoComplete="new-password" {...form.register("password")} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)]" aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? "隐藏" : "显示"}</button></div></FormField>
        <FormField label="确认密码" htmlFor="confirm_password" error={form.formState.errors.confirm_password?.message}><input id="confirm_password" type={showPassword ? "text" : "password"} className={authInputClass} autoComplete="new-password" {...form.register("confirm_password")} /></FormField>
        <button type="submit" disabled={registerTenant.isPending} className="col-span-2 mt-2 flex h-11 items-center justify-center rounded-xl bg-[var(--navy)] text-sm font-medium text-white transition hover:bg-[var(--navy-deep)] disabled:cursor-not-allowed disabled:opacity-60">{registerTenant.isPending ? "正在创建企业…" : "创建企业并进入工作台"}</button>
      </form>
    </AuthShell>
  );
}
