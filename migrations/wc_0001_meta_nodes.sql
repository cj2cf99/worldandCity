-- wc_0001: 元数据与空间节点（设计 §4.2 wc_meta / wc_nodes）。只含结构，不含数据。
CREATE TABLE wc_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE wc_nodes (
  id          TEXT PRIMARY KEY CHECK (id <> '' AND instr(id, '/') = 0),
  parent_id   TEXT REFERENCES wc_nodes(id) ON DELETE RESTRICT,
  path        TEXT NOT NULL CHECK (path LIKE '/%/'),
  realm       TEXT NOT NULL CHECK (realm IN ('geo', 'celestial')),
  kind        TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_local  TEXT,
  code        TEXT UNIQUE,
  geom_ref    TEXT,
  bbox_w      REAL,
  bbox_s      REAL,
  bbox_e      REAL,
  bbox_n      REAL,
  detail      TEXT NOT NULL DEFAULT '{}',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  search_norm TEXT,
  origin      TEXT NOT NULL CHECK (origin IN ('seed', 'user', 'demo')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  -- 物化路径必须以自身 id 结尾；与父路径的拼接关系由服务层/种子导入校验（设计 §4.2）
  CHECK (substr(path, -(length(id) + 2)) = '/' || id || '/'),
  CHECK ((parent_id IS NULL) = (path = '/' || id || '/'))
);

CREATE INDEX wc_nodes_children ON wc_nodes (parent_id, sort_order);
CREATE INDEX wc_nodes_path ON wc_nodes (path);
