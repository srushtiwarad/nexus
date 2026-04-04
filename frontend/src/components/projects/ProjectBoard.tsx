// nexus/frontend/src/components/projects/ProjectBoard.tsx (v2 — with TaskDetailPanel)
import { useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { milestonesAPI, projectsAPI, tasksAPI } from '@/services/api';
import { useWebSocket, type WSMessage } from '@/hooks/useWebSocket';
import { useTasks, useCreateTask } from '@/hooks/useTasks';
import TaskDetailPanel from '@/components/tasks/TaskDetailPanel';
import { useAuthStore } from '@/store/auth.store';
import type { Task } from '@/types';

const COLUMNS: { key: Task['status']; label: string; color: string }[] = [
  { key: 'todo',        label: 'To do',       color: 'text-gray-400' },
  { key: 'in_progress', label: 'In Progress',  color: 'text-blue-400' },
  { key: 'in_review',   label: 'In Review',    color: 'text-amber-400' },
  { key: 'done',        label: 'Done',         color: 'text-emerald-400' },
];

const PRIORITY_BADGE: Record<string, string> = {
  low:      'bg-gray-800 text-gray-500',
  medium:   'bg-blue-900/40 text-blue-300',
  high:     'bg-amber-900/40 text-amber-300',
  critical: 'bg-red-900/40 text-red-300',
};

function TaskCard({ task, selected, onClick }: { task: Task; selected: boolean; onClick: () => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/taskId', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onClick}
      className={`bg-gray-800 border rounded-lg p-3.5 cursor-pointer transition-all ${
        selected ? 'border-indigo-500 shadow-[0_0_0_2px_rgba(99,102,241,0.2)]'
                 : 'border-gray-700 hover:border-gray-600'
      }`}
    >
      <p className="text-sm font-medium text-white leading-snug mb-2.5">{task.title}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${PRIORITY_BADGE[task.priority]}`}>
          {task.priority}
        </span>
        {task.commentCount ? (
          <span className="text-xs text-gray-600">{task.commentCount} 💬</span>
        ) : null}
        {task.assigneeName && (
          <div className="ml-auto w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-medium">
            {task.assigneeName[0]}
          </div>
        )}
      </div>
    </div>
  );
}

function QuickAddForm({ projectId, status, onDone }: { projectId: string; status: Task['status']; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const create = useCreateTask(projectId);
  return (
    <div className="mt-1.5">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Task title…"
        onKeyDown={e => {
          if (e.key === 'Enter' && title.trim()) create.mutate({ title, status }, { onSuccess: onDone });
          if (e.key === 'Escape') onDone();
        }}
        className="w-full px-3 py-2 bg-gray-800 border border-indigo-500 text-white placeholder-gray-600 rounded-lg text-sm focus:outline-none"
      />
      <div className="flex gap-1.5 mt-1.5">
        <button onClick={() => title.trim() && create.mutate({ title, status }, { onSuccess: onDone })}
          disabled={!title.trim() || create.isPending}
          className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg">
          Add
        </button>
        <button onClick={onDone} className="px-3 text-gray-500 hover:text-white text-xs">Cancel</button>
      </div>
    </div>
  );
}

export default function ProjectBoard() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const [addingTo, setAddingTo] = useState<Task['status'] | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [dragOver, setDragOver] = useState<Task['status'] | null>(null);
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [showMilestones, setShowMilestones] = useState(true);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDue, setMilestoneDue] = useState('');

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsAPI.get(projectId!).then(r => r.data),
    enabled: !!projectId,
  });

  const { data: taskData } = useTasks(projectId);

  const { data: milestones = [] } = useQuery({
    queryKey: ['milestones', projectId],
    enabled: !!projectId,
    queryFn: () => milestonesAPI.list(projectId!).then(r => r.data),
  });

  const createMilestone = useMutation({
    mutationFn: (d: { title: string; dueDate: string }) => milestonesAPI.create(projectId!, d),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['milestones', projectId] });
      setMilestoneTitle('');
      setMilestoneDue('');
    },
  });

  const deleteMilestone = useMutation({
    mutationFn: (milestoneId: string) => milestonesAPI.delete(projectId!, milestoneId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['milestones', projectId] });
    },
  });

  const visibleTasks = useMemo(() => {
    const tasks: Task[] = taskData?.data || [];
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (onlyMine && userId && t.assigneeId !== userId) return false;
      if (!q) return true;
      return (t.title || '').toLowerCase().includes(q);
    });
  }, [taskData?.data, query, onlyMine, userId]);

  const updateStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: Task['status'] }) =>
      tasksAPI.update(projectId!, taskId, { status }),
    onMutate: async ({ taskId, status }) => {
      await qc.cancelQueries({ queryKey: ['tasks', projectId] });
      const prev = qc.getQueryData(['tasks', projectId]);
      qc.setQueryData(['tasks', projectId], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((t: Task) => (t.id === taskId ? { ...t, status } : t)),
        };
      });
      // Also update any cached single-task query
      qc.setQueryData(['task', projectId, taskId], (old: any) => (old ? { ...old, status } : old));
      return { prev };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(['tasks', projectId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });

  const handleDrop = (status: Task['status'], e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const taskId = e.dataTransfer.getData('text/taskId');
    if (!taskId || !projectId) return;
    updateStatus.mutate({ taskId, status });
  };

  useWebSocket(projectId, useCallback((msg: WSMessage) => {
    if (['task:updated','task:created','comment:created'].includes(msg.type as string)) {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    }
  }, [qc, projectId]));

  const tasksByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.key] = visibleTasks.filter(t => t.status === col.key);
    return acc;
  }, {} as Record<string, Task[]>);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3 flex-shrink-0">
        {project && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }}/>}
        <h1 className="text-lg font-bold text-white">{project?.name ?? '…'}</h1>
        <span className="text-sm text-gray-600">{visibleTasks.length} tasks</span>
        <div className="ml-4 flex-1 max-w-xs">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Progress</span>
            <span>{visibleTasks.filter(t => t.status === 'done').length}/{visibleTasks.length}</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: visibleTasks.length ? `${Math.round(100 * visibleTasks.filter(t => t.status === 'done').length / visibleTasks.length)}%` : '0%' }}/>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              className="w-56 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={() => setOnlyMine((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
              onlyMine ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200' : 'bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800/60'
            }`}
            title="Show only tasks assigned to you"
          >
            Only mine
          </button>
          <button
            onClick={() => { setAddingTo('todo'); setSelectedTask(null); }}
            className="px-3 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            + New task
          </button>
          <button
            onClick={() => setShowMilestones((v) => !v)}
            className="px-3 py-2 rounded-lg text-sm bg-gray-900 border border-gray-800 text-gray-300 hover:bg-gray-800/60 transition-colors"
          >
            {showMilestones ? 'Hide milestones' : 'Show milestones'}
          </button>
        </div>
      </div>

      {showMilestones && (
        <div className="px-6 py-4 border-b border-gray-800 bg-gray-950/40">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 className="text-sm font-semibold text-white">Milestones</h2>
            <span className="text-xs text-gray-600">{(milestones as any[]).length}</span>
          </div>

          <div className="flex flex-wrap items-end gap-2 mb-4">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs text-gray-500 mb-1">Title</label>
              <input
                value={milestoneTitle}
                onChange={(e) => setMilestoneTitle(e.target.value)}
                placeholder="e.g. MVP release"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Due</label>
              <input
                type="date"
                value={milestoneDue}
                onChange={(e) => setMilestoneDue(e.target.value)}
                className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button
              disabled={!milestoneTitle.trim() || !milestoneDue || createMilestone.isPending}
              onClick={() => createMilestone.mutate({ title: milestoneTitle.trim(), dueDate: milestoneDue })}
              className="px-3 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors"
            >
              {createMilestone.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>

          {(milestones as any[]).length === 0 ? (
            <p className="text-sm text-gray-500">No milestones yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(milestones as any[]).slice(0, 12).map((m: any) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-full bg-gray-900 border border-gray-800"
                >
                  <span className="text-xs text-gray-400">{String(m.due_date).slice(0, 10)}</span>
                  <span className="text-xs text-white max-w-[220px] truncate">{m.title}</span>
                  <button
                    onClick={() => {
                      const ok = confirm(`Delete milestone "${m.title}"?`);
                      if (!ok) return;
                      deleteMilestone.mutate(m.id);
                    }}
                    className="text-xs text-gray-600 hover:text-red-300 transition-colors"
                    title="Delete milestone"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {(milestones as any[]).length > 12 && (
                <span className="text-xs text-gray-600 px-3 py-2">+{(milestones as any[]).length - 12} more</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 p-5 h-full min-w-max">
            {COLUMNS.map(col => {
              const colTasks = tasksByStatus[col.key] || [];
              return (
                <div
                  key={col.key}
                  className="w-64 flex-shrink-0 flex flex-col"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(col.key);
                  }}
                  onDragLeave={() => setDragOver((s) => (s === col.key ? null : s))}
                  onDrop={(e) => handleDrop(col.key, e)}
                >
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className={`text-xs font-semibold ${col.color}`}>{col.label}</span>
                    <span className="text-xs text-gray-700 bg-gray-800 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                    <button onClick={() => { setAddingTo(col.key); setSelectedTask(null); }}
                      className="ml-auto text-gray-700 hover:text-gray-400 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                      </svg>
                    </button>
                  </div>
                  <div
                    className={`flex-1 space-y-2 overflow-y-auto max-h-[calc(100vh-220px)] rounded-lg ${
                      dragOver === col.key ? 'ring-2 ring-indigo-500/40 bg-indigo-500/5' : ''
                    }`}
                  >
                    {colTasks.map(task => (
                      <TaskCard key={task.id} task={task}
                        selected={selectedTask?.id === task.id}
                        onClick={() => setSelectedTask(task)}/>
                    ))}
                    {addingTo === col.key && (
                      <QuickAddForm projectId={projectId!} status={col.key} onDone={() => setAddingTo(null)}/>
                    )}
                    {colTasks.length === 0 && addingTo !== col.key && (
                      <button onClick={() => { setAddingTo(col.key); setSelectedTask(null); }}
                        className="w-full py-7 border border-dashed border-gray-800 rounded-lg text-xs text-gray-700 hover:text-gray-500 hover:border-gray-700 transition-colors">
                        + Add task
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {selectedTask && (
          <TaskDetailPanel task={selectedTask} projectId={projectId!} onClose={() => setSelectedTask(null)}/>
        )}
      </div>
    </div>
  );
}
