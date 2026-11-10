"""Initial DevPilot AI PostgreSQL schema.

Revision ID: 49aba8ffcb51
Revises:
Create Date: 2026-11-08 22:43:17.370475
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "49aba8ffcb51"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the initial DevPilot AI PostgreSQL schema."""

    op.create_table(
        "repositories",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("path", sa.Text(), nullable=False, unique=True),
        sa.Column("created_at", sa.Text(), nullable=False),
    )

    op.create_table(
        "repository_indexes",
        sa.Column("repository_id", sa.Text(), primary_key=True),
        sa.Column("commit_sha", sa.Text(), nullable=False),
        sa.Column("indexed_at", sa.Text(), nullable=False),
        sa.Column("index_version", sa.Text(), nullable=True),
        sa.Column(
            "azure_ready",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("embedding_model", sa.Text(), nullable=True),
    )

    op.create_table(
        "repository_index_jobs",
        sa.Column("job_id", sa.Text(), primary_key=True),
        sa.Column("repository_id", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("phase", sa.Text(), nullable=False),
        sa.Column(
            "processed_chunks",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "total_chunks",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("started_at", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
    )

    op.create_index(
        "idx_index_jobs_latest",
        "repository_index_jobs",
        ["repository_id", sa.text("created_at DESC")],
    )

    op.create_index(
        "idx_index_jobs_active_repository",
        "repository_index_jobs",
        ["repository_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('queued', 'running')"),
    )

    op.create_table(
        "investigations",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("repository_id", sa.Text(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("review_passed", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("response_json", sa.Text(), nullable=False),
    )

    op.create_index(
        "idx_investigations_created_at",
        "investigations",
        [sa.text("created_at DESC")],
    )

    op.create_table(
        "development_workflows",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("repository_id", sa.Text(), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("instruction", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("proposal_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("response_json", sa.Text(), nullable=False),
    )

    op.create_index(
        "idx_development_workflows_repository",
        "development_workflows",
        ["repository_id", sa.text("created_at DESC")],
    )

    op.create_table(
        "patch_proposals",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("repository_id", sa.Text(), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("expected_sha256", sa.Text(), nullable=False),
        sa.Column("replacement_content", sa.Text(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("diff", sa.Text(), nullable=True),
    )

    op.create_table(
        "llm_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.CheckConstraint(
            "id = 1",
            name="ck_llm_settings_id",
        ),
    )

    op.create_table(
        "auth_sessions",
        sa.Column("token_hash", sa.Text(), primary_key=True),
        sa.Column("csrf_token", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
    )

    op.create_table(
        "auth_login_attempts",
        sa.Column("bucket", sa.Text(), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("window_start", sa.BigInteger(), nullable=False),
        sa.Column("blocked_until", sa.BigInteger(), nullable=False),
    )


def downgrade() -> None:
    """Remove the initial DevPilot AI PostgreSQL schema."""

    op.drop_table("auth_login_attempts")
    op.drop_table("auth_sessions")
    op.drop_table("llm_settings")
    op.drop_table("patch_proposals")

    op.drop_index(
        "idx_development_workflows_repository",
        table_name="development_workflows",
    )
    op.drop_table("development_workflows")

    op.drop_index(
        "idx_investigations_created_at",
        table_name="investigations",
    )
    op.drop_table("investigations")

    op.drop_index(
        "idx_index_jobs_active_repository",
        table_name="repository_index_jobs",
    )
    op.drop_index(
        "idx_index_jobs_latest",
        table_name="repository_index_jobs",
    )
    op.drop_table("repository_index_jobs")

    op.drop_table("repository_indexes")
    op.drop_table("repositories")
