# PROJECT — Vision & exigences

> Source : demande initiale de l'utilisateur (reformulée, dictée à la voix → certains mots sont déformés ; les interprétations incertaines sont marquées ⚠️ et listées dans QUESTIONS.md).
> Dernière mise à jour : 2026-10-20

## 1. But
Une plateforme personnelle de **RAG** (Retrieval-Augmented Generation) qui ingère **n'importe quel fichier**, le stocke de façon exploitable, et permet de le retrouver/interroger — avec un RAG **original, moderne, non standard** (état de l'art actuel, pas une architecture vieille de 6 mois).

## 2. Pages
| # | Page | Rôle | Priorité |
|---|------|------|----------|
| 1 | **Recherche** | Interroger la base, voir résultats + sources, ouvrir le fichier d'origine d'un clic | Haute |
| 2 | **Dépôt (ingestion)** | Déposer des fichiers ; le traitement tourne **en arrière-plan** et continue même si on change de page | **Très haute (priorité n°1 avec le RAG)** |
| 3 | **Rangement / Vue d'ensemble** | Organisation intelligente de tout le contenu (ex. « tout ce qui concerne ma société » avec liens vers les fichiers). Peut être générée par IA si nécessaire. | Basse (plus tard) |

## 3. Exigences fonctionnelles
- **Tout type de fichier** accepté (documents, images, tableurs, code, archives, audio/vidéo ?⚠️…).
- **Ingestion en arrière-plan** : file de jobs persistante, progression visible, reprise après redémarrage, indépendante de la navigation front.
- **Conservation du chemin d'origine** des fichiers : depuis un résultat, un clic ouvre/affiche le fichier original.
- **Images énormes → réduites** (redimensionnement/compression) pour limiter stockage et coût.
- **IA minimale** : traitement déterministe/local autant que possible ; recours à l'IA (Gemini, credentials fournis par l'utilisateur plus tard) seulement quand c'est obligatoire.
- **Base PostgreSQL** créée par nous, via **binaires portables** téléchargés (pas d'installation système).
- Tri/rangement intelligent (page 3) : non prioritaire.

## 4. Exigences techniques
- **Monorepo**.
- **Front : React**.
- **Back : Node.js** ⚠️ (« Notre » dans la dictée = très probablement Node — à confirmer).
- **PostgreSQL** portable.
- Windows 11, répertoire de travail `d:\dev\rag`.

## 5. Exigence « qualité RAG » (le cœur du projet)
Pas de RAG naïf (chunk fixe + embedding + top-k). Viser une architecture récente, vérifiée par veille :
- recherche **hybride** (plein texte/BM25 + vectoriel) + **reranking** ;
- **chunking intelligent** (structure du document, sémantique) + **contexte enrichi par chunk** (contextual retrieval) ;
- gestion **multimodale / visuelle** (pages PDF/images, retrieval visuel type late-interaction) ;
- éventuellement **graphe de connaissances / hiérarchie** (GraphRAG-like) et **récupération agentique** (la requête est planifiée/reformulée) ;
- embeddings **locaux** quand possible pour limiter le coût/IA ;
- déduplication par hash, versionnage, métadonnées riches.
Toutes ces pistes sont des **hypothèses à valider par recherche web** (tâche R-01) avant décision.

## 6. Mode de travail
Co-construction : l'IA pose beaucoup de questions, ne devine pas. Documentation continue (voir CLAUDE.md).

## 7. Hors périmètre (pour l'instant)
Multi-utilisateur/auth, déploiement cloud, mobile. ⚠️ À confirmer.
