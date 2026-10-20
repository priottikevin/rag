-- 001: schéma initial (voir docs/ARCHITECTURE.md §3)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE roots (
  id serial PRIMARY KEY,
  path text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  confidential boolean NOT NULL DEFAULT false,
  excluded_globs text[] NOT NULL DEFAULT '{}',
  last_scan_at timestamptz
);

CREATE TABLE blobs (
  id bigserial PRIMARY KEY,
  sha256 bytea NOT NULL UNIQUE,
  size bigint NOT NULL,
  mime text,
  first_seen timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE file_paths (
  id bigserial PRIMARY KEY,
  blob_id bigint REFERENCES blobs(id),
  root_id int REFERENCES roots(id),
  path text NOT NULL UNIQUE,
  size bigint NOT NULL,
  mtime timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'new',   -- new | hashed | indexed | error | missing
  error text,
  confidential boolean NOT NULL DEFAULT false,
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX file_paths_blob_idx ON file_paths(blob_id);
CREATE INDEX file_paths_status_idx ON file_paths(status);

CREATE TABLE documents (
  id bigserial PRIMARY KEY,
  blob_id bigint NOT NULL UNIQUE REFERENCES blobs(id) ON DELETE CASCADE,
  title text,
  kind text,                    -- pdf | docx | xlsx | doc | image | text ...
  lang text,
  page_count int,
  text_quality text,            -- native | ocr | empty
  stage int NOT NULL DEFAULT 0, -- 0 extrait, 1 lexical prêt, 2 embeddings prêts
  extracted_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE chunks (
  id bigserial PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ord int NOT NULL,
  level smallint NOT NULL DEFAULT 0,
  parent_id bigint REFERENCES chunks(id) ON DELETE CASCADE,
  page int,
  text text NOT NULL,
  ctx_text text NOT NULL,
  tsv tsvector,
  embedding vector(384)
);
CREATE INDEX chunks_doc_idx ON chunks(document_id);
CREATE INDEX chunks_tsv_idx ON chunks USING gin(tsv);
-- index HNSW créé après l'indexation massive (cf. migration ultérieure) pour éviter de ralentir les insertions

CREATE TABLE jobs (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,           -- scan | hash | extract | embed | ocr | thumb
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',  -- pending | running | done | failed | paused
  priority int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  error text,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX jobs_pick_idx ON jobs(status, priority DESC, id) WHERE status = 'pending';

CREATE TABLE audit_llm (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  purpose text NOT NULL,
  chunk_ids bigint[] NOT NULL DEFAULT '{}',
  redactions int NOT NULL DEFAULT 0
);
