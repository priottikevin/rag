# R-02 — Benchmarks locaux (en cours) — 2026-10-20

Machine : i7-8550U (4c/8t, AVX2, pas de VNNI), 32 Go, CPU only. Scripts : `bench/` (venv `bench/.venv`, **hors git**). Échantillon : deux dossiers privés de documents de l'utilisateur (corpus A + B, 554 fichiers, lecture seule, non versionnés ; chemins fournis via la variable `BENCH_ROOTS`).

## 1. Extraction de texte (bibliothèques permissives : pypdfium2, python-docx, openpyxl, olefile)
| Type | Fichiers | Temps moyen | Remarques |
|---|---|---|---|
| PDF | 258 (441 pages) | 82 ms/fichier (~21 pages/s) | 7 PDF sans texte = **scans → OCR nécessaire** |
| DOCX | 135 réels | ~36 ms | OK |
| XLSX | 33 réels | ~54 ms | 1,1 M de caractères : les tableurs dominent le volume de texte |
| DOC (ancien Word) | ~70 réels | ~29 ms | ⚠️ extracteur brut **médiocre** (17 vides) → prévoir meilleure méthode (ex. LibreOffice headless embarqué, ou parseur dédié) |
Les « erreurs » viennent des fichiers temporaires Office `~$*.docx/.xlsx/.doc` (verrous) : **à ignorer à l'ingestion**.
Conclusion : l'extraction n'est **pas** le goulot ; ~100 000 fichiers ≈ 1-3 h d'extraction hors OCR.

## 2. Volume de texte réel → estimation des chunks
(estimation initiale ~3-4 chunks/fichier, corrigée en §3bis : ~6 chunks/fichier ⇒ ~600 k chunks). Les XLSX pèsent beaucoup ; la fourchette reste à affiner (échantillon petit).

## 3. Embeddings (ONNX, 4 threads, chunks de 256 tokens, batch 16)
| Modèle | Débit | Pour 350 k chunks |
|---|---|---|
| IBM Granite Embedding 97M multilingual R2 (quint8 avx2) | **11,9 chunks/s** | ~8 h |
| multilingual-e5-small (fp32) | 11,8 chunks/s | ~8 h |
| EmbeddingGemma-300M (quantized) | 2,7 chunks/s | ~36 h |
| Qwen3-Embedding-0.6B (int8) | non testé (export ONNX avec cache KV, demande un harnais spécifique) | probablement > 50 h |
Conclusion : seuls les modèles ~100 M tiennent confortablement sur ce CPU. Qualité FR **pas encore mesurée** (étape suivante).

## 3bis. Qualité de recherche en français (23 questions inventées, `bench/queries.json`)
Corpus : 426 fichiers texte (PDF/DOCX/XLSX non scannés) → 2 518 chunks (~6 chunks/fichier ⇒ **~600 k chunks pour 100 000 fichiers**, ≈ 14 h avec un modèle ~100 M). Chaque chunk est préfixé de son dossier + nom de fichier (contexte déterministe). Métrique au niveau fichier.
| Méthode | recall@5 | recall@10 | MRR |
|---|---|---|---|
| BM25 seul | 0,74 | 0,87 | 0,58 |
| Granite R2 seul | 0,65 | 0,70 | 0,49 |
| **e5-small seul** | **0,91** | **0,91** | **0,75** |
| Hybride BM25 + Granite (RRF) | 0,70 | 0,83 | 0,58 |
| Hybride BM25 + e5 (RRF) | 0,83 | 0,83 | 0,70 |
| Hybride BM25 + Granite + e5 | 0,78 | 0,91 | 0,65 |
**Lecture prudente** (23 questions, attendus définis par moi, échantillon de 426 fichiers) : e5-small est le meilleur ici ; Granite R2 en ONNX quint8 sous-performe (quantification ? pooling CLS ? absence de préfixe d'instruction ? à investiguer avant de l'écarter). Le RRF simple n'a PAS amélioré le dense seul ici : la fusion doit être pondérée/ajustée, et le jeu de test est trop petit pour conclure → à refaire avec plus de questions, validées par l'utilisateur (Q-29). Les 23 questions couvrent aussi un cas croisé langues (allemand, anglais).
⚠️ Les documents contiennent des données sensibles (identifiants/mots de passe dans un XLSX, IBAN, etc.) → impact sur l'envoi à Gemini (Q-06).

## 4. OCR (RapidOCR, ONNX, CPU)
- PDF scannés (rendu 150 dpi) : **3-6 s/page**, texte français correct (relevés, contrats, cartes grises…). JPG (724×1024 en fait, déjà petits) : 1,7-4,4 s/image.
- Les JPG du corpus B sont des documents bancaires scannés → OCR indispensable, donnée très sensible.
- Estimation : si ~10-15 % des 100 000 fichiers nécessitent l'OCR → ~15 000 × 4 s ≈ **17 h** en arrière-plan (parallélisable avec l'embedding mais les 4 cœurs sont partagés).
- Redimensionnement : plafonner le grand côté à ~1600 px avant OCR/stockage de miniature (aucune image gigantesque dans l'échantillon, à retester sur de grosses photos).

## 5. Reclassement (top-20 issus de e5-small, 23 questions)
| Reranker | Latence / requête (20 candidats) | recall@5 | MRR |
|---|---|---|---|
| (aucun) | — | 0,91 | 0,75 |
| mmarco-mMiniLMv2-L12 (Apache 2.0, multilingue incl. FR) | 2,4 s | 0,91 | 0,79 |
| bge-reranker-v2-m3 int8 (MIT) | 16,5 s | 0,91 | 0,80 |
Gain faible sur ce petit jeu, bge-m3 trop lent. → reranker **optionnel**, mmarco sur top-10/20 en second temps (affichage progressif : résultats immédiats, puis réordonnés). mxbai-rerank est surtout anglais, Jina v2 est CC-BY-NC → écartés (ADR-006).

## 6. PostgreSQL portable sous Windows — ✅ VALIDÉ
- Binaires officiels EDB (zip, sans installateur) PostgreSQL **17.11** : `tools/pgsql/` (hors git). `initdb` + démarrage + `psql` testés.
- **pgvector 0.8.6** : binaires Windows communautaires (andreiramani/pgvector_pgsql_windows, tag 0.8.6_17) copiés dans `tools/pgsql` → `CREATE EXTENSION vector` OK. ⚠️ binaire tiers : pour un produit distribué, **recompiler pgvector depuis les sources (MSVC)** ou vérifier la signature/hachage (SHA-256 du zip téléchargé : 420388e9…438e).
- Extensions natives disponibles : `unaccent`, `pg_trgm`, `fuzzystrmatch`, FTS config `french`.
- **BM25 vrai (pg_search/ParadeDB) : non supporté sous Windows** (dépend de pgrx). pg_textsearch : non confirmé. → Plan : FTS natif PostgreSQL (`french` + `unaccent`) pour le lexical, et option d'un BM25 calculé côté application si les mesures le justifient.
- Le test d'accents dans `psql` a échoué à cause de l'encodage du terminal Git-Bash (cp1252), pas de PostgreSQL → toujours passer les requêtes via le driver Node (UTF-8).

## 7. Extraction des anciens `.doc`
LibreOffice absent du PC. Options : parseur OLE « piece table » maison (rapide, permissif), ou embarquer LibreOffice headless (lourd, MPL) en fallback. Décision : tâche I-04b (écrire le parseur, fallback LibreOffice optionnel).

## 8. Conclusions R-02 (→ ADR-007)
1. **Embeddings : multilingual-e5-small** (ONNX) — meilleur et rapide. Granite R2 à réévaluer (non quantifié) mais non prioritaire.
2. **Recherche** : dense e5 + lexical (FTS français) avec fusion **pondérée** (RRF simple n'a pas aidé) ; reranker mmarco optionnel.
3. **Extraction** : pypdfium2 (permissif) + python-docx + openpyxl ; OCR RapidOCR en cascade pour PDF sans texte et images ; parseur .doc maison.
4. **Données** : PostgreSQL 17.11 portable + pgvector 0.8.6.
5. Volume : ~600 k chunks, ~14 h d'embedding + ~17 h d'OCR + ~2 h extraction ⇒ **première indexation complète ≈ 1,5 à 2 jours** en arrière-plan ; mode 2 passes pour rendre la recherche utilisable dès les premières heures.
6. Ce qui reste incertain : jeu de test petit (23 q.), fusion à régler, qualité sur gros volume (confusion entre milliers de factures similaires).
