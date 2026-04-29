export type Status = "todo" | "in_progress" | "done" | "deprecated";
export type Priority = "low" | "medium" | "high" | "critical";
export type ProjectStatus = "active" | "archived";
export type FeatureType = "epic" | "feature" | "sub_feature";
export type ReviewStatus =
  | "draft"
  | "needs_review"
  | "approved"
  | "rejected"
  | "archived"
  | "stale";
export type RelationType =
  | "depends_on"
  | "blocks"
  | "related_to"
  | "relates_to"
  | "duplicates"
  | "duplicate_of"
  | "references";

export interface Project {
  id: string;
  externalRepoName?: string | null;
  name: string;
  description: string;
  color: string;
  icon: string;
  status: ProjectStatus;
  sourceType?: "manual" | "gitnexus" | string;
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
  featureCode: string;
  code?: string;
  name: string;
  description: string;
  shortDescription?: string;
  longDescription?: string;
  featureType: FeatureType;
  status: Status;
  reviewStatus: ReviewStatus;
  priority: Priority;
  assignee: string | null;
  tags: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  businessRules: string;
  confidenceScore: number;
  currentVersion: number;
  generatedBy: string | null;
  approvedBy: string | null;
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
  userId?: string;
  timestamp: string;
  action: string;
  eventType?: string;
  fieldName?: string;
  before?: string;
  after?: string;
  oldValue?: string | null;
  newValue?: string | null;
  comment?: string | null;
}

export interface FeatureNode extends Feature {
  children: FeatureNode[];
}

export interface FeatureEvidence {
  id: string;
  featureId: string;
  evidenceType: string;
  sourceRef: string;
  sourceLabel: string | null;
  confidence: number;
  notes: string | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ReviewTask {
  id: string;
  featureId: string;
  issueType: string;
  status: "open" | "resolved" | "dismissed";
  reviewer: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}
