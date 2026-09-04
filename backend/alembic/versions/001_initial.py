"""initial aqua vision schema

Revision ID: 001
Revises:
Create Date: 2026-09-04
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("SELECT 1")  # tables are created by SQLAlchemy metadata on startup


def downgrade() -> None:
    pass
