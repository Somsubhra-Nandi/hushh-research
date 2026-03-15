"use client";

import { getSessionItem, setSessionItem } from "@/lib/utils/session-storage";

const APP_BACKGROUND_TASKS_KEY = "kai_app_background_tasks_v1";

export type AppBackgroundTaskStatus = "running" | "completed" | "failed" | "canceled";
export type AppBackgroundTaskMetadata = Record<string, unknown>;

export interface AppBackgroundTask {
  taskId: string;
  userId: string;
  kind: string;
  title: string;
  description: string;
  status: AppBackgroundTaskStatus;
  routeHref: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  dismissedAt: string | null;
  metadata: AppBackgroundTaskMetadata | null;
}

interface PersistedAppBackgroundTaskState {
  version: 1;
  tasks: AppBackgroundTask[];
}

export interface AppBackgroundTaskState {
  tasks: AppBackgroundTask[];
}

type Listener = (state: AppBackgroundTaskState) => void;

function nowIso(): string {
  return new Date().toISOString();
}

function createTaskId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

class AppBackgroundTaskManager {
  private tasks = new Map<string, AppBackgroundTask>();
  private listeners = new Set<Listener>();

  constructor() {
    this.hydrate();
  }

  private hydrate(): void {
    const raw = getSessionItem(APP_BACKGROUND_TASKS_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Partial<PersistedAppBackgroundTaskState>;
      if (parsed.version !== 1 || !Array.isArray(parsed.tasks)) return;

      for (const task of parsed.tasks) {
        if (!task || typeof task !== "object") continue;
        if (!task.taskId || !task.userId || !task.kind) continue;
        this.tasks.set(task.taskId, {
          ...task,
          status:
            task.status === "completed" ||
            task.status === "failed" ||
            task.status === "canceled"
              ? task.status
              : "running",
          routeHref: task.routeHref || null,
          completedAt: task.completedAt || null,
          error: task.error || null,
          dismissedAt: task.dismissedAt || null,
          metadata:
            task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
              ? (task.metadata as AppBackgroundTaskMetadata)
              : null,
        });
      }
    } catch {
      // Ignore malformed cache
    }
  }

  private persist(): void {
    const payload: PersistedAppBackgroundTaskState = {
      version: 1,
      tasks: Array.from(this.tasks.values()),
    };
    setSessionItem(APP_BACKGROUND_TASKS_KEY, JSON.stringify(payload));
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private upsert(task: AppBackgroundTask): AppBackgroundTask {
    const existing = this.tasks.get(task.taskId);
    const merged: AppBackgroundTask = {
      ...existing,
      ...task,
      updatedAt: nowIso(),
    };
    this.tasks.set(merged.taskId, merged);
    this.persist();
    this.emit();
    return merged;
  }

  getState(): AppBackgroundTaskState {
    const tasks = Array.from(this.tasks.values()).sort((a, b) => {
      const aTs = Date.parse(a.updatedAt);
      const bTs = Date.parse(b.updatedAt);
      return bTs - aTs;
    });
    return { tasks };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  startTask(params: {
    userId: string;
    kind: string;
    title: string;
    description: string;
    routeHref?: string;
    taskId?: string;
    metadata?: AppBackgroundTaskMetadata | null;
  }): string {
    const taskId = params.taskId || createTaskId(params.kind || "task");
    const startedAt = nowIso();
    this.upsert({
      taskId,
      userId: params.userId,
      kind: params.kind,
      title: params.title,
      description: params.description,
      status: "running",
      routeHref: params.routeHref || null,
      startedAt,
      updatedAt: startedAt,
      completedAt: null,
      error: null,
      dismissedAt: null,
      metadata:
        params.metadata && typeof params.metadata === "object" && !Array.isArray(params.metadata)
          ? params.metadata
          : null,
    });
    return taskId;
  }

  completeTask(taskId: string, description?: string): void {
    const existing = this.tasks.get(taskId);
    if (!existing) return;
    this.upsert({
      ...existing,
      status: "completed",
      description: description ?? existing.description,
      completedAt: nowIso(),
      error: null,
    });
  }

  failTask(taskId: string, error: string, description?: string): void {
    const existing = this.tasks.get(taskId);
    if (!existing) return;
    this.upsert({
      ...existing,
      status: "failed",
      description: description ?? existing.description,
      completedAt: nowIso(),
      error: error || "Task failed",
    });
  }

  cancelTask(taskId: string, description?: string): void {
    const existing = this.tasks.get(taskId);
    if (!existing) return;
    this.upsert({
      ...existing,
      status: "canceled",
      description: description ?? existing.description,
      completedAt: nowIso(),
      error: null,
    });
  }

  updateTask(
    taskId: string,
    updates: {
      title?: string;
      description?: string;
      routeHref?: string | null;
      metadata?: AppBackgroundTaskMetadata | null;
    }
  ): void {
    const existing = this.tasks.get(taskId);
    if (!existing) return;
    this.upsert({
      ...existing,
      title:
        typeof updates.title === "string" && updates.title.trim().length > 0
          ? updates.title
          : existing.title,
      description:
        typeof updates.description === "string" && updates.description.trim().length > 0
          ? updates.description
          : existing.description,
      routeHref:
        updates.routeHref === undefined
          ? existing.routeHref
          : updates.routeHref,
      metadata:
        updates.metadata === undefined
          ? existing.metadata
          : updates.metadata && typeof updates.metadata === "object" && !Array.isArray(updates.metadata)
            ? updates.metadata
            : null,
    });
  }

  dismissTask(taskId: string): void {
    const existing = this.tasks.get(taskId);
    if (!existing) return;
    this.upsert({
      ...existing,
      dismissedAt: nowIso(),
    });
  }

  hasRunningTask(userId: string, kind?: string): boolean {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return false;
    const normalizedKind = typeof kind === "string" && kind.trim().length > 0
      ? kind.trim()
      : null;
    for (const task of this.tasks.values()) {
      if (task.userId !== normalizedUserId) continue;
      if (task.status !== "running") continue;
      if (task.dismissedAt) continue;
      if (normalizedKind && task.kind !== normalizedKind) continue;
      return true;
    }
    return false;
  }

  getTask(taskId: string): AppBackgroundTask | null {
    return this.tasks.get(taskId) ?? null;
  }
}

export const AppBackgroundTaskService = new AppBackgroundTaskManager();
