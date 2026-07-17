"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type { LoginValues, RegisterValues } from "@/schemas/auth";
import type { AuthIdentity } from "@/types/api";

export function useCurrentUser(enabled = true) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiRequest<AuthIdentity>("/api/auth/me"),
    enabled,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: LoginValues) =>
      apiRequest<AuthIdentity>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: (identity) => queryClient.setQueryData(queryKeys.me, identity),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formValues: RegisterValues) => {
      const { confirm_password: confirmPassword, ...values } = formValues;
      void confirmPassword;
      return apiRequest<AuthIdentity>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(values),
      });
    },
    onSuccess: (identity) => queryClient.setQueryData(queryKeys.me, identity),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<null>("/api/auth/logout", { method: "POST" }),
    onSettled: () => queryClient.clear(),
  });
}
