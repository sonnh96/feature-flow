Act as a Senior Business Analyst, Product Owner, and UX Analyst.

I want to build a web-based application for managing projects and their associated features (similar to a requirement management / feature documentation system). Please analyze the requirements and generate a comprehensive, well-structured product specification document that can be used by UI/UX Designers, Developers, and QA teams.

---

## 1. Product Context

The system is a web application used to manage Projects and Features within each Project.

---

## 2. Core Objectives

The system must support the following:

- Manage multiple projects
- Each project contains multiple features
- A feature can be hierarchical (a parent feature can contain multiple child features)
- Users can view detailed information for each feature
- Features can be linked to other related features
- Track and display the change history of each feature
- Provide global search across features (within a project or across all accessible projects)
- Serve as a centralized system for managing requirements, features, and documentation

---

## 3. User Roles

Define and describe permissions for the following roles:

1. Admin
2. Project Manager / Product Owner
3. Business Analyst / Developer / Tester
4. Viewer / Stakeholder

For each role, clearly define permissions across:
- Project management
- Feature management
- Related features
- Feature history
- Global search
- User and role management

---

## 4. Data Model (Logical Level)

Design a logical data model for the following entities:

- Project
- Feature
- FeatureRelation
- FeatureHistory
- User
- ProjectMember
- Attachment
- Tag

For each entity, provide:
- Purpose
- Field list
- Suggested data types
- Required vs optional fields
- Business meaning

---

## 5. Feature Structure

The system must support hierarchical features:
- Parent features
- Child features (sub-features)

Each feature should include at least:
- ID
- Feature code
- Name
- Short description
- Detailed description
- Project reference
- Parent feature
- Feature type (e.g., Epic, Feature, Sub-feature)
- Status
- Priority
- Assignee
- Tags
- Acceptance criteria
- Business rules
- Attachments
- Created date/by
- Updated date/by
- Current version

---

## 6. Related Features

Features can be linked using relationships such as:
- relates_to
- depends_on
- blocks
- duplicate_of
- references

Describe:
- Business purpose
- Data rules
- UI representation
- How users create/update/delete relationships

---

## 7. Feature History (Audit Log)

The system must track changes, including:
- Who made the change
- When it was made
- Which field changed
- Old value
- New value
- Change comment

Describe:
- Audit logging mechanism
- Types of events to track
- UI for displaying history
- Filtering options
- Version comparison (if applicable)

---

## 8. Global Search

The system must provide global feature search.

Describe:
- Scope of search (project-level vs system-wide)
- Indexed fields
- Advanced filters
- Result display structure
- Empty state handling
- UX recommendations for fast and efficient search

---

## 9. Expected Output Structure

Generate a complete document with the following sections:

---

### 1. Product Overview
- Objectives
- Problems being solved
- Business value

---

### 2. Scope
- In-scope features
- Out-of-scope items
- Assumptions

---

### 3. User Roles and Permissions
- Role-based permission matrix

---

### 4. Functional Requirements

Organize requirements into modules:
- Authentication
- Dashboard
- Project Management
- Project Detail
- Feature List
- Feature Hierarchy Tree
- Feature Detail
- Create/Edit Feature
- Related Features
- Feature History
- Global Search
- User & Role Management

Each requirement must follow this format:
- Requirement ID
- Name
- Description
- Actor
- Preconditions
- Main flow
- Alternative flow
- Validation rules
- Success criteria
- Priority

---

### 5. Screen Analysis

For each screen, provide:

- Screen name
- Purpose
- Target users
- UI components
- Field list
- Actions (buttons, interactions)
- Navigation (entry/exit points)
- Business rules
- Validation messages
- Error states
- Empty states
- Loading states
- Permission-based behavior

Screens to include:
1. Login
2. Dashboard
3. Project List
4. Project Detail
5. Feature List (within Project)
6. Feature Hierarchy Tree
7. Create Feature
8. Edit Feature
9. Feature Detail
10. Related Features Management
11. Feature History
12. Global Search Results
13. User Management
14. Role/Permission Management

---

### 6. Business Rules

Define detailed business rules, such as:
- Feature code must be unique within a project
- A child feature can only belong to one parent
- No circular parent-child relationships allowed
- Cannot delete a parent feature if it has children (unless handled properly)
- All feature changes must be logged
- Users can only access projects they are assigned to
- Search results must respect user permissions

---

### 7. Non-functional Requirements

Include:
- Performance
- Security
- Auditability
- Scalability
- Usability
- Responsiveness
- Logging

---

### 8. Suggested Database Schema

Provide a conceptual or logical schema for main tables.

---

### 9. API Design Suggestions

List key REST APIs:
- Method
- Endpoint
- Purpose
- Sample request
- Sample response

---

### 10. User Stories

Write user stories in this format:
- As a [role]
- I want [goal]
- So that [benefit]

Include acceptance criteria.

---

### 11. Test Scenarios / UAT

List key UAT scenarios for major features.

---

### 12. UX Recommendations

Provide UX suggestions for:
- Feature hierarchy visualization
- Related features display
- Feature history UI
- Global search experience
- Navigation between projects and features

---

## 10. Response Requirements

- Write in clear, professional English
- Use structured formatting with headings and tables where appropriate
- Be detailed and implementation-ready
- Avoid vague descriptions
- Make reasonable assumptions if needed instead of leaving gaps

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **feature-flow** (1059 symbols, 1475 relationships, 16 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/feature-flow/context` | Codebase overview, check index freshness |
| `gitnexus://repo/feature-flow/clusters` | All functional areas |
| `gitnexus://repo/feature-flow/processes` | All execution flows |
| `gitnexus://repo/feature-flow/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
