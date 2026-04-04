// nexus/frontend/src/components/tasks/TaskDetailPanel.tsx
// Full task detail panel — status, comments, attachments.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, tasksAPI } from '@/services/api';
import { format } from 'date-fns';
import type { Task, Comment } from '@/types';
import { normalizeComment, normalizeTask } from '@/normalize';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  todo:        { label: 'To do',       color: 'text-gray-400' },
  in_progress: { label: 'In progress', color: 'text-blue-400' },
  in_review:   { label: 'In review',   color: 'text-amber-400' },
  done:        { label: 'Done',        color: 'text-emerald-400' },
  cancelled:   { label: 'Cancelled',   color: 'text-red-400' },
};

interface Props {
  task: Task;
  projectId: string;
  onClose: () => void;
}

export default function TaskDetailPanel({ task, projectId, onClose }: Props) {
  const [commentText, setCommentText] = useState('');
  const qc = useQueryClient();

  // Fetch full task with comments
  const { data: fullTask } = useQuery<Task>({
    queryKey: ['task', projectId, task.id],
    queryFn: () => tasksAPI.get(projectId, task.id).then((r) => normalizeTask(r.data)),
    initialData: normalizeTask(task),
  });

  // Fetch comments
  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ['comments', task.id],
    queryFn: () =>
      api
        .get(`/projects/${projectId}/tasks/${task.id}/comments`)
        .then((r) => (r.data || []).map(normalizeComment)),
  });

  const updateTask = useMutation({
    mutationFn: (data: Partial<Task>) => tasksAPI.update(projectId, task.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      qc.invalidateQueries({ queryKey: ['task', projectId, task.id] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: () => tasksAPI.delete(projectId, task.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      qc.removeQueries({ queryKey: ['task', projectId, task.id] });
      onClose();
    },
  });

  const postComment = useMutation({
    mutationFn: (body: string) =>
      api.post(`/projects/${projectId}/tasks/${task.id}/comments`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', task.id] });
      setCommentText('');
    },
  });

  const current = fullTask || task;

  const safeFormat = (value: any, fmt: string) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return format(d, fmt);
  };

  return (
    <div className="w-96 flex-shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-800">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-1 font-mono">TASK-{task.id.slice(-6).toUpperCase()}</p>
          <h2 className="text-sm font-semibold text-white leading-snug">{current.title}</h2>
        </div>
        <button
          onClick={() => {
            if (deleteTask.isPending) return;
            const ok = window.confirm('Delete this task? This cannot be undone.');
            if (ok) deleteTask.mutate();
          }}
          className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors flex-shrink-0"
          title="Delete task"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0V5a2 2 0 012-2h2a2 2 0 012 2v2M4 7h16" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Status + Priority row */}
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-600 mb-1.5">Status</p>
            <select
              value={current.status}
              onChange={e => updateTask.mutate({ status: e.target.value as Task['status'] })}
              className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-600 mb-1.5">Priority</p>
            <select
              value={current.priority}
              onChange={e => updateTask.mutate({ priority: e.target.value as Task['priority'] })}
              className="w-full px-2.5 py-1.5 bg-gray-800 border border-gray-700 text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {['low','medium','high','critical'].map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Assignee */}
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1.5">Assignee</p>
          {current.assigneeName ? (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-medium">
                {current.assigneeName[0]}
              </div>
              <span className="text-sm text-white">{current.assigneeName}</span>
            </div>
          ) : (
            <span className="text-xs text-gray-600">Unassigned</span>
          )}
        </div>

        {/* Due date */}
        {current.dueDate && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5">Due date</p>
            <p className="text-sm text-white">{safeFormat(current.dueDate, 'MMM d, yyyy')}</p>
          </div>
        )}

        {/* Description */}
        {current.description && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5">Description</p>
            <p className="text-sm text-gray-300 leading-relaxed">{current.description}</p>
          </div>
        )}

        {/* Subtasks */}
        {current.subtasks && current.subtasks.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">
              Subtasks ({current.subtasks.filter(s => s.status === 'done').length}/{current.subtasks.length})
            </p>
            <div className="space-y-1.5">
              {current.subtasks.map(sub => (
                <div key={sub.id} className="flex items-center gap-2">
                  <div className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 ${sub.status === 'done' ? 'bg-emerald-500 border-emerald-500' : 'border-gray-600'}`} />
                  <span className={`text-xs ${sub.status === 'done' ? 'line-through text-gray-600' : 'text-gray-300'}`}>
                    {sub.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {current.tags?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {current.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded-full">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">
            Comments ({comments.length})
          </p>
          <div className="space-y-3">
            {comments.map(c => (
              <div key={c.id} className="flex gap-2.5">
                <div className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center text-white text-xs font-medium flex-shrink-0 mt-0.5">
                  {c.authorName?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-white">{c.authorName}</span>
                    <span className="text-xs text-gray-600">
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{c.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Comment input */}
          <div className="mt-3 flex gap-2">
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Write a comment…"
              rows={2}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && commentText.trim()) {
                  e.preventDefault();
                  postComment.mutate(commentText.trim());
                }
              }}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 text-white placeholder-gray-600 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />
            <button
              onClick={() => commentText.trim() && postComment.mutate(commentText.trim())}
              disabled={!commentText.trim() || postComment.isPending}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors self-end"
            >
              Post
            </button>
          </div>
        </div>

        {/* Metadata footer */}
        <div className="pt-2 border-t border-gray-800 space-y-1">
          <p className="text-xs text-gray-700">
            Created {safeFormat(current.createdAt, 'MMM d, yyyy')}
          </p>
          <p className="text-xs text-gray-700">
            Updated {safeFormat(current.updatedAt, 'MMM d, yyyy')}
          </p>
          {current.estimatedHrs && (
            <p className="text-xs text-gray-700">
              Estimate: {current.estimatedHrs}h
              {current.actualHrs ? ` · Actual: ${current.actualHrs}h` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDistanceToNow(date: Date, opts?: { addSuffix?: boolean }): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const str = mins < 1 ? 'just now' : mins < 60 ? `${mins}m` : hrs < 24 ? `${hrs}h` : `${days}d`;
  return opts?.addSuffix && str !== 'just now' ? `${str} ago` : str;
}
