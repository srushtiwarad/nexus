// nexus/frontend/src/hooks/useTasks.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksAPI } from '../services/api';
import { normalizeTask } from '../normalize';

export interface TaskFilters {
  status?: string;
  priority?: string;
  assigneeId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function useTasks(projectId: string | undefined, filters: TaskFilters = {}) {
  return useQuery({
    queryKey: ['tasks', projectId, filters],
    // Backend `/projects/:projectId/tasks` currently returns an array of tasks.
    // Normalize it to `{ data: Task[] }` so consumers can reliably use `.data`.
    queryFn: () =>
      tasksAPI
        .list(projectId!, { limit: 200, ...filters })
        .then((r) => ({ data: (r.data || []).map(normalizeTask) })),
    enabled: !!projectId,
    staleTime: 1000 * 15, // 15 seconds — refreshed by WS events anyway
  });
}

export function useTask(projectId: string, taskId: string) {
  return useQuery({
    queryKey: ['task', projectId, taskId],
    queryFn: () => tasksAPI.get(projectId, taskId).then((r) => normalizeTask(r.data)),
    enabled: !!projectId && !!taskId,
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => tasksAPI.create(projectId, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });
}

export function useUpdateTask(projectId: string, taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => tasksAPI.update(projectId, taskId, data).then(r => r.data),
    // Optimistic update for snappy Kanban drag
    onMutate: async (newData: any) => {
      await qc.cancelQueries({ queryKey: ['tasks', projectId] });
      const prev = qc.getQueryData(['tasks', projectId]);
      qc.setQueryData(['tasks', projectId], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((t: any) =>
            t.id === taskId ? { ...t, ...newData } : t
          ),
        };
      });
      return { prev };
    },
    onError: (_err, _data, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(['tasks', projectId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => tasksAPI.delete(projectId, taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });
}
