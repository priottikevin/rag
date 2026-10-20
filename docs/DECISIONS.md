# DECISIONS — Journal des décisions (ADR courts)

Format : `ADR-NNN — titre · date · statut (proposée / acceptée / remplacée)` puis Contexte / Décision / Conséquences.
Une décision « acceptée » n'est remise en cause qu'avec l'accord de l'utilisateur.

---

## ADR-001 — Documentation continue et reprise à froid · 2026-10-20 · acceptée
**Contexte** : l'utilisateur veut pouvoir repartir d'un contexte vide.
**Décision** : CLAUDE.md = point d'entrée ; STATUS/TASKS/DECISIONS/QUESTIONS tenus à jour au fil de l'eau ; un fichier `docs/sessions/` par chantier lancé.
**Conséquences** : coût de maintenance accepté ; toute fin d'étape = mise à jour docs.

## ADR-002 — Stack de base · 2026-10-20 · proposée (à confirmer Q-10, Q-13)
Monorepo, React (front), Node.js + TypeScript (back, Fastify recommandé), PostgreSQL portable. Détails d'architecture RAG : en attente de R-01.

## ADR-004 — Contraintes matérielles et d'échelle · 2026-10-20 · acceptée
**Contexte** : ~100 000 fichiers (1-5 Mo : PDF/DOCX/XLSX/images), i7-8550U 4c/8t, 32 Go RAM, GPU MX150 2 Go, local maximal, installateur requis pour autres PC.
**Décision** : tout est conçu **CPU-only**, indexation incrémentale et reprenable en arrière-plan, modèles légers quantifiés (ONNX int8). Python autorisé comme composant (extraction/OCR/embeddings) à côté de Node. Fichiers **référencés** (non copiés) + dédup par hash. Stockage de la base sur D:.
**Conséquences** : choix de modèles à benchmarker sur ce CPU (R-01/R-02) ; l'installateur devra embarquer Postgres + Node + Python runtime.

## ADR-005 — Résultats de recherche : liste + réponse citée · 2026-10-20 · acceptée
Page Recherche = passages/fichiers classés ET réponse générée avec citations cliquables (génération via LLM : Gemini ou petit LLM local, à trancher en R-01).

## ADR-006 — Langue, génération et licences · 2026-10-20 · acceptée
Corpus en **français** (modèles à bon niveau FR). Réponse rédigée via **Gemini** (passages retenus uniquement). Produit potentiellement commercial → **licences permissives uniquement** (Apache/MIT/BSD ; éviter AGPL, CC-BY-NC) : PyMuPDF écarté par défaut.

## ADR-007 — Choix techniques issus de R-02 · 2026-10-20 · acceptée (révisable si benchmarks contraires)
PostgreSQL 17.11 portable (zip EDB) + pgvector 0.8.6 ; lexical = FTS natif français + unaccent (pg_search non dispo sous Windows) ; embeddings multilingual-e5-small ONNX (384 d) avec préfixes `query:`/`passage:` ; fusion pondérée dense+lexical ; reranker mmarco-mMiniLM optionnel ; extraction pypdfium2/python-docx/openpyxl, OCR RapidOCR en cascade. Détails : `docs/research/R-02_benchmarks.md`. Python = worker d'extraction/embeddings/OCR ; Node = API, orchestration, file de jobs.

## ADR-008 — Protection des secrets avant Gemini · 2026-10-20 · acceptée
**Demande utilisateur** : aucun identifiant/credential envoyé à Gemini si possible. Corpus réel contenant mots de passe (XLSX), IBAN, relevés bancaires.
**Statut d'implémentation** : fait (apps/api/src/redact.ts, gemini.ts, migration 002).
**Décision** : (1) tout reste local par défaut ; (2) seuls les passages top-k nécessaires à la réponse sont envoyés ; (3) filtre de **rédaction obligatoire** avant envoi (mots de passe/logins/colonnes « password », clés API, IBAN, n° de carte, secrets à forte entropie…) ; (4) fichiers/dossiers marquables « confidentiel » → jamais envoyés ; (5) journal des envois. Pas d'envoi si le filtre échoue (fail-closed).

## ADR-003 — Co-construction, pas d'hypothèses silencieuses · 2026-10-20 · acceptée
Toute ambiguïté → question dans QUESTIONS.md, discutée avant d'implémenter.
