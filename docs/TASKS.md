# TASKS — Backlog maître

Statuts : ⬜ à faire · 🟦 en cours · ✅ fait · ⏸️ bloqué (préciser) · ❌ abandonné
Chaque tâche : ID, titre, statut, dépendances, lien vers fichier de session quand lancée.
Dernière mise à jour : 2026-10-20

## Phase 0 — Cadrage & documentation
| ID | Tâche | Statut | Dép. | Session |
|----|-------|--------|------|---------|
| D-01 | Créer l'ossature de docs (CLAUDE, PROJECT, TASKS, STATUS, QUESTIONS, DECISIONS, sessions) | ✅ | — | 2026-10-20_01 |
| D-02 | Poser les questions de cadrage (QUESTIONS.md) et consigner les réponses | 🟦 | D-01 | 2026-10-20_01 |
| R-01 | **Veille état de l'art RAG** → `docs/research/R-01_etat-de-l-art-rag.md` | ✅ | D-02 | 2026-10-20_02 |
| R-02 | ✅ (voir `docs/research/R-02_benchmarks.md`, ADR-007) **Benchmarks locaux** sur échantillon réel : embeddings (Granite R2, e5-small, EmbeddingGemma, Qwen3-0.6B), rerankers, extraction PDF/DOCX/XLSX/OCR, LLM local FR, dispo Windows de pgvector + BM25 (pg_search/pg_textsearch) | ✅ | R-01, Q-25 | 2026-10-20_03 |
| D-03 | Figer l'architecture cible + ADR (DECISIONS.md) | ✅ | R-02, D-02 | |

## Phase 1 — Fondations
| ID | Tâche | Statut | Dép. |
|----|-------|--------|------|
| F-01 | Init monorepo (workspaces, TS, lint, scripts) | ✅ | D-03 |
| F-02 | Télécharger PostgreSQL **portable** (binaires) + extensions (pgvector, etc.) dans `d:\dev\rag\tools\` | ⬜ | D-03 |
| F-02b | Script de re-téléchargement/vérif des binaires (PG zip + pgvector, SHA-256) | ⬜ | F-02 |
| F-03 | Scripts init/start/stop de la base (initdb, port, data dir hors git) | ✅ | F-02 |
| F-04 | Schéma DB v1 + système de migrations | ✅ | F-03 |
| F-05 | Squelette back Node (config, logs, health) | ✅ | F-01 |
| F-06 | Squelette front React (routing 3 pages, layout) | ✅ | F-01 |
| F-07 | Script unique de lancement de tout | ✅ | F-03, F-05, F-06 |

## Phase 2 — Ingestion (PRIORITÉ 1)
| ID | Tâche | Statut | Dép. |
|----|-------|--------|------|
| I-01 | File de jobs persistante (en DB) + worker en arrière-plan, reprise après crash | ✅ | F-04, F-05 |
| I-02 | API dépôt (upload / enregistrement de chemins), hash, déduplication | ✅ | I-01 |
| I-03 | Stockage + conservation du chemin d'origine + endpoint d'ouverture du fichier | ✅ | I-02 |
| I-04b | Parseur ancien `.doc` (piece table OLE) + fallback LibreOffice optionnel | ⬜ | I-04 |
| I-10 | Filtre de rédaction de secrets avant Gemini + marquage confidentiel (ADR-008) | ✅ | I-06 |
| I-04 | Détection de type + extracteurs (PDF, Office, texte, HTML, mails, code…) | ⬜ | I-01 |
| I-05 | Images : redimensionnement/compression, miniatures, OCR | ⬜ | I-04 |
| I-06 | Chunking intelligent (selon structure) | ⬜ | I-04 |
| I-07 | Embeddings (local d'abord) + index | 🟦 | I-06, R-01 |
| I-08 | Enrichissement IA ciblé (Gemini) uniquement si nécessaire | ⬜ | I-06 |
| I-09 | Page Dépôt : drag&drop, progression temps réel (SSE/WebSocket), persistance entre pages | 🟦 | I-02, F-06 |

## Phase 3 — Recherche
| ID | Tâche | Statut | Dép. |
|----|-------|--------|------|
| S-01 | Recherche plein texte + vectorielle hybride | ✅ | I-07 |
| S-02 | Reranking | ⬜ | S-01 |
| S-03 | Page Recherche : résultats, extraits, lien « ouvrir le fichier » | ✅ | S-01, I-03 |
| S-04 | Réponse générée avec citations (si retenu, Q-07) | 🟦 (code prêt, attend GEMINI_API_KEY) | S-02 |
| S-05 | Techniques avancées retenues après R-01 (contextual retrieval, graphe, agentique, visuel…) | ⬜ | R-01 |

## Phase 4 — Rangement (page 3)
| ID | Tâche | Statut | Dép. |
|----|-------|--------|------|
| O-01 | Classification/clustering des documents (déterministe d'abord) | ⬜ | I-07 |
| O-02 | Page Rangement : vues par catégorie avec liens vers fichiers | ⬜ | O-01 |
| O-03 | Tri assisté par IA (optionnel) | ⬜ | O-01 |

## Transverse
| ID | Tâche | Statut |
|----|-------|--------|
| T-01 | Tests (unitaires ingestion, e2e dépôt→recherche) | ⬜ |
| T-02 | Gestion secrets (`.env`, .gitignore) | ⬜ |
| T-03 | Évaluation qualité RAG (jeu de requêtes de test, métriques) | ⬜ |

## Ajouts de la session 04
| ID | Tâche | Statut |
|----|-------|--------|
| S-06 | Classement : reranker mmarco (top 12) intégré (`rr=1`) → MRR 0,56 → **0,74**, recall@5 0,83. Reste : boost nom de fichier, requêtes « demi-journée de location » / « accessoires informatiques » | ✅ (partiel) |
| I-11 | (fait en partie : passages à <35 % de lettres non vectorisés ; pénalité dense) Limiter l'impact des gros CSV/JSON/SQL (chunks massifs) : plafond de chunks par document, type « données » moins prioritaire | ⬜ |
| I-12 | Index HNSW sur `chunks.embedding` après indexation de masse + `ANALYZE` | ⬜ |
| I-13 | Drag&drop de fichiers isolés (copie dans `data/inbox` ou sélection de fichiers via dialogue natif) — voir Q-31 | ⬜ |
