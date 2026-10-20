# R-01 — État de l'art RAG (veille du 2026-10-20)

> Méthode : recherches web (blogs, comparatifs, preprints arXiv). **Les sources sont majoritairement des blogs/vendeurs : tous les chiffres sont indicatifs.** Aucune décision n'est figée sur la seule base de ce document : un benchmark local (tâche R-02) valide chaque choix sur le matériel réel (i7-8550U, CPU only) et sur de vrais documents.

## 1. Constats principaux
| Sujet | Consensus 2026 | Pertinence pour nous |
|---|---|---|
| Recherche | **Hybride** BM25 + vecteurs, fusion RRF, puis **reranker** cross-encoder = base de production | ✅ Indispensable |
| Contextual retrieval (préfixer chaque chunk d'un contexte du document) | Gain annoncé 35-67 % de moins d'échecs (chiffres divergents, à vérifier chez Anthropic) | ✅ mais version **déterministe** (titre, chemin, section, nom de feuille) d'abord ; version LLM seulement ciblée (coût CPU énorme sur 2 M de chunks) |
| Late-interaction visuelle (ColPali/ColQwen/ColSmolVLM/ColFlor) | Puissant pour PDF visuels, mais lourd (VRAM, ~Mo par page) ; modèles réduits ColFlor 174 M / ColSmolVLM 256-500 M | ⚠️ Trop lourd pour 100 000 fichiers sur CPU en systématique ; envisageable en **option ciblée** (pages difficiles/scannées) |
| RAG agentique | Requête décomposée/routée, retrieval itératif ; tendance forte | ✅ côté **requête** (reformulation, routage simple vs complexe) ; ❌ pas d'agents lourds à l'ingestion |
| GraphRAG / LightRAG | Utile pour questions globales/multi-saut, mais coût d'extraction LLM très élevé | ⚠️ Remplacer par graphe **déterministe** (liens entre docs : dossiers, entités extraites par règles, similarité) ; LLM optionnel plus tard |
| Sparse appris (SPLADE) | Gagne du terrain face à BM25 | 🔎 à évaluer, pas prioritaire |

## 2. PostgreSQL
- **pgvector** (HNSW/IVFFlat) : base standard. ~2 M de chunks 384-d ≈ 3 Go de vecteurs : tient largement.
- **pgvectorscale** (StreamingDiskANN) : utile pour dizaines de millions de vecteurs → **inutile** à notre échelle.
- BM25 : **ParadeDB pg_search** ou **pg_textsearch (Tiger Data)** apportent un vrai BM25 ; sinon FTS natif (`tsvector`, `ts_rank`, config `french`), moins bon.
- ⚠️ **Aucune source ne confirme le support Windows** de ces extensions. À vérifier (R-02) : binaires Windows de pgvector, pg_search/pg_textsearch ; sinon compiler (MSVC) ou se rabattre sur FTS natif + pgvector.
- Mesure rapportée : le passage de AND à OR dans la requête FTS a fait passer recall@10 de 0,39 à 0,68 → soigner la construction de requête.

## 3. Embeddings locaux (CPU)
Candidats (à benchmarker en FR sur CPU, ONNX int8) :
| Modèle | Taille | Remarque |
|---|---|---|
| **IBM Granite Embedding Multilingual R2** | 97 M, 384 d, contexte 32 K | ONNX/OpenVINO fournis, Apache 2.0, « meilleur sous 100 M » (annoncé) — **favori à tester** |
| multilingual-e5-small | ~21-118 M | Valeur sûre, rapide |
| EmbeddingGemma-300M | 300 M | 100+ langues, quantifiable |
| Qwen3-Embedding-0.6B | 0,6 B | Meilleure qualité sub-1 Go (MTEB multi ~64) mais plus lent sur CPU |
| BGE-M3 | 567 M | Dense + sparse + multi-vecteur en un modèle, mais lourd |
| Modèles statiques (Model2Vec) | minuscules | Ultra rapides mais qualité insuffisante en FR → écartés |
Ordre de grandeur à mesurer : 100 000 fichiers × ~20 chunks ≈ 2 M chunks ; si le petit modèle fait 30-60 chunks/s sur ce CPU → ~10 à 20 h. Un modèle 0,6 B serait 5-10× plus lent (jours).
Piste : **Matryoshka / troncature de dimensions** et quantification des vecteurs (halfvec/binaire) pour réduire stockage et temps.

## 4. Reranking (CPU)
- bge-reranker-v2-m3 : trop lent sur CPU (~2 s pour 30 documents) → seulement top ~20.
- **mxbai-rerank xsmall/base v2** (Apache 2.0, rapide) et Jina reranker v2 multilingue (licence à vérifier, v3 = CC-BY-NC) : pistes légères.
- Plan : reranker uniquement sur les ~20-30 meilleurs candidats ; mesurer la latence.

## 5. Extraction de documents (local)
- **PDF numériques** : PyMuPDF/PyMuPDF4LLM (très rapide ; ⚠️ licence AGPL → à examiner pour un installateur redistribué) ; alternatives permissives à évaluer (pypdfium2, pdfplumber, pdfminer).
- **Layout/tableaux** : **Docling** (IBM, MIT, CPU, OCR intégré) meilleur mais 5-30× plus lent (~40-80 s pour 30 pages) et ~2,4 Go d'install → trop lent pour tout, à réserver aux PDF complexes.
- **OCR CPU** : RapidOCR (ONNX) / Tesseract pour scans et images.
- **DOCX/XLSX** : MarkItDown (Microsoft) ou bibliothèques directes (python-docx, openpyxl) ; XLSX demande un traitement spécial (feuilles, en-têtes, tableaux).
- Stratégie **en cascade** : extracteur rapide → détection « qualité insuffisante / pas de texte » → OCR → (option) Docling.

## 6. LLM local pour la réponse citée (CPU)
- i7-8550U, DDR4 : un modèle 4B Q4 fera quelques tokens/s ; 8B plus lent encore. Candidats : Qwen3(.5) 4B/8B, Gemma 3 4B, Granite 3.3 8B. Qualité en français non benchmarquée dans les sources → **test obligatoire**.
- Option hybride : génération par **Gemini** (seuls les passages retenus sont envoyés, pas les fichiers) ; local par défaut. À trancher avec l'utilisateur (Q-06, Q-12).

## 7. Proposition d'architecture (hypothèse à valider — pas encore une décision)
```
INGESTION (arrière-plan, reprenable, Node orchestre / Python extrait)
 scan dossiers → hash (dédup) → type → extraction en cascade (rapide→OCR→Docling si besoin)
 → images réduites + miniatures → chunking structurel (titres/sections/feuilles/pages)
 → contexte déterministe préfixé (chemin, titre, section) → embeddings locaux (ONNX int8)
 → PostgreSQL : documents(+chemins multiples), chunks, tsvector/BM25, vecteurs, métadonnées, liens

RECHERCHE
 requête → (routage simple/complexe, reformulation légère) → BM25 ∥ vecteurs → RRF
 → rerank léger top-N → affichage passages + fichiers (ouvrir original)
 → réponse citée (LLM local ou Gemini) avec numéros de sources cliquables

RANGEMENT (page 3, plus tard) : clustering sur les embeddings existants (sans LLM) + libellés auto
```
Originalité visée (sans surcoût IA) : contexte déterministe riche, **chunks à 2 niveaux** (petits pour la précision, parents pour la réponse), graphe de relations par règles, ingestion en **deux passes** (passe 1 rapide texte seul → recherche utilisable très tôt ; passe 2 enrichissements en arrière-plan), recherche **routée** selon le type de question, évaluation continue sur jeu de requêtes de test.

## 8. Prochaines étapes
1. **R-02** — Benchmarks locaux : vitesse/qualité de 3-4 modèles d'embedding et 2 rerankers sur un échantillon réel de tes fichiers (FR) ; vitesse d'extraction PDF/DOCX/XLSX/OCR ; disponibilité Windows de pgvector et BM25.
2. D-03 — Figer l'architecture et les ADR.

## Sources
- [Hybrid Search in PostgreSQL: The Missing Manual (ParadeDB)](https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual)
- [Full-Text vs pgvector vs Hybrid Search, Measured](https://dev.to/devopsdaily/full-text-vs-pgvector-vs-hybrid-search-measured-50jj)
- [pgvector, pgvectorscale and the Postgres Vector Search Stack](https://www.softwareseni.com/pgvector-pgvectorscale-and-the-postgres-vector-search-stack-explained/)
- [From ts_rank to BM25 — pg_textsearch (Tiger Data)](https://www.tigerdata.com/blog/introducing-pg_textsearch-true-bm25-ranking-hybrid-retrieval-postgres)
- [Granite Embedding Multilingual R2](https://huggingface.co/blog/ibm-granite/granite-embedding-multilingual-r2)
- [The Best Open-Source Embedding Models in 2026 (BentoML)](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)
- [Best Open-Source Embedding and Reranker Models 2026](https://builderai.tools/blog/best-open-source-embedding-models-2026)
- [Best Rerankers for RAG in 2026](https://mixpeek.com/curated-lists/best-rerankers)
- [Reranker for RAG: Cohere, BGE, Jina, Voyage](https://ianas.fr/en/blog/2026/06/07/reranker-comparatif-cohere-bge-jina-voyage/)
- [Best Visual Document Retrieval Models in 2026](https://mixpeek.com/curated-lists/best-visual-document-retrieval-models)
- [ColFlor](https://huggingface.co/blog/ahmed-masry/colflor)
- [RAG State of the Art 2026 (GitHub)](https://github.com/dpsdagain/RAG/blob/main/rag_state_of_the_art_2026.md)
- [12 Advanced RAG Techniques (Atlan)](https://atlan.com/know/advanced-rag-techniques/)
- [Best Open-Source PDF-to-Markdown Tools 2026](https://themenonlab.blog/blog/best-open-source-pdf-to-markdown-tools-2026)
- [MarkItDown vs Docling vs Marker](https://www.danilchenko.dev/posts/markitdown-vs-docling-vs-marker/)
- [PyMuPDF4LLM vs Docling](https://www.file2markdown.ai/blog/pymupdf4llm-vs-docling)
- [Best CPU-only local LLMs in 2026](https://www.popularai.org/p/best-cpu-only-local-llm-2026)
