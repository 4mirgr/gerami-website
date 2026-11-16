PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS website_users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 email TEXT NOT NULL DEFAULT '' COLLATE NOCASE, display_name TEXT NOT NULL,
 phone TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL CHECK(provider IN ('password','github')),
 password_hash TEXT, email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0,1)),
 role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin','owner')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_login_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS website_email_unique ON website_users(email) WHERE email<>'';
CREATE UNIQUE INDEX IF NOT EXISTS website_single_owner ON website_users(role) WHERE role='owner';
CREATE INDEX IF NOT EXISTS website_users_created ON website_users(created_at DESC,id);
CREATE TABLE IF NOT EXISTS website_sessions (
 token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('website','private')),
 user_id TEXT REFERENCES website_users(id) ON DELETE CASCADE,
 subject TEXT, profile_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 CHECK ((kind='website' AND user_id IS NOT NULL AND subject IS NULL) OR (kind='private' AND user_id IS NULL AND subject IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS website_sessions_user ON website_sessions(user_id);
CREATE INDEX IF NOT EXISTS website_sessions_expiry ON website_sessions(expires_at);
CREATE TABLE IF NOT EXISTS website_rate_limits (bucket TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS website_rate_expiry ON website_rate_limits(expires_at);
CREATE TABLE IF NOT EXISTS website_recovery_requests (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES website_users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS website_recovery_user ON website_recovery_requests(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS website_reset_tokens (
 token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES website_users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS website_reset_user ON website_reset_tokens(user_id);
CREATE TABLE IF NOT EXISTS website_user_audit (
 id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,subject_id TEXT NOT NULL,action TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS website_audit_recent ON website_user_audit(created_at DESC);
