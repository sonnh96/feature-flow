import { useState } from "react";
import { useStore } from "@/lib/store";
import { X } from "lucide-react";

const COLORS = ["violet", "emerald", "amber", "rose", "sky", "indigo"];
const ICONS = ["Folder", "Shield", "CreditCard", "Smartphone", "Cpu", "Rocket"];

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const createProject = useStore((s) => s.createProject);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("violet");
  const [icon, setIcon] = useState("Folder");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createProject({ name: name.trim(), description, color, icon });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-border bg-popover p-6 shadow-[var(--shadow-elevated)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Project</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Project name <span className="text-destructive">*</span>
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Onboarding Flow"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <div className="mb-4">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Color</span>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-md border-2 transition-transform ${color === c ? "scale-110 border-foreground" : "border-transparent"}`}
                style={{ background: `var(--primary)`, opacity: c === color ? 1 : 0.4 }}
              />
            ))}
          </div>
        </div>

        <div className="mb-6">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Icon</span>
          <div className="flex flex-wrap gap-2">
            {ICONS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                className={`rounded-md border px-2.5 py-1 text-xs ${icon === i ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Create Project
          </button>
        </div>
      </form>
    </div>
  );
}
