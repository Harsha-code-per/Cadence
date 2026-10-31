"use client";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, type Paginated } from "@/lib/api";

type Params = Record<string, string | number | boolean | undefined>;

export function useList<T>(resource: string, params: Params = {}) {
  return useQuery({
    queryKey: [resource, params],
    queryFn: () => api.get<Paginated<T>>(`/${resource}/`, params),
    placeholderData: keepPreviousData,
  });
}

/** Every option for a select (catalog lists are small; page_size is capped at 100 by the API). */
export function useOptions<T>(resource: string, params: Params = {}) {
  return useList<T>(resource, { page_size: 100, ...params });
}

export function useSave<T extends { id?: number }>(resource: string, noun: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: unknown }) =>
      id ? api.patch<T>(`/${resource}/${id}/`, body) : api.post<T>(`/${resource}/`, body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [resource] });
      toast.success(v.id ? `${noun} saved` : `${noun} created`);
    },
  });
}

export function useRemove(resource: string, noun: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/${resource}/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] });
      toast.success(`${noun} deleted`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not delete."),
  });
}
