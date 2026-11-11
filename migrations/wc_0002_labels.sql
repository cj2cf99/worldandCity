-- wc_0002: 地图标签。独立于导航树（wc_nodes），不设外键；level/node 只是创建时所在层级的标识。
CREATE TABLE wc_labels (
  id         TEXT PRIMARY KEY,
  level      TEXT NOT NULL,
  node       TEXT,
  lon        REAL NOT NULL,
  lat        REAL NOT NULL,
  type       TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX wc_labels_level ON wc_labels (level);
