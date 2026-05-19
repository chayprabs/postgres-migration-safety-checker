-- == 20260423103015 AddStatusToUsers: migrating =========================
-- add_column(:users, :status, :text, default: "active", null: false)
ALTER TABLE "users"
  ADD COLUMN "status" text DEFAULT 'active' NOT NULL;

-- add_index(:users, :email, algorithm: :concurrently)
CREATE INDEX CONCURRENTLY "index_users_on_email"
  ON "users" ("email");

-- == 20260423103015 AddStatusToUsers: migrated (0.0123s) ===============
