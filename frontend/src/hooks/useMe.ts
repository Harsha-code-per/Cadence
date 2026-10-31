"use client";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

export type Role = "admin" | "staff" | "customer";
export type Me = { id: number; email: string; full_name: string; role: Role; customer_id: number | null; is_demo: boolean };

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Me>("/auth/me/"),
    retry: (n, e) => !(e instanceof ApiError && e.status === 401) && n < 1,
    staleTime: 5 * 60_000,
  });
}
