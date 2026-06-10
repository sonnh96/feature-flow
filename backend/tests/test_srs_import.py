import io
import zipfile

import pytest


async def _auth_headers(client, email: str = "srs-importer@test.com") -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _create_project(client, headers: dict[str, str]) -> str:
    response = await client.post(
        "/api/v1/projects/",
        json={
            "name": "Qnavi SRS",
            "description_markdown": "Imported SRS requirements.",
            "source_type": "manual",
        },
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()["id"]


def _srs_doc(feature_id: str, feature_name: str, domain: str) -> str:
    return f"""# Feature SRS — {feature_name}

## 1. Document Information

| Field | Value |
|-------|-------|
| Feature Name | {feature_name} |
| Feature ID | {feature_id} |
| Domain | {domain} |
| Status | For review |

## 2. Objective

Allow users to complete {feature_name.lower()} from the product workflow.

## 4. Business Rules

| # | Rule |
|---|------|
| BR-1 | The action must be audited. |

## 9. Acceptance Criteria

- The user can complete the workflow.
- Invalid input is rejected.
"""


@pytest.mark.asyncio
async def test_import_srs_folder_files_creates_parent_and_children(client):
    headers = await _auth_headers(client)
    project_id = await _create_project(client, headers)
    domain = "1. Authentication & Session Management"

    response = await client.post(
        f"/api/v1/projects/{project_id}/features/import",
        files=[
            (
                "files",
                (
                    "SRS/1. Authentication & Session Management/Web sign-in.md",
                    io.BytesIO(_srs_doc("FR-1.1", "Web sign-in", domain).encode()),
                    "text/markdown",
                ),
            ),
            (
                "files",
                (
                    "SRS/1. Authentication & Session Management/Token refresh.md",
                    io.BytesIO(_srs_doc("FR-1.3", "Token refresh", domain).encode()),
                    "text/markdown",
                ),
            ),
        ],
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_documents"] == 2
    assert payload["created_count"] == 3
    names = {feature["name"] for feature in payload["created"]}
    assert "Authentication & Session Management" in names
    assert "Web sign-in" in names
    assert "Token refresh" in names

    tree = await client.get(f"/api/v1/projects/{project_id}/features?hierarchy=true")
    assert tree.status_code == 200
    root = tree.json()[0]
    assert root["name"] == "Authentication & Session Management"
    assert {child["feature_code"] for child in root["children"]} == {"FR-1.1", "FR-1.3"}

    duplicate = await client.post(
        f"/api/v1/projects/{project_id}/features/import",
        files=[
            (
                "files",
                (
                    "SRS/1. Authentication & Session Management/Web sign-in.md",
                    io.BytesIO(_srs_doc("FR-1.1", "Web sign-in", domain).encode()),
                    "text/markdown",
                ),
            )
        ],
        headers=headers,
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["created_count"] == 0
    assert duplicate.json()["skipped_count"] == 1


@pytest.mark.asyncio
async def test_import_srs_zip_creates_features(client):
    headers = await _auth_headers(client, "srs-zip-importer@test.com")
    project_id = await _create_project(client, headers)
    archive = io.BytesIO()
    domain = "6. Trouble (Repair Request) Management — core"
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr(
            "SRS/6. Trouble (Repair Request) Management — core/Create trouble.md",
            _srs_doc("FR-6.1", "Create trouble", domain),
        )
    archive.seek(0)

    response = await client.post(
        f"/api/v1/projects/{project_id}/features/import",
        files={"files": ("srs.zip", archive, "application/zip")},
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_documents"] == 1
    assert payload["created_count"] == 2
    assert payload["created"][0]["name"] == "Trouble (Repair Request) Management — core"
    assert payload["created"][-1]["name"] == "Create trouble"
