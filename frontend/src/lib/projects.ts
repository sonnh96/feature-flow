import { useEffect, useState, useCallback } from "react";
import { nanoid } from "nanoid";
import { create } from "zustand";
import type { Project } from "./types";
import { useAuth } from "./auth";
import { apiFetch } from "./api";

// Mock in-memory projects store. Auth is still backed by the real backend,
// but project data is shared/seeded for everyone (resets on reload).

const now = () => new Date().toISOString();

function buildSeed(): Project[] {
  const t = now();
  return [
    {
      id: "seed-auth",
      name: "Authentication Platform",
      description: "Email, OAuth, MFA and session management.",
      color: "violet",
      icon: "ShieldCheck",
      status: "active",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "seed-billing",
      name: "Billing & Subscriptions",
      description: "Plans, invoices, proration, and dunning flows.",
      color: "emerald",
      icon: "CreditCard",
      status: "active",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "seed-mobile",
      name: "Mobile App v2",
      description: "Cross-platform rewrite with offline-first sync.",
      color: "sky",
      icon: "Smartphone",
      status: "active",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "seed-internal",
      name: "Internal Admin Tools",
      description: "Ops dashboards, impersonation, audit log.",
      color: "amber",
      icon: "Wrench",
      status: "archived",
      createdAt: t,
      updatedAt: t,
    },
  ];
}

interface ProjectsStore {
  projects: Project[];
  reset: () => void;
  setAll: (items: ApiProject[]) => void;
  create: (data: { name: string; description?: string; color?: string; icon?: string }) => Project;
  update: (id: string, patch: Partial<Project>) => void;
  remove: (id: string) => void;
}

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
  created_at?: string | null;
  updated_at?: string | null;
}

export const useProjectsStore = create<ProjectsStore>((set) => ({
  projects: buildSeed(),
  reset: () => set({ projects: buildSeed() }),
  setAll: (items) =>
    set({
      projects: items.map((it) => ({
        id: it.id,
        externalRepoName: it.external_repo_name ?? it.externalRepoName ?? null,
        name: it.name,
        description: it.description_markdown || it.description || "",
        color: it.color || "violet",
        icon: it.icon || "Folder",
        status: it.status || "active",
        sourceType: it.source_type || it.sourceType || "manual",
        createdAt: it.created_at || new Date().toISOString(),
        updatedAt: it.updated_at || new Date().toISOString(),
      })),
    }),
  create: (data) => {
    const project: Project = {
      id: nanoid(8),
      externalRepoName: null,
      name: data.name,
      description: data.description ?? "",
      color: data.color ?? "violet",
      icon: data.icon ?? "Folder",
      status: "active",
      sourceType: "manual",
      createdAt: now(),
      updatedAt: now(),
    };
    set((s) => ({ projects: [project, ...s.projects] }));
    return project;
  },
  update: (id, patch) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now() } : p)),
    })),
  remove: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
}));

export function useProjects() {
  const { user, loading: authLoading } = useAuth();
  const projects = useProjectsStore((s) => s.projects);
  const createInStore = useProjectsStore((s) => s.create);
  const updateInStore = useProjectsStore((s) => s.update);
  const removeInStore = useProjectsStore((s) => s.remove);
  const setProjects = useProjectsStore((s) => s.setAll);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) setLoading(false);
  }, [authLoading]);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch("/api/v1/projects/");
      if (data && Array.isArray(data)) {
        // overwrite store with fetched projects
        if (setProjects) setProjects(data);
      }
    } catch (e) {
      // ignore, keep local seed
      console.error("Failed to fetch projects", e);
    }
  }, [setProjects]);

  const createProject = async (data: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
  }) => {
    if (!user) throw new Error("Not authenticated");
    // create on backend
    try {
      const created = await apiFetch("/api/v1/projects/", {
        method: "POST",
        body: JSON.stringify({ name: data.name, description_markdown: data.description }),
      });
      if (setProjects) setProjects([created, ...projects]);
      return created;
    } catch (e) {
      return createInStore(data);
    }
  };

  const updateProject = async (id: string, patch: Partial<Project>) => {
    updateInStore(id, patch);
  };

  const deleteProject = async (id: string) => {
    removeInStore(id);
  };

  return {
    projects: user ? projects : [],
    loading,
    error: null as string | null,
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
