# ARCHITECTURE — cible v1 (D-03) · 2026-10-20

Décisions de référence : ADR-004 à ADR-008. Mesures : `docs/research/R-02_benchmarks.md`.

## 1. Vue d'ensemble
```
 Navigateur (React, Vite)  ──HTTP/SSE──►  API Node (Fastify, TypeScript)  ──SQL──►  PostgreSQL 17 portable + pgvector
   /search  /ingest  /organize                │  orchestre, sert les fichiers,            ▲
                                              │  file de jobs (table `jobs`)              │
                                              ▼                                           │
                                   Workers (processus Node)  ──stdin/stdout JSON──►  Worker Python
                                   scan, hash, dispatch                          extraction, OCR, embeddings (ONNX)
```
- **Front et ingestion découplés** : l'ingestion vit côté serveur (workers + table `jobs`). Changer de page, fermer l'onglet ou redémarrer l'API n'arrête rien ; au redémarrage les jobs `running` repassent en `pending` (reprise).
- **Progression temps réel** : SSE (`/api/ingest/events`) + endpoint d'état ; le front relit l'état à chaque montage de page.
- **Un seul PC, localhost**, pas d'authentification v1 (à confirmer Q-17).

## 2. Monorepo (pnpm workspaces, à confirmer Q-13)
```
rag/
  apps/web        React + Vite + TypeScript (pages Recherche, Dépôt, Rangement)
  apps/api        Fastify + TypeScript (API, SSE, orchestrateur de jobs)
  packages/shared types et schémas partagés (zod)
  workers/python  extraction / OCR / embeddings (venv, onnxruntime) — protocole JSON-lines
  db/migrations   SQL versionné
  tools/          binaires portables (PostgreSQL…) — hors git
  scripts/        install/start/stop (PowerShell)
  bench/          scripts de benchmark (R-02) — hors git (.venv)
  docs/           documentation (source de vérité du projet)
```

## 3. Modèle de données (v1, PostgreSQL)
- `blobs(id, sha256 UNIQUE, size, mime, first_seen)` — **contenu** unique (dédup par hash).
- `file_paths(id, blob_id→blobs, path UNIQUE, mtime, size, root_id, status, last_seen)` — **chemins d'origine** (plusieurs chemins → un même contenu). Un clic ouvre `path`.
- `roots(id, path, enabled, excluded_globs, confidential)` — dossiers à indexer / exclusions / confidentialité.
- `documents(id, blob_id, title, lang, kind, page_count, text_quality, extracted_at, meta jsonb)`.
- `chunks(id, document_id, ord, level, parent_id, page, text, ctx_text, tokens, tsv tsvector, embedding vector(384))` — `ctx_text` = contexte déterministe (dossier, nom, section/feuille) ; `level` 0 = petit chunk (précision), 1 = parent (lecture/réponse).
- `jobs(id, kind, payload jsonb, status, priority, attempts, error, created/started/finished, locked_by)` — file persistante (`SELECT … FOR UPDATE SKIP LOCKED`).
- `events`/`audit_llm(id, ts, purpose, chunk_ids, redactions)` — journal des envois à Gemini (ADR-008).
- Index : HNSW sur `embedding` (cosinus), GIN sur `tsv` (config `french` + `unaccent`), btree sur `sha256`, `path`.
- `thumbnails` sur disque (`D:\dev\rag\data\thumbs`), jamais de copie des originaux.

## 4. Pipeline d'ingestion (deux passes)
1. **Découverte** : scan récursif des `roots` (reprenable), ignore `~$*`, fichiers système ; compare `mtime/size` → jobs `hash`.
2. **Hash** (SHA-256) → dédup : contenu déjà connu ⇒ on ajoute seulement un `file_path`.
3. **Passe 1 — rapide** (texte natif) : extraction (pypdfium2 / python-docx / openpyxl / parseur .doc) → chunking structurel → `tsv` → **recherche lexicale disponible immédiatement**.
4. **Passe 2 — en arrière-plan** : embeddings e5-small → `embedding` ; OCR des PDF/images sans texte (puis passes 1-2 sur le texte OCR) ; miniatures/réduction des images (grand côté ≤ 1600 px).
5. **Passe 3 (optionnelle, plus tard)** : enrichissements (classification, entités, liens entre documents), éventuellement Gemini sur contenu non sensible.
- Priorités : nouveaux dépôts utilisateur > re-scan ; passe 1 > passe 2 > OCR. Limite de concurrence adaptée aux 4 cœurs ; pause automatique possible quand l'utilisateur travaille (option).

## 5. Recherche
1. Requête → normalisation (accents/minuscules), préfixe `query:`.
2. Lexical : `tsquery` OR sur termes (`websearch_to_tsquery` + variantes), score `ts_rank_cd`. Dense : `embedding <=> q` (top 50).
3. **Fusion pondérée** (poids réglés sur le jeu de test, `T-03`), regroupement par fichier, dédup (un contenu, N chemins).
4. Reranker mmarco optionnel (top 10-20) en second temps.
5. Sortie : liste de fichiers/passages (extrait surligné, chemin, bouton **Ouvrir** / **Afficher dans l'explorateur**) + **réponse rédigée Gemini** avec citations [1][2] cliquables, après **rédaction de secrets** (ADR-008).
6. Ouverture de fichier : l'API vérifie que le chemin est dans une racine indexée puis ouvre via l'OS (`start`/`explorer /select`) ; téléchargement/prévisualisation via `/api/files/:id` pour PDF/images.

## 6. Page Rangement (phase 4)
Clustering sur les embeddings existants (sans LLM) + règles (dossier, type, entités) → catégories ; libellés auto ; correspondance avec catégories définies par l'utilisateur (société, perso…). Vues : arbre + cartes avec liens vers les fichiers. Gemini optionnel pour nommer les clusters (métadonnées seulement, sans contenu sensible).

## 7. Packaging / installateur (plus tard)
Dossier autonome : Node portable, Python embarqué + wheels, PostgreSQL zip, modèles ONNX (téléchargés une fois), scripts `start/stop`. Installateur Inno Setup produisant un `.exe`. Licences : composants permissifs (ADR-006) ; pgvector à recompiler (MSVC) pour la distribution.

## 8. Qualité / évaluation
`bench/queries.json` → jeu de test de référence (à enrichir) ; script d'évaluation (recall@k, MRR) relançable après chaque changement de pipeline (T-03).

## 9. Risques connus
- Qualité sur 100 000 fichiers très similaires (factures) : prévoir filtres (type, date, dossier) et boosts par métadonnées (nom de fichier, dossier).
- Temps d'indexation initiale ~1,5-2 jours : indispensable que la passe 1 rende la recherche utile tôt.
- pgvector binaire tiers ; BM25 absent (FTS natif moins fin).
- Données sensibles : ADR-008.
