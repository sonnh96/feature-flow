import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.v1 import projects_router, features_router, versions_router, search_router, auth_router, roles_router, uploads_router

app = FastAPI(title="Feature Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(roles_router, prefix="/api/v1/roles", tags=["roles"])
app.include_router(uploads_router, prefix="/api/v1/uploads", tags=["uploads"])
app.include_router(projects_router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(features_router, prefix="/api/v1/features", tags=["features"])
app.include_router(versions_router, prefix="/api/v1/features/{feature_id}/versions", tags=["versions"])
app.include_router(search_router, prefix="/api/v1/search", tags=["search"])

# Mount uploaded images as static files
upload_dir = os.environ.get("UPLOAD_DIR", "./uploads/images")
os.makedirs(upload_dir, exist_ok=True)
app.mount("/api/v1/uploads/images", StaticFiles(directory=upload_dir), name="uploaded-images")

@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}
