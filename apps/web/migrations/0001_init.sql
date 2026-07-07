-- htmlcollab 初始 schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  api_token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  html TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  cc_id TEXT,
  element_tag TEXT,
  element_snippet TEXT,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  parent_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collaborators (
  page_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'commenter',
  created_at TEXT NOT NULL,
  PRIMARY KEY (page_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_versions_page ON versions(page_id, number);
CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page_id);
