from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import projects_router, features_router, versions_router, search_router, auth_router

app = FastAPI(title="Feature Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(projects_router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(features_router, prefix="/api/v1/features", tags=["features"])
app.include_router(versions_router, prefix="/api/v1/features/{feature_id}/versions", tags=["versions"])
app.include_router(search_router, prefix="/api/v1/search", tags=["search"])

@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}
