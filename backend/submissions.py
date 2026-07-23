# Stores researcher submissions in Supabase Postgres through DuckDB's Postgres extension.

import os
import threading
import uuid

import duckdb

CONNSTRING = os.environ["SUPABASE_DB_CONNSTRING"]

VALID_STATUSES = {"approved", "rejected"}
_schema_lock = threading.Lock()
_schema_ready = False


def _ensure_schema(con) -> None:
    # Apply additive schema changes once per backend process.
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        con.execute(
            """
            CALL postgres_execute(
                'supa',
                'ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS submitter_display_name VARCHAR'
            )
            """
        )
        con.execute(
            """
            CALL postgres_execute(
                'supa',
                'CREATE TABLE IF NOT EXISTS public.personal_species_notes (
                    user_id UUID NOT NULL,
                    genus VARCHAR NOT NULL,
                    species VARCHAR NOT NULL,
                    note VARCHAR NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY (user_id, genus, species)
                )'
            )
            """
        )
        con.execute(
            """
            CALL postgres_execute(
                'supa',
                'ALTER TABLE public.personal_species_notes ENABLE ROW LEVEL SECURITY'
            )
            """
        )
        con.execute(
            """
            CALL postgres_execute(
                'supa',
                'CREATE TABLE IF NOT EXISTS public.admin_data_overrides (
                    id UUID PRIMARY KEY,
                    genus VARCHAR NOT NULL,
                    species VARCHAR NOT NULL,
                    field_name VARCHAR NOT NULL,
                    field_value VARCHAR NOT NULL,
                    updated_by UUID NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    UNIQUE (genus, species, field_name)
                )'
            )
            """
        )
        con.execute(
            """
            CALL postgres_execute(
                'supa',
                'ALTER TABLE public.admin_data_overrides ENABLE ROW LEVEL SECURITY'
            )
            """
        )
        con.execute("CALL pg_clear_cache()")
        _schema_ready = True


def _connect():
    con = duckdb.connect()
    con.execute("INSTALL postgres")
    con.execute("LOAD postgres")
    con.execute(f"ATTACH '{CONNSTRING}' AS supa (TYPE postgres)")
    _ensure_schema(con)
    return con


def create_submission(
    user: dict,
    genus: str,
    species: str,
    field_name: str,
    field_value: str,
    source_citation: str,
) -> str:
    submission_id = str(uuid.uuid4())
    con = _connect()
    try:
        con.execute(
            """
            INSERT INTO supa.submissions
                (id, submitter_id, submitter_email, submitter_display_name,
                 genus, species, field_name, field_value, source_citation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                submission_id,
                user["user_id"],
                user["email"],
                user.get("display_name", ""),
                genus,
                species,
                field_name,
                field_value,
                source_citation,
            ],
        )
    finally:
        con.close()
    return submission_id


def update_submitter_display_name(user: dict, display_name: str) -> None:
    con = _connect()
    try:
        con.execute(
            """
            UPDATE supa.submissions
            SET submitter_display_name = ?
            WHERE submitter_id = ?
            """,
            [display_name, user["user_id"]],
        )
    finally:
        con.close()


def get_personal_species_note(user: dict, genus: str, species: str) -> str:
    con = _connect()
    try:
        row = con.execute(
            """
            SELECT note
            FROM supa.personal_species_notes
            WHERE user_id = ? AND genus = ? AND species = ?
            """,
            [user["user_id"], genus, species],
        ).fetchone()
        return row[0] if row else ""
    finally:
        con.close()


def save_personal_species_note(user: dict, genus: str, species: str, note: str) -> None:
    # Empty notes delete the existing private record.
    con = _connect()
    try:
        existing = con.execute(
            """
            SELECT 1
            FROM supa.personal_species_notes
            WHERE user_id = ? AND genus = ? AND species = ?
            """,
            [user["user_id"], genus, species],
        ).fetchone()
        if not note:
            if existing:
                con.execute(
                    """
                    DELETE FROM supa.personal_species_notes
                    WHERE user_id = ? AND genus = ? AND species = ?
                    """,
                    [user["user_id"], genus, species],
                )
        elif existing:
            con.execute(
                """
                UPDATE supa.personal_species_notes
                SET note = ?, updated_at = now()
                WHERE user_id = ? AND genus = ? AND species = ?
                """,
                [note, user["user_id"], genus, species],
            )
        else:
            con.execute(
                """
                INSERT INTO supa.personal_species_notes (user_id, genus, species, note)
                VALUES (?, ?, ?, ?)
                """,
                [user["user_id"], genus, species, note],
            )
    finally:
        con.close()


def delete_personal_species_notes(user: dict) -> None:
    con = _connect()
    try:
        con.execute(
            "DELETE FROM supa.personal_species_notes WHERE user_id = ?",
            [user["user_id"]],
        )
    finally:
        con.close()


def list_own_submissions(user: dict):
    con = _connect()
    try:
        return con.execute(
            """
            SELECT id, genus, species, field_name, field_value, source_citation,
                   status, review_notes, created_at, reviewed_at
            FROM supa.submissions
            WHERE submitter_id = ?
            ORDER BY created_at DESC
            """,
            [user["user_id"]],
        ).df()
    finally:
        con.close()


def delete_own_submission(user: dict, submission_id: str) -> bool:
    """Delete one submission owned by the authenticated user."""
    con = _connect()
    try:
        existing = con.execute(
            "SELECT 1 FROM supa.submissions WHERE id = ? AND submitter_id = ?",
            [submission_id, user["user_id"]],
        ).fetchone()
        if not existing:
            return False
        con.execute(
            "DELETE FROM supa.submissions WHERE id = ? AND submitter_id = ?",
            [submission_id, user["user_id"]],
        )
        return True
    finally:
        con.close()


def list_pending_submissions():
    con = _connect()
    try:
        return con.execute(
            """
            SELECT id, submitter_email,
                   coalesce(nullif(trim(submitter_display_name), ''), 'Researcher') AS submitter_display_name,
                   genus, species, field_name, field_value,
                   source_citation, created_at
            FROM supa.submissions
            WHERE status = 'pending'
            ORDER BY created_at ASC
            """
        ).df()
    finally:
        con.close()


def review_submission(submission_id: str, reviewer_user_id: str, status: str, review_notes: str | None) -> bool:
    """Returns False if no pending submission with this id exists."""
    if status not in VALID_STATUSES:
        raise ValueError(f"status must be one of {VALID_STATUSES}")

    con = _connect()
    try:
        existing = con.execute(
            "SELECT 1 FROM supa.submissions WHERE id = ? AND status = 'pending'",
            [submission_id],
        ).fetchone()
        if not existing:
            return False
        con.execute(
            """
            UPDATE supa.submissions
            SET status = ?, reviewed_by = ?, review_notes = ?, reviewed_at = now()
            WHERE id = ?
            """,
            [status, reviewer_user_id, review_notes, submission_id],
        )
        return True
    finally:
        con.close()


def list_approved_submissions():
    """Used by fishbase_data to gap-fill trait values with reviewed community data."""
    con = _connect()
    try:
        return con.execute(
            """
            SELECT genus, species, field_name, field_value, source_citation,
                   coalesce(nullif(trim(submitter_display_name), ''), 'Researcher') AS submitter_display_name
            FROM supa.submissions
            WHERE status = 'approved'
            ORDER BY reviewed_at ASC
            """
        ).df()
    finally:
        con.close()


def list_admin_data_overrides():
    con = _connect()
    try:
        return con.execute(
            """
            SELECT id, genus, species, field_name, field_value, updated_at
            FROM supa.admin_data_overrides
            ORDER BY lower(genus), lower(species), lower(field_name)
            """
        ).df()
    finally:
        con.close()


def save_admin_data_override(
    user: dict,
    genus: str,
    species: str,
    field_name: str,
    field_value: str,
) -> str:
    con = _connect()
    try:
        existing = con.execute(
            """
            SELECT id
            FROM supa.admin_data_overrides
            WHERE genus = ? AND species = ? AND field_name = ?
            """,
            [genus, species, field_name],
        ).fetchone()
        if existing:
            override_id = str(existing[0])
            con.execute(
                """
                UPDATE supa.admin_data_overrides
                SET field_value = ?, updated_by = ?, updated_at = now()
                WHERE id = ?
                """,
                [field_value, user["user_id"], override_id],
            )
        else:
            override_id = str(uuid.uuid4())
            con.execute(
                """
                INSERT INTO supa.admin_data_overrides
                    (id, genus, species, field_name, field_value, updated_by)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [override_id, genus, species, field_name, field_value, user["user_id"]],
            )
        return override_id
    finally:
        con.close()


def delete_admin_data_override(override_id: str) -> bool:
    con = _connect()
    try:
        existing = con.execute(
            "SELECT 1 FROM supa.admin_data_overrides WHERE id = ?",
            [override_id],
        ).fetchone()
        if not existing:
            return False
        con.execute(
            "DELETE FROM supa.admin_data_overrides WHERE id = ?",
            [override_id],
        )
        return True
    finally:
        con.close()
