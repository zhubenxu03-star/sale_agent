"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AuthShell, FormField, authInputClass } from "@/components/auth/AuthShell";
import { useCurrentUser, useLogin } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api/client";
import { loginSchema, type LoginValues } from "@/schemas/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const login = useLogin();
  const me = useCurrentUser();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { tenant_code: "", email: "", password: "" },
  });

  useEffect(() => {
    if (me.data) router.replace("/");
  }, [me.data, router]);

  const submit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      router.replace(searchParams.get("next") || "/");
    } catch {
      // Mutation state renders the server-provided message.
    }
  });
  const error = login.error instanceof ApiError ? login.error.message : null;

  return (
    <AuthShell
      title="登录工作台"
      description="使用您的企业账号继续"
      footer={<>还没有企业账号？ <Link href="/register" className="font-medium text-[var(--gold-deep)] hover:underline">注册企业</Link></>}
    >
      {searchParams.get("expired") === "1" && <div role="alert" className="mb-5 rounded-xl border border-[#E7D6B7] bg-[var(--gold-soft)] px-3.5 py-3 text-xs text-[var(--gold-deep)]">登录已过期，请重新登录</div>}
      {error && <div role="alert" className="mb-5 rounded-xl border border-[#E7C8C4] bg-[#FFF7F6] px-3.5 py-3 text-xs text-[#9A463D]">{error}</div>}
      <form onSubmit={submit} className="space-y-5" noValidate>
        <FormField label="企业编码" htmlFor="tenant_code" error={form.formState.errors.tenant_code?.message}>
          <input id="tenant_code" autoComplete="organization" className={authInputClass} placeholder="例如：test-company" aria-invalid={Boolean(form.formState.errors.tenant_code)} aria-describedby={form.formState.errors.tenant_code ? "tenant_code-error" : undefined} {...form.register("tenant_code")} />
        </FormField>
        <FormField label="登录邮箱" htmlFor="email" error={form.formState.errors.email?.message}>
          <input id="email" type="email" autoComplete="email" className={authInputClass} placeholder="name@company.com" aria-invalid={Boolean(form.formState.errors.email)} aria-describedby={form.formState.errors.email ? "email-error" : undefined} {...form.register("email")} />
        </FormField>
        <FormField label="密码" htmlFor="password" error={form.formState.errors.password?.message}>
          <div className="relative"><input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className={`${authInputClass} pr-16`} placeholder="至少 8 位" aria-invalid={Boolean(form.formState.errors.password)} aria-describedby={form.formState.errors.password ? "password-error" : undefined} {...form.register("password")} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)] hover:text-[var(--navy)]" aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? "隐藏" : "显示"}</button></div>
        </FormField>
        <button type="submit" disabled={login.isPending} className="flex h-11 w-full items-center justify-center rounded-xl bg-[var(--navy)] text-sm font-medium text-white shadow-[0_8px_20px_rgba(22,42,70,0.14)] transition hover:bg-[var(--navy-deep)] disabled:cursor-not-allowed disabled:opacity-60">{login.isPending ? "正在登录…" : "登录"}</button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
