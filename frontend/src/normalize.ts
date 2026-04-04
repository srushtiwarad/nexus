import type { Task, Comment } from '@/types';

function parseMaybeJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export function normalizeTask(t: any): Task {
  return {
    id: t.id,
    projectId: t.projectId ?? t.project_id,
    parentId: t.parentId ?? t.parent_id ?? undefined,
    title: t.title,
    description: t.description ?? undefined,
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeId ?? t.assignee_id ?? undefined,
    assigneeName: t.assigneeName ?? t.assignee_name ?? undefined,
    assigneeAvatar: t.assigneeAvatar ?? t.assignee_avatar ?? undefined,
    reporterId: t.reporterId ?? t.reporter_id ?? '',
    reporterName: t.reporterName ?? t.reporter_name ?? '',
    dueDate: t.dueDate ?? t.due_date ?? undefined,
    estimatedHrs: t.estimatedHrs ?? t.estimated_hrs ?? undefined,
    actualHrs: t.actualHrs ?? t.actual_hrs ?? undefined,
    position: t.position ?? 0,
    tags: parseMaybeJsonArray(t.tags),
    subtasks: t.subtasks ?? undefined,
    subtaskCount: t.subtaskCount ?? t.subtask_count ?? undefined,
    commentCount: t.commentCount ?? t.comment_count ?? undefined,
    createdAt: t.createdAt ?? t.created_at,
    updatedAt: t.updatedAt ?? t.updated_at ?? t.createdAt ?? t.created_at,
  };
}

export function normalizeComment(c: any): Comment {
  return {
    id: c.id,
    taskId: c.taskId ?? c.task_id,
    authorId: c.authorId ?? c.author_id,
    authorName: c.authorName ?? c.author_name,
    authorAvatar: c.authorAvatar ?? c.author_avatar ?? undefined,
    body: c.body,
    editedAt: c.editedAt ?? c.edited_at ?? undefined,
    createdAt: c.createdAt ?? c.created_at,
  };
}

