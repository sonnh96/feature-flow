export type Status = "todo" | "in_progress" | "done" | "deprecated";
export type Priority = "low" | "medium" | "high" | "critical";
export type ProjectStatus = "active" | "archived";
export type RelationType = "depends_on" | "blocks" | "related_to" | "duplicates";

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
  done: boolean;
}

export interface Feature {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  description: string;
  status: Status;
  priority: Priority;
  assignee: string | null;
  tags: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
  order: number;
}

export interface Relation {
  id: string;
  fromId: string;
  toId: string;
  type: RelationType;
}

export interface HistoryEntry {
  id: string;
  featureId: string;
  user: string;
  timestamp: string;
  action: string;
  before?: string;
  after?: string;
}

export interface FeatureNode extends Feature {
  children: FeatureNode[];
}
