# Session 2026-10-20_03 — Benchmarks locaux (R-02)

- **Tâches visées** : R-02
- **Statut** : 🟦 en cours

## Objectif
Mesurer sur le PC réel et l'échantillon (deux dossiers privés : corpus A 412 fichiers, corpus B 142 fichiers ; lecture seule, via `BENCH_ROOTS`) : extraction PDF/DOCX/DOC/XLSX/OCR, embeddings FR, reranker, dispo Windows de pgvector/BM25.

## Contraintes
Licences permissives (ADR-006), CPU only (ADR-004), français. Scripts de bench dans `D:\dev\rag\bench\` ; téléchargements dans des dossiers dédiés.

## Plan
- [ ] Inventaire échantillon (fait : voir QUESTIONS Q-25)
- [ ] Python : environnement isolé (venv) + bibliothèques
- [ ] Bench extraction (PDF texte vs scan, DOCX, DOC, XLSX, images/OCR)
- [ ] Bench embeddings (débit chunks/s, mémoire)
- [ ] Bench reranker
- [ ] Vérif PostgreSQL portable Windows + pgvector + BM25
- [ ] Rapport `docs/research/R-02_benchmarks.md`

## Journal
-

- Extraction et débit d'embeddings mesurés (voir R-02_benchmarks.md). Reste : qualité FR, OCR, reranker, Postgres/pgvector Windows, .doc.
- Scripts : bench/bench_extract.py, bench/bench_embed.py (venv bench/.venv).
- Qualité FR v1 mesurée (23 questions inventées, bench/queries.json ; bench/bench_quality.py) : e5-small meilleur (recall@5 0,91). Voir R-02 §3bis.
