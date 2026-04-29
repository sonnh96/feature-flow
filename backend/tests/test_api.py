import pytest


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json().get("status") == "ok"


@pytest.mark.asyncio
async def test_project_crud_and_feature_creation(client):
    created = await client.post(
        "/api/v1/projects/",
        json={
            "name": "Feature Flow",
            "description_markdown": "Project feature intelligence.",
            "external_repo_name": "feature-flow",
            "source_type": "manual",
        },
    )
    assert created.status_code == 200
    project = created.json()
    assert project["external_repo_name"] == "feature-flow"

    feature_response = await client.post(
        f"/api/v1/features/?project_id={project['id']}",
        json={
            "name": "Feature Intelligence Layer",
            "short_description": "Generate business-facing feature structures from source code.",
            "feature_type": "epic",
            "tags": ["gitnexus"],
        },
    )
    assert feature_response.status_code == 200
    feature = feature_response.json()
    assert feature["code"].startswith("FF")
    assert feature["review_status"] == "draft"

    history = await client.get(f"/api/v1/features/{feature['id']}/history")
    assert history.status_code == 200
    assert history.json()[0]["event_type"] == "FeatureCreated"


@pytest.mark.asyncio
async def test_gitnexus_snapshot_sync_creates_reviewable_features(client):
    response = await client.post(
        "/api/v1/projects/sync",
        json={
            "repo_name": "feature-flow",
            "project_name": "Feature Flow",
            "revision": "abc123",
            "clusters": [{"name": "Components", "symbols": 47, "cohesion": "83%"}],
            "processes": [
                {"name": "FeatureTree -> OnChange", "type": "cross_community", "steps": 5},
                {"name": "FeatureTree -> OnSelect", "type": "intra_community", "steps": 4},
            ],
            "requested_by": "tester",
        },
    )
    assert response.status_code == 200
    sync = response.json()
    assert sync["created_features"] >= 3
    assert sync["review_tasks"] >= 1

    features = await client.get(f"/api/v1/projects/{sync['project_id']}/features?hierarchy=true")
    assert features.status_code == 200
    tree = features.json()
    assert tree[0]["children"]

    search = await client.get("/api/v1/search", params={"q": "FeatureTree"})
    assert search.status_code == 200
    assert search.json()["total"] >= 1
