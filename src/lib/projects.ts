import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Project, ProjectStatus } from "./types";
import { useAuth } from "./auth";

type Row = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  status: string;
  created_at: string;
  updated_at: string;
};

const fromRow = (r: Row): Project => ({
  id: r.id,
  name: r.name,
  description: r.description,
  color: r.color,
  icon: r.icon,
  status: (r.status as ProjectStatus) ?? "active",
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function useProjects() {
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) setError(error.message);
    else setProjects((data as Row[]).map(fromRow));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) refresh();
  }, [authLoading, refresh]);

  const createProject = async (data: { name: string; description?: string; color?: string; icon?: string }) => {
    if (!user) throw new Error("Not authenticated");
    const { data: row, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name: data.name,
        description: data.description ?? "",
        color: data.color ?? "violet",
        icon: data.icon ?? "Folder",
      })
      .select("*")
      .single();
    if (error) throw error;
    const project = fromRow(row as Row);
    setProjects((p) => [project, ...p]);
    return project;
  };

  const updateProject = async (id: string, patch: Partial<Pick<Project, "name" | "description" | "color" | "icon" | "status">>) => {
    const { data: row, error } = await supabase
      .from("projects")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    const updated = fromRow(row as Row);
    setProjects((p) => p.map((x) => (x.id === id ? updated : x)));
  };

  const deleteProject = async (id: string) => {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
    setProjects((p) => p.filter((x) => x.id !== id));
  };

  return { projects, loading, error, refresh, createProject, updateProject, deleteProject };
}

export function useProject(id: string | undefined) {
  const { projects, loading } = useProjects();
  return { project: projects.find((p) => p.id === id), loading };
}
