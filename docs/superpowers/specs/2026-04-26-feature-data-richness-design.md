# Feature Data Richness — Design Spec
**Date:** 2026-04-26  
**Phase:** A — Feature Data Richness  
**Scope:** Expand the Feature model (frontend + backend) with all fields required by the AGENTS.md spec. Keep Zustand as the in-memory cache layer; align its shape with the backend so Phase B (live wiring) is a straight swap.

---

## 1. Goals

- Add all missing Feature fields from the spec: feature code, auto-derived type, business rules, richer acceptance criteria, version counter.
- Upgrade FeatureHistory from simple action strings to field-level diffs (who changed what field, old→new value).
- Add FeatureRelation to the backend (already exists in frontend Zustand store).
- Add Alembic migration for all new backend columns/tables.
- Update all UI components (FeatureDetail, FeatureTree, store) to display and edit the new fields.

---

## 2. Out of Scope (Phase B+)

- Real user picker for assignee (free-text for now)
- Project member roles and permission-based UI
- Live API wiring (Zustand stays as the data layer)
- Global search changes
- Attachment uploads

---

## 3. Data Model Changes

### 3.1 Feature — New / Changed Fields

| Field | Frontend type | Backend column | Notes |
|---|---|---|---|
| `featureCode` | `string` | `feature_code VARCHAR` | Auto-generated `[PREFIX]-NNN`, unique per project |
| `featureType` | `"epic" \| "feature" \| "sub_feature"` | **computed, not stored** | Derived from hierarchy depth on read |
| `businessRules` | `string` | `business_rules TEXT` | Markdown, separate from description |
| `targetDate` | `string \| null` | `target_date DATE` | Already in frontend types; add to backend |
| `acceptanceCriteria` | `{id,text,done}[]` | `acceptance_criteria JSONB` | Already in frontend; add to backend |
| `version` | `number` | `version INTEGER DEFAULT 1` | Increments on every save |
| `assignee` | `string \| null` | `assignee VARCHAR` | Already in frontend; add to backend |
| `priority` | existing | `priority VARCHAR` | Already in both; no change |
| `tags` | existing | `tags VARCHAR[]` | Already in both; no change |

**Feature code generation rule:**
- Prefix = first 3–5 uppercase letters of the project name (e.g. "Authentication Platform" → `AUTH`)
- Sequence = zero-padded 3-digit counter of root-level features in the project (e.g. `AUTH-001`, `AUTH-002`)
- Child features inherit the parent's prefix but get their own sequence: `AUTH-001-01`
- Generated at creation time in the store's `createFeature` action; stored and never regenerated.

**Feature type derivation:**
```
depth 0 (no parentId)           → "Epic"
depth 1 (parentId, no grandparent) → "Feature"  
depth 2+                         → "Sub-feature"
```
Computed in a pure helper `getFeatureType(featureId, features): string`. Never stored.

### 3.2 FeatureHistory — Upgraded Schema

Replace the current `action: string` flat log with field-level diff entries.

**Frontend type (`types.ts`):**
```ts
export interface HistoryEntry {
  id: string;
  featureId: string;
  userId: string;        // was: user (free text) — keep as string for now
  timestamp: string;
  fieldName: string;     // e.g. "status", "description", "name"
  oldValue: string | null;
  newValue: string | null;
  comment: string | null;
}
```

**Backend table (`feature_history`):**
```sql
id            UUID PRIMARY KEY
feature_id    UUID REFERENCES features(id) ON DELETE CASCADE
user_id       VARCHAR NOT NULL
timestamp     TIMESTAMP DEFAULT NOW()
field_name    VARCHAR NOT NULL
old_value     TEXT
new_value     TEXT
comment       VARCHAR
```

**Fields tracked automatically on `updateFeature`:**
- `status` — old/new label string
- `name` — old/new name
- `description` — old/new markdown (truncated to 500 chars in display)
- `priority` — old/new label
- `assignee` — old/new value
- `businessRules` — "Updated business rules"
- `acceptanceCriteria` — "Updated acceptance criteria (N items)"
- `tags` — old/new comma-joined list
- `targetDate` — old/new date string

### 3.3 FeatureRelation — Backend Addition

Frontend Zustand already has this. Add backend table to match:

```sql
id              UUID PRIMARY KEY
from_feature_id UUID REFERENCES features(id) ON DELETE CASCADE
to_feature_id   UUID REFERENCES features(id) ON DELETE CASCADE
relation_type   VARCHAR NOT NULL  -- relates_to | depends_on | blocks | duplicate_of | references
UNIQUE(from_feature_id, to_feature_id, relation_type)
```

Frontend `RelationType` updated to add `"references"` (currently missing vs spec):
```ts
export type RelationType = "depends_on" | "blocks" | "related_to" | "duplicate_of" | "references";
```

---

## 4. Backend Changes

### 4.1 `app/db/models.py`

- Add columns to `Feature`: `feature_code`, `business_rules`, `target_date`, `acceptance_criteria`, `version`, `assignee`
- Add `FeatureHistory` model (new table)
- Add `FeatureRelation` model (new table)

### 4.2 `app/schemas.py`

- Extend `FeatureCreate` and `FeatureUpdate` with new fields
- Add `FeatureHistoryEntry` Pydantic schema
- Add `FeatureRelation` Pydantic schema

### 4.3 `app/api/v1/features.py`

- Return new fields in GET responses
- Accept new fields in POST/PATCH
- Add `DELETE /api/v1/features/{id}` endpoint (currently missing)
- Add `parent_id` filter to GET list

### 4.4 New Alembic Migration

File: `alembic/versions/XXXX_add_feature_richness.py`
- ALTER TABLE features: add 6 new columns
- CREATE TABLE feature_history
- CREATE TABLE feature_relations

---

## 5. Frontend Changes

### 5.1 `src/lib/types.ts`

- Add `featureCode`, `businessRules`, `version` to `Feature`
- Update `HistoryEntry` to field-level diff shape
- Add `"references"` to `RelationType`
- Add `FeatureType` derived type helper

### 5.2 `src/lib/store.ts`

- `createFeature`: auto-generate `featureCode` based on project prefix + sequence
- `updateFeature`: emit one `HistoryEntry` per changed field (not one per action)
- Add `getFeatureType(id): FeatureType` selector
- Seed data: populate `featureCode` and `businessRules` on existing seed features

### 5.3 `src/components/FeatureDetail.tsx`

**Header area additions:**
- Feature code badge (e.g. `AUTH-001`) — read-only, displayed next to title
- Feature type chip (Epic / Feature / Sub-feature) — derived, read-only, colored

**Description tab:**
- Existing markdown editor stays
- Add separate "Business Rules" section below description — collapsible, same markdown editor

**Sub-features tab:** no change

**Related tab:** 
- Add `"references"` as a relation type option
- Rename `"related_to"` display label to "Relates to" (already correct in labelRelation)
- Rename `"duplicates"` to "Duplicate of" to match spec

**History tab — upgraded UI:**
- Each entry shows: avatar/initials + timestamp + field name badge + old→new diff
- For description/businessRules changes: show collapsible before/after markdown blocks
- For short fields (status, priority, name): inline `"Todo → In Progress"` pill display
- Filter bar: filter by field name (All / Status / Description / etc.)

**Metadata sidebar (right panel or below header):**
- Add `Target Date` date picker (already in types, not in UI)
- Add `Version` display (read-only counter badge)
- Move Assignee, Priority, Status, Tags into a clean 2-column metadata grid

### 5.4 `src/components/FeatureTree.tsx`

- Show feature type icon prefix: 🟣 Epic / 🔵 Feature / ⚪ Sub-feature (or colored dots)
- Show feature code as secondary label

---

## 6. Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Feature type storage | Computed from depth, not stored | Avoids type/hierarchy drift; tree is single source of truth |
| Feature code format | `[PREFIX]-[NNN]` for roots, `[PREFIX]-[NNN]-[NN]` for children | Human-readable, sortable, unique per project |
| History granularity | One entry per field per save | Enables field-level filtering; matches spec requirement |
| Zustand shape alignment | Match backend schema exactly | Zero-cost swap to API calls in Phase B |
| Alembic migration | Single migration for all new columns | Simpler; all richness fields land together |

---

## 7. File Change Summary

| File | Change type |
|---|---|
| `frontend/src/lib/types.ts` | Extend Feature, update HistoryEntry, add RelationType value |
| `frontend/src/lib/store.ts` | Feature code gen, per-field history, getFeatureType selector, seed updates |
| `frontend/src/components/FeatureDetail.tsx` | Feature code badge, type chip, business rules section, upgraded history tab, metadata grid |
| `frontend/src/components/FeatureTree.tsx` | Type icon + code label |
| `backend/app/db/models.py` | Add columns to Feature, add FeatureHistory + FeatureRelation models |
| `backend/app/schemas.py` | Extend schemas, add new schemas |
| `backend/app/api/v1/features.py` | Return/accept new fields, add DELETE endpoint |
| `backend/alembic/versions/XXXX_add_feature_richness.py` | New migration |

---

## 8. Success Criteria

- [ ] Every feature displays a unique auto-generated code (e.g. `AUTH-001`)
- [ ] Feature type (Epic/Feature/Sub-feature) is shown in tree and detail view, derived from depth
- [ ] Business Rules field is editable and persists in Zustand (+ backend column exists)
- [ ] History tab shows field-level diffs with old→new values per changed field
- [ ] History tab has a field-name filter
- [ ] `"references"` relation type works in the Related tab
- [ ] `target_date`, `assignee`, `acceptance_criteria`, `version` all appear in the backend schema
- [ ] Alembic migration runs cleanly on a fresh DB
- [ ] All seed data has realistic feature codes and business rules populated
