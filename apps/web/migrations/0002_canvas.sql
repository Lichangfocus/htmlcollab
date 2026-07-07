-- 无限画布协同（docs/04-canvas-design.md P0+P1）
CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  page_id TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canvas_objects (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL,
  type TEXT NOT NULL,               -- note | intent
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  w REAL NOT NULL DEFAULT 0,
  h REAL NOT NULL DEFAULT 0,
  anchor TEXT,                      -- json: {versionId?, ccId?, tag?, snippet?, html?}
  content TEXT NOT NULL DEFAULT '{}', -- json: {text, intentType?, sourceCommentId?}
  status TEXT NOT NULL DEFAULT 'open',  -- open | claimed | resolved（仅 intent 有意义）
  claimed_by TEXT,
  claimed_name TEXT,
  claimed_at TEXT,
  resolved_version_id TEXT,
  created_by TEXT NOT NULL,
  created_name TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_canvas_objects ON canvas_objects(canvas_id, seq);

CREATE TABLE IF NOT EXISTS presence (
  canvas_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#4f46e5',
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (canvas_id, user_id)
);

ALTER TABLE versions ADD COLUMN base_version_id TEXT;
ALTER TABLE versions ADD COLUMN kind TEXT NOT NULL DEFAULT 'mainline';
ALTER TABLE versions ADD COLUMN pushed_by_name TEXT;
