"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type { Customer, CustomerInput, PageData } from "@/types/api";

export function useCustomers(search = "") {
  const params = new URLSearchParams({ page_size: "100" });
  if (search.trim()) params.set("search", search.trim());
  return useQuery({
    queryKey: queryKeys.customers(search),
    queryFn: () => apiRequest<PageData<Customer>>(`/api/customers?${params}`),
  });
}

export function useCustomer(customerId?: string) {
  return useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => apiRequest<Customer>(`/api/customers/${customerId}`),
    enabled: Boolean(customerId),
    retry: false,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomerInput) =>
      apiRequest<Customer>("/api/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useUpdateCustomer(customerId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<CustomerInput>) =>
      apiRequest<Customer>(`/api/customers/${customerId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (customer) => {
      queryClient.setQueryData(["customer", customer.id], customer);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (customerId: string) =>
      apiRequest<{ id: string }>(`/api/customers/${customerId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, customerId) => {
      queryClient.removeQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.removeQueries({ queryKey: ["conversations"] });
      queryClient.removeQueries({ queryKey: ["messages"] });
    },
  });
}
