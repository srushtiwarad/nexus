// nexus/frontend/src/types/index.ts
// Central type definitions for the Nexus frontend.

export type UserRole = 'user' | 'admin' | 'superadmin';
export type MemberRole = 'viewer' | 'member' | 'admin' | 'owner';
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type ProjectStatus = 'active' | 'archived' | 'deleted';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl?: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: string;
  myRole: MemberRole;
  memberCount: number;
  projectCount: number;
}

export interface ProjectMember {
  userId: string;
  role: MemberRole;
  name: string;
  email: string;
  avatar?: string;
}

export interface Project {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  color: string;
  startDate?: string;
  dueDate?: string;
  myRole: MemberRole;
  members?: ProjectMember[];
  openTasks?: number;
  doneTasks?: number;
  overdueTasks?: number;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
  taskStats?: Record<TaskStatus, { count: number; overdue: number }>;
}

export interface Task {
  id: string;
  projectId: string;
  parentId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  assigneeName?: string;
  assigneeAvatar?: string;
  reporterId: string;
  reporterName: string;
  dueDate?: string;
  estimatedHrs?: number;
  actualHrs?: number;
  position: number;
  tags: string[];
  subtasks?: Pick<Task, 'id' | 'title' | 'status'>[];
  subtaskCount?: number;
  commentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  body: string;
  editedAt?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}
