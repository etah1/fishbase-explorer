# Verifies Supabase JWTs and gates admin routes with an email allowlist.

import os

from fastapi import HTTPException, Request
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}

_supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
_admin_supabase = (
    create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    if SUPABASE_SERVICE_ROLE_KEY
    else None
)


def verify_token(request: Request) -> dict:
    """FastAPI dependency: returns {"user_id", "email"} for a valid bearer token, else 401."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = header.removeprefix("Bearer ").strip()

    try:
        result = _supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = result.user if result else None
    if not user or not user.email:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    metadata = user.user_metadata or {}
    display_name = str(metadata.get("display_name", "")).strip()
    return {
        "user_id": user.id,
        "email": user.email,
        "display_name": display_name[:60],
    }


def is_admin(user: dict) -> bool:
    return user["email"].lower() in ADMIN_EMAILS


def require_admin(user: dict) -> None:
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")


def delete_user(user_id: str) -> None:
    """Delete an authenticated user with the server-only Supabase admin client."""
    if not _admin_supabase:
        raise HTTPException(
            status_code=503,
            detail="Account deletion is not configured on the server",
        )
    try:
        _admin_supabase.auth.admin.delete_user(user_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Unable to delete account") from exc
