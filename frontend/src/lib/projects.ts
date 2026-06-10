import { useEffect, useState, useCallback } from "react";
import { create } from "zustand";
import type { Project } from "./types";
import { useAuth } from "./auth";
import { apiFetch } from "./api";

// API-backed projects store. All project data is persisted to the FastAPI
// backend; the zustand state is just a client-side cache.

const now = () => new Date().toISOString();

interface ApiProject {
  id: string;
  external_repo_name?: string | null;
  externalRepoName?: string | null;
  name: string;
  description_markdown?: string | null;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  status?: Project["status"];
  source_type?: string | null;
  sourceType?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

function mapApiProject(it: ApiProject): Project {
  const meta = (it.metadata ?? {}) as { color?: string; icon?: string };
  return {
    id: it.id,
    externalRepoName: it.external_repo_name ?? it.externalRepoName ?? null,
    name: it.name,
    description: it.description_markdown || it.description || "",
    color: it.color || meta.color || "violet",
    icon: it.icon || meta.icon || "Folder",
    status: it.status || "active",
    sourceType: it.source_type || it.sourceType || "manual",
    createdAt: it.created_at || now(),
    updatedAt: it.updated_at || now(),
  };
}

interface ProjectsStore {
  projects: Project[];
  setAll: (items: ApiProject[]) => void;
  upsert: (project: Project) => void;
  patch: (id: string, patch: Partial<Project>) => void;
  remove: (id: string) => void;
}

export const useProjectsStore = create<ProjectsStore>((set) => ({
  projects: [],
  setAll: (items) => set({ projects: items.map(mapApiProject) }),
  upsert: (project) =>
    set((s) => ({ projects: [project, ...s.projects.filter((p) => p.id !== project.id)] })),
  patch: (id, patch) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now() } : p)),
    })),
  remove: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
}));

export function useProjects() {
  const { user, loading: authLoading } = useAuth();
  const projects = useProjectsStore((s) => s.projects);
  const setAll = useProjectsStore((s) => s.setAll);
  const upsert = useProjectsStore((s) => s.upsert);
  const patchInStore = useProjectsStore((s) => s.patch);
  const removeInStore = useProjectsStore((s) => s.remove);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch("/api/v1/projects/");
      if (Array.isArray(data)) setAll(data);
      setError(null);
    } catch (e) {
      console.error("Failed to fetch projects", e);
      setError(e instanceof Error ? e.message : "Failed to load projects");
    }
  }, [setAll]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [authLoading, user, refresh]);

  const createProject = async (data: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
  }) => {
    if (!user) throw new Error("Not authenticated");
    const created = await apiFetch("/api/v1/projects/", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        description_markdown: data.description,
        metadata: { color: data.color, icon: data.icon },
      }),
    });
    const project = mapApiProject(created);
    upsert(project);
    return project;
  };

  const updateProject = async (id: string, patch: Partial<Project>) => {
    patchInStore(id, patch); // optimistic
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.description !== undefined) body.description_markdown = patch.description;
    if (patch.status !== undefined) body.status = patch.status;
    if (Object.keys(body).length === 0) return;
    try {
      const updated = await apiFetch(`/api/v1/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      upsert(mapApiProject(updated));
    } catch (e) {
      console.error("Failed to update project", e);
      await refresh();
    }
  };

  const deleteProject = async (id: string) => {
    removeInStore(id); // optimistic
    try {
      await apiFetch(`/api/v1/projects/${id}`, { method: "DELETE" });
    } catch (e) {
      console.error("Failed to delete project", e);
      await refresh();
    }
  };

  return {
    projects: user ? projects : [],
    loading,
    error,
    refresh,
    createProject,
    updateProject,
    deleteProject,
  };
}

export function useProject(id: string | undefined) {
  const { projects, loading } = useProjects();
  return { project: projects.find((p) => p.id === id), loading };
}
