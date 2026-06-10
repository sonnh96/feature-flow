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

export type LinkType =
  | "reference"
  | "design"
  | "document"
  | "api"
  | "issue"
  | "pr"
  | "dashboard"
  | "other";

export interface FeatureLink {
  id: string;
  label: string;
  url: string;
  type: LinkType;
}

export interface FeatureAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
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
  links?: FeatureLink[];
  attachments?: FeatureAttachment[];
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

export interface ApiFeature {
  id: string;
  project_id?: string;
  projectId?: string;
  parent_id?: string | null;
  parentId?: string | null;
  feature_code?: string | null;
  featureCode?: string | null;
  code?: string | null;
  name: string;
  description?: string | null;
  short_description?: string | null;
  shortDescription?: string | null;
  long_description?: string | null;
  longDescription?: string | null;
  markdown_content?: string | null;
  markdownContent?: string | null;
  feature_type?: FeatureType;
  featureType?: FeatureType;
  status?: Status;
  review_status?: ReviewStatus;
  reviewStatus?: ReviewStatus;
  priority?: Priority | null;
  assignee?: string | null;
  tags?: string[];
  acceptance_criteria?: AcceptanceCriterion[];
  acceptanceCriteria?: AcceptanceCriterion[];
  business_rules?: string | Array<Record<string, unknown>> | null;
  businessRules?: string | Array<Record<string, unknown>> | null;
  confidence_score?: number;
  confidenceScore?: number;
  current_version?: number;
  currentVersion?: number;
  generated_by?: string | null;
  generatedBy?: string | null;
  approved_by?: string | null;
  approvedBy?: string | null;
  target_date?: string | null;
  targetDate?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  position?: number | null;
  order?: number | null;
  metadata?: Record<string, unknown> | null;
  score?: number;
  matched_fields?: string[];
}

export interface FeatureImportResponse {
  project_id: string;
  total_documents: number;
  created_count: number;
  skipped_count: number;
  created: ApiFeature[];
  skipped: Array<{ path: string; reason: string }>;
}
