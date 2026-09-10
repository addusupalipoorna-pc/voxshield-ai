"""add_otp_verification_and_user_fields

Revision ID: c8ee51a6941c
Revises: b7ff62f7830b
Create Date: 2026-09-09 19:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c8ee51a6941c'
down_revision: Union[str, None] = 'b7ff62f7830b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add email_verified_at and phone_verified_at to users if not present
    with op.batch_alter_table('users', schema=None) as batch_op:
        try:
            batch_op.add_column(sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))
        except Exception:
            pass
        try:
            batch_op.add_column(sa.Column('phone_verified_at', sa.DateTime(timezone=True), nullable=True))
        except Exception:
            pass

    # 2. Create otp_verifications table
    op.create_table(
        'otp_verifications',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=True),
        sa.Column('channel', sa.String(length=20), nullable=False),
        sa.Column('purpose', sa.String(length=40), nullable=False),
        sa.Column('destination', sa.String(length=255), nullable=False),
        sa.Column('otp_hash', sa.String(length=128), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_attempts', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('last_sent_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('request_id', sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_otp_verifications_destination'), 'otp_verifications', ['destination'], unique=False)
    op.create_index(op.f('ix_otp_verifications_otp_hash'), 'otp_verifications', ['otp_hash'], unique=False)
    op.create_index(op.f('ix_otp_verifications_purpose'), 'otp_verifications', ['purpose'], unique=False)
    op.create_index(op.f('ix_otp_verifications_channel'), 'otp_verifications', ['channel'], unique=False)
    op.create_index(op.f('ix_otp_verifications_user_id'), 'otp_verifications', ['user_id'], unique=False)
    op.create_index(op.f('ix_otp_verifications_request_id'), 'otp_verifications', ['request_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_otp_verifications_request_id'), table_name='otp_verifications')
    op.drop_index(op.f('ix_otp_verifications_user_id'), table_name='otp_verifications')
    op.drop_index(op.f('ix_otp_verifications_channel'), table_name='otp_verifications')
    op.drop_index(op.f('ix_otp_verifications_purpose'), table_name='otp_verifications')
    op.drop_index(op.f('ix_otp_verifications_otp_hash'), table_name='otp_verifications')
    op.drop_index(op.f('ix_otp_verifications_destination'), table_name='otp_verifications')
    op.drop_table('otp_verifications')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('phone_verified_at')
        batch_op.drop_column('email_verified_at')
