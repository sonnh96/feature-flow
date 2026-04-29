# Remove Supabase & Lovable — Migrate to Backend API

**Date:** 2026-04-26
**Approach:** Backend-First, Then Frontend Swap

## Goal

Remove all Supabase and Lovable dependencies from the frontend. Replace with direct API calls to the FastAPI backend. After this migration:

- Authentication is handled by the backend via JWT (email+password)
- Authorization follows RBAC (Role-Based Access Control) with roles, permissions, and user-role assignments
- All data operations go through the backend REST API
- Image uploads go to local file storage via a backend endpoint
- No Supabase SDK, Supabase types, or Lovable packages remain in the frontend

## Current State

### Frontend Supabase/Lovable usage (12 files)

| File | Usage |
|------|-------|
| `src/integrations/supabase/client.ts` | Supabase browser client (anon key) |
| `src/integrations/supabase/client.server.ts` | Supabase admin client (service role key) |
| `src/integrations/supabase/auth-middleware.ts` | TanStack Start middleware: validates Supabase JWT |
| `src/integrations/supabase/types.ts` | Generated Supabase DB types |
| `src/integrations/lovable/index.ts` | Lovable OAuth wrapper (Google sign-in via Supabase) |
| `src/lib/auth.tsx` | AuthProvider: Supabase `onAuthStateChange`, `getSession`, `signOut`, role fetching from `user_roles` table |
| `src/lib/api.ts` | `apiFetch` helper: reads Supabase access token, forwards as Bearer header |
| `src/routes/auth.tsx` | Login/signup page: `supabase.auth.signInWithPassword`, `signUp`, Lovable Google OAuth |
| `src/routes/index.tsx` | Route guard: `supabase.auth.getSession()` in `beforeLoad` |
| `src/routes/projects.$projectId.tsx` | Route guard: `supabase.auth.getSession()` in `beforeLoad` |
| `src/routes/projects.$projectId.features.$featureId.tsx` | Route guard: `supabase.auth.getSession()` in `beforeLoad` |
| `src/components/MarkdownEditor.tsx` | Image upload via `supabase.storage.from("feature-images").upload(...)` |

### Frontend packages to remove

- `@supabase/supabase-js` (dependency)
- `@lovable.dev/cloud-auth-js` (dependency)
- `@lovable.dev/vite-tanstack-config` (devDependency)

### Backend current state

- FastAPI + SQLAlchemy async + PostgreSQL
- Endpoints: projects CRUD, features CRUD, versions CRUD
- No auth endpoints, no JWT generation, no user model
- `security.py` has `verify_supabase_token()` — calls Supabase to validate tokens (to be replaced)
- No auth middleware applied to any route
- No image upload endpoint

### Environment variables to remove from frontend `.env`

- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`

Keep: `VITE_API_URL`

## Phase 1: Backend — Auth System

### 1.1 New dependencies

Add to `requirements.txt`:
- `python-jose[cryptography]` — JWT encode/decode
- `passlib[bcrypt]` — password hashing
- `python-multipart` — file upload support

### 1.2 Config updates

Update `app/core/config.py` Settings:
- `secret_key: str` — JWT signing key (default: random, must be set in production)
- `access_token_expire_minutes: int = 30`
- `refresh_token_expire_days: int = 7`
- Remove `supabase_url` and `supabase_service_role_key`

### 1.3 Database models — User + RBAC

Standard RBAC schema: Users → UserRoles → Roles → RolePermissions → Permissions.

Add to `app/db/models.py`:

```python
# ── Association tables ──

user_roles = sa.Table(
    "user_roles",
    Base.metadata,
    sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("created_at", sa.DateTime, default=datetime.utcnow),
)

role_permissions = sa.Table(
    "role_permissions",
    Base.metadata,
    sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    sa.Column("permission_id", UUID(as_uuid=True), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)

# ── Models ──

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    projects = relationship("Project", back_populates="owner")
    roles = relationship("Role", secondary=user_roles, back_populates="users", lazy="selectin")

class Role(Base):
    __tablename__ = "roles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False)          # e.g. "admin", "editor", "viewer"
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", secondary=user_roles, back_populates="roles")
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles", lazy="selectin")

class Permission(Base):
    __tablename__ = "permissions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resource = Column(String(50), nullable=False)                   # e.g. "project", "feature", "version", "upload"
    action = Column(String(50), nullable=False)                     # e.g. "create", "read", "update", "delete"
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (sa.UniqueConstraint("resource", "action", name="uq_permission_resource_action"),)
    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")
```

**Default roles and permissions (seeded in migration):**

| Role | Permissions |
|------|-------------|
| `admin` | All permissions on all resources (project.*, feature.*, version.*, upload.*, user.*, role.*) |
| `editor` | project.create, project.read, project.update, feature.*, version.*, upload.create |
| `viewer` | project.read, feature.read, version.read |

**First registered user gets the `admin` role.** Subsequent users get the `editor` role by default.

Add `user_id` FK to `Project` model:
```python
user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
owner = relationship("User", back_populates="projects")
```

### 1.4 RBAC authorization utilities

New file `app/core/rbac.py`:

```python
from fastapi import Depends, HTTPException, status

def require_permission(resource: str, action: str):
    """FastAPI dependency factory. Returns a dependency that checks
    whether the current user has the specified permission via any of their roles.

    Usage:
        @router.post("/", dependencies=[Depends(require_permission("project", "create"))])
    """
    async def checker(current_user: User = Depends(get_current_user)):
        user_permissions = set()
        for role in current_user.roles:
            for perm in role.permissions:
                user_permissions.add((perm.resource, perm.action))
        if (resource, action) not in user_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: requires {resource}.{action}",
            )
        return current_user
    return checker

def require_role(role_name: str):
    """Dependency that checks user has a specific role."""
    async def checker(current_user: User = Depends(get_current_user)):
        user_roles = {r.name for r in current_user.roles}
        if role_name not in user_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: requires role '{role_name}'",
            )
        return current_user
    return checker
```

### 1.5 Auth & RBAC schemas

Add to `app/schemas.py`:

```python
class UserRegister(BaseModel):
    email: str  # validated as email
    password: str  # min 6 chars

class UserLogin(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenRefresh(BaseModel):
    refresh_token: str

class PermissionResponse(BaseModel):
    id: UUID
    resource: str
    action: str
    class Config:
        orm_mode = True

class RoleResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    permissions: list[PermissionResponse] = []
    class Config:
        orm_mode = True

class UserResponse(BaseModel):
    id: UUID
    email: str
    is_active: bool
    created_at: datetime
    roles: list[RoleResponse] = []
    class Config:
        orm_mode = True

class RoleAssign(BaseModel):
    user_id: UUID
    role_name: str

class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None

class PermissionAssign(BaseModel):
    role_name: str
    resource: str
    action: str
```

### 1.6 Security module rewrite

Replace `app/core/security.py`:

- `hash_password(password: str) -> str` — bcrypt hash
- `verify_password(plain: str, hashed: str) -> bool` — bcrypt verify
- `create_access_token(user_id: str, email: str, roles: list[str]) -> str` — JWT with exp = 30 min. Payload includes `roles` claim for frontend use.
- `create_refresh_token(user_id: str) -> str` — JWT with exp = 7 days, type = "refresh"
- `decode_token(token: str) -> dict` — decode and validate JWT
- `get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User` — FastAPI dependency, extracts user from Bearer token, eagerly loads `user.roles` and `role.permissions` for RBAC checks

### 1.7 Auth endpoints

New file `app/api/v1/auth.py`:

| Method | Path | Body | Returns | Auth |
|--------|------|------|---------|------|
| POST | `/api/v1/auth/register` | `{email, password}` | `TokenResponse` | No |
| POST | `/api/v1/auth/login` | `{email, password}` | `TokenResponse` | No |
| POST | `/api/v1/auth/refresh` | `{refresh_token}` | `TokenResponse` | No |
| GET | `/api/v1/auth/me` | — | `UserResponse` (includes roles + permissions) | Yes |

Register: validate email format, check uniqueness, hash password, create user, assign default role (`admin` for first user, `editor` for subsequent), return tokens.
Login: find user by email, verify password, return tokens (JWT includes `roles` claim).
Refresh: decode refresh_token, verify type="refresh", issue new access_token with current roles.
Me: return current user profile including roles and permissions.

### 1.8 Role management endpoints (admin only)

New file `app/api/v1/roles.py`:

| Method | Path | Body | Returns | Auth |
|--------|------|------|---------|------|
| GET | `/api/v1/roles` | — | `list[RoleResponse]` | `role.read` |
| POST | `/api/v1/roles` | `{name, description}` | `RoleResponse` | `role.create` |
| POST | `/api/v1/roles/assign` | `{user_id, role_name}` | `{message}` | `role.update` |
| DELETE | `/api/v1/roles/revoke` | `{user_id, role_name}` | `{message}` | `role.update` |
| POST | `/api/v1/roles/permissions` | `{role_name, resource, action}` | `{message}` | `role.update` |
| DELETE | `/api/v1/roles/permissions` | `{role_name, resource, action}` | `{message}` | `role.update` |
| GET | `/api/v1/users` | — | `list[UserResponse]` | `user.read` |

All role management endpoints require admin-level permissions (enforced via `require_permission`).

### 1.9 Protect existing routes with RBAC

Add `require_permission` dependency to all project/feature/version endpoints. This replaces the old simple `get_current_user` — each endpoint checks for the specific permission needed.

**Projects:**
- `list_projects` — `require_permission("project", "read")`, filter by `current_user.id`
- `create_project` — `require_permission("project", "create")`, set `user_id = current_user.id`

**Features:**
- `list_features` — `require_permission("feature", "read")`, verify project belongs to current user
- `create_feature` — `require_permission("feature", "create")`, verify project belongs to current user
- `get_feature` — `require_permission("feature", "read")`, verify project belongs to current user
- `update_feature` — `require_permission("feature", "update")`, verify project belongs to current user

**Versions:**
- `create_version` — `require_permission("version", "create")`, verify feature's project belongs to current user
- `list_versions` — `require_permission("version", "read")`, verify feature's project belongs to current user

**Ownership check:** Even with the right permission, a user can only access their own projects/features. Admins can access all resources (checked via a special `admin` role bypass in `require_permission`).

## Phase 2: Backend — Image Upload

### 2.1 Upload endpoint

New file `app/api/v1/uploads.py`:

| Method | Path | Body | Returns | Auth |
|--------|------|------|---------|------|
| POST | `/api/v1/uploads/image` | multipart file | `{url: string}` | Yes |

Validation:
- File must have content type starting with `image/`
- File size must be under 5 MB
- Allowed extensions: png, jpg, jpeg, gif, webp, svg

Storage path: `./uploads/images/{user_id}/{timestamp}-{random_6_chars}.{ext}`

Response: `{ "url": "/api/v1/uploads/images/{user_id}/{filename}" }`

### 2.2 Serve uploaded images

Mount static files in `app/main.py`:
```python
from fastapi.staticfiles import StaticFiles
app.mount("/api/v1/uploads/images", StaticFiles(directory="uploads/images"), name="uploaded-images")
```

## Phase 3: Alembic Migration

New migration file `alembic/versions/0002_add_users_rbac_and_project_user_id.py`:

1. Create `users` table (id, email, hashed_password, is_active, created_at)
2. Create `roles` table (id, name unique, description, created_at)
3. Create `permissions` table (id, resource, action, created_at; unique constraint on resource+action)
4. Create `user_roles` join table (user_id FK, role_id FK, created_at; composite PK)
5. Create `role_permissions` join table (role_id FK, permission_id FK; composite PK)
6. Add `user_id` column to `projects` table (nullable initially)
7. Create index on `users.email`

**Seed data (run in migration `upgrade()`):**

Insert default permissions:

| resource | action |
|----------|--------|
| project | create, read, update, delete |
| feature | create, read, update, delete |
| version | create, read, delete |
| upload | create |
| user | read, update, delete |
| role | create, read, update, delete |

Insert default roles and assign permissions:

- **admin** — all permissions
- **editor** — project.(create, read, update), feature.*, version.*, upload.create
- **viewer** — project.read, feature.read, version.read

The `user_id` column on projects is nullable at the DB level so existing data doesn't break. The application code always sets it on create. Future migration can make it NOT NULL after all rows have been assigned.

## Phase 4: Frontend — Remove Supabase & Lovable

### 4.1 Delete files

Delete entirely:
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/client.server.ts`
- `src/integrations/supabase/auth-middleware.ts`
- `src/integrations/supabase/types.ts`
- `src/integrations/lovable/index.ts`
- `src/lib/api_integration_note.txt`

### 4.2 Rewrite `src/lib/api.ts`

Remove Supabase import. Read token from localStorage:

```typescript
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("access_token");
  const headers = new Headers(opts.headers || {});
  if (!(opts.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    // Try refresh
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry with new token
      const newToken = localStorage.getItem("access_token");
      headers.set("Authorization", `Bearer ${newToken}`);
      const retry = await fetch(`${API_BASE}${path}`, { ...opts, headers });
      if (!retry.ok) {
        const text = await retry.text();
        throw new Error(`API error ${retry.status}: ${text}`);
      }
      return retry.json();
    }
    // Refresh failed — clear auth
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.href = "/auth";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export { API_BASE, apiFetch };
```

### 4.3 Rewrite `src/lib/auth.tsx`

Replace Supabase auth with backend JWT auth:

- Remove all `@supabase/supabase-js` imports
- Remove `Session` and `User` types from Supabase, define local types:
  - `AuthUser`: `{ id: string; email: string; roles: string[]; permissions: string[] }`
  - Permissions flattened as `"resource.action"` strings (e.g. `"project.create"`)
- `AuthProvider` on mount: check localStorage for `access_token`, call `GET /api/v1/auth/me` to validate and get user with roles/permissions
- `signOut`: clear localStorage tokens, set user to null
- Roles and permissions come from the `/api/v1/auth/me` response (no separate Supabase `user_roles` query)
- `isAdmin` computed from `roles.includes("admin")`
- Export helper: `hasPermission(resource: string, action: string): boolean`
- Export `useAuth` hook with shape: `{ user, loading, roles, isAdmin, signOut, hasPermission }`

### 4.4 Rewrite `src/routes/auth.tsx`

- Remove `supabase` and `lovable` imports
- `beforeLoad`: check localStorage for `access_token`, if present call `/api/v1/auth/me` to verify — redirect to `/` if valid
- Login form: call `apiFetch("/api/v1/auth/login", ...)`, store tokens in localStorage
- Signup form: call `apiFetch("/api/v1/auth/register", ...)`, store tokens in localStorage
- Remove Google OAuth button and `GoogleIcon` component (Lovable dependency removed)
- Keep email/password form with same UI

### 4.5 Update route guards

In `index.tsx`, `projects.$projectId.tsx`, `projects.$projectId.features.$featureId.tsx`:

Replace:
```typescript
const { data } = await supabase.auth.getSession();
if (!data.session) throw redirect({ to: "/auth" });
```

With:
```typescript
const token = localStorage.getItem("access_token");
if (!token) throw redirect({ to: "/auth" });
```

Remove `supabase` import from each file.

### 4.6 Update `src/components/MarkdownEditor.tsx`

Replace Supabase Storage upload with backend API call:

```typescript
// Before:
const { error } = await supabase.storage.from("feature-images").upload(path, file, ...);
const { data } = supabase.storage.from("feature-images").getPublicUrl(path);

// After:
const formData = new FormData();
formData.append("file", file);
const result = await apiFetch("/api/v1/uploads/image", {
  method: "POST",
  body: formData,
});
// result.url contains the image path
```

Remove `supabase` import.

### 4.7 Update `src/routes/__root.tsx`

Replace Lovable-hosted image URLs in meta tags with a local or generic placeholder (or remove og:image/twitter:image entirely for now).

### 4.8 Replace Vite config

Replace `@lovable.dev/vite-tanstack-config` with standard plugins:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart(),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
```

### 4.9 Update `package.json`

Remove:
- `@supabase/supabase-js`
- `@lovable.dev/cloud-auth-js`
- `@lovable.dev/vite-tanstack-config`

Keep all other dependencies.

### 4.10 Update `.env`

Remove:
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`

Keep:
- `VITE_API_URL=http://localhost:8000`

### 4.11 Update `src/lib/projects.ts`

The file already uses `apiFetch` for some operations. Ensure:
- Remove any residual `supabase` references (none currently, but the comment "Projects are stored in Supabase" in `store.ts` should be removed)
- The `apiFetch` import works correctly since `api.ts` no longer depends on Supabase

### 4.12 Clean up `src/lib/store.ts`

Remove the comment on line 16: `// Projects are stored in Supabase (see lib/projects.ts and useProjects hook).`

## Files Changed Summary

### Backend — new files
- `app/api/v1/auth.py`
- `app/api/v1/roles.py`
- `app/api/v1/uploads.py`
- `app/core/rbac.py`
- `alembic/versions/0002_add_users_rbac_and_project_user_id.py`

### Backend — modified files
- `app/core/config.py` — add JWT settings, remove Supabase settings
- `app/core/security.py` — full rewrite: JWT + bcrypt + `get_current_user`
- `app/db/models.py` — add `User` model, add `user_id` to `Project`
- `app/schemas.py` — add auth schemas
- `app/api/v1/__init__.py` — export new routers (auth, roles, uploads)
- `app/api/v1/projects.py` — add RBAC permission checks, user scoping
- `app/api/v1/features.py` — add RBAC permission checks, project ownership check
- `app/api/v1/versions.py` — add RBAC permission checks, project ownership check
- `app/main.py` — register auth/roles/upload routers, mount static files
- `requirements.txt` — add new dependencies

### Frontend — deleted files
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/client.server.ts`
- `src/integrations/supabase/auth-middleware.ts`
- `src/integrations/supabase/types.ts`
- `src/integrations/lovable/index.ts`
- `src/lib/api_integration_note.txt`

### Frontend — modified files
- `src/lib/api.ts` — remove Supabase, use localStorage token, add refresh logic
- `src/lib/auth.tsx` — full rewrite: JWT auth via backend API
- `src/lib/store.ts` — remove Supabase comment
- `src/routes/auth.tsx` — rewrite: backend login/signup, remove Google OAuth
- `src/routes/index.tsx` — replace Supabase session guard with localStorage check
- `src/routes/projects.$projectId.tsx` — same guard replacement
- `src/routes/projects.$projectId.features.$featureId.tsx` — same guard replacement
- `src/components/MarkdownEditor.tsx` — replace Supabase Storage with backend upload
- `src/routes/__root.tsx` — remove Lovable image URLs from meta tags
- `vite.config.ts` — replace Lovable config with standard Vite plugins
- `package.json` — remove Supabase + Lovable packages
- `.env` — remove Supabase env vars

## Out of Scope

- Google/OAuth social login (requires separate OAuth integration, not Lovable)
- Email verification on signup
- Password reset flow
- Supabase database migration (moving existing Supabase data to the backend DB)
- The `frontend/supabase/` directory (contains SQL migrations for Supabase — can be deleted separately)
- Admin UI for role/permission management (API endpoints exist, but no frontend UI — manage via API or CLI)
