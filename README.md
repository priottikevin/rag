# RAG local

Moteur de recherche et de questions-réponses **100 % local** sur ses propres documents (PDF, Word, Excel, images scannées…), conçu pour tourner sur un PC ordinaire, **sans GPU**.

Vous indiquez des dossiers ; l'indexation tourne **en arrière-plan** (même si vous changez de page ou fermez l'onglet), puis vous retrouvez n'importe quel document par le sens ou par les mots, et ouvrez le fichier d'origine d'un clic. Une réponse rédigée avec citations peut être générée par Gemini, **après masquage automatique des données sensibles**.

> Statut : prototype fonctionnel de bout en bout (voir [docs/STATUS.md](docs/STATUS.md)).

## Points clés

- **Pas de RAG naïf** : recherche **hybride** (mots-clés PostgreSQL en français + vecteurs sémantiques `multilingual-e5-small`), fusion pondérée, puis **reclassement** par un cross-encoder multilingue. Les passages « données brutes » (listes de chiffres, CSV) sont écartés de la recherche sémantique.
- **Contexte déterministe par passage** (dossier, nom de fichier, feuille) sans appel à une IA : coût nul, indexation rapide.
- **Indexation robuste** : file de tâches persistante dans PostgreSQL (`SKIP LOCKED`), reprise après redémarrage, nouvelles tentatives, pause/reprise, progression en direct (SSE).
- **Aucune copie des fichiers** : seuls les chemins sont enregistrés ; déduplication par hash (un contenu identique à deux endroits = un seul index, deux chemins).
- **OCR local** (RapidOCR/ONNX) pour les PDF scannés et les images, avec réduction des grandes images.
- **Optimisé CPU** : modèles ONNX quantifiés, mesures réelles sur un i7 de 8ᵉ génération (voir [docs/research/R-02_benchmarks.md](docs/research/R-02_benchmarks.md)).
- **Confidentialité** : tout reste local sauf, si vous l'activez, les quelques extraits envoyés à Gemini. Avant l'envoi, un filtre masque IBAN, RIB, cartes bancaires, clés API et mots de passe, **exclut** les documents contenant des identifiants et les dossiers marqués « confidentiel », et journalise chaque envoi (voir [ADR-008](docs/DECISIONS.md)). En cas de doute, rien n'est envoyé.
- **PostgreSQL portable** (binaires officiels EDB + pgvector) : aucune installation système.

## Architecture

```
React (Vite)  ──HTTP/SSE──►  API Node (Fastify, TypeScript)  ──►  PostgreSQL 17 + pgvector
 Recherche / Dépôt / Rangement      │ file de tâches, recherche, ouverture de fichiers
                                    ▼
                          Worker Python (JSON-lines)
                          extraction · OCR · embeddings · reranking (ONNX Runtime, CPU)
```

Détails : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Choix et mesures : [docs/DECISIONS.md](docs/DECISIONS.md), [docs/research/](docs/research/).

## Démarrage (Windows)

Prérequis : Node.js ≥ 22, Python ≥ 3.11, PowerShell.

```powershell
npm install
npm run build -w @rag/shared

# Python (extraction / OCR / embeddings)
python -m venv workers\python\.venv
workers\python\.venv\Scripts\python -m pip install -r workers\python\requirements.txt

# PostgreSQL portable : télécharger le zip « binaries » EDB (17.x) dans tools\pgsql
# et les binaires pgvector Windows correspondants dans tools\pgsql (lib\ et share\extension\)
powershell -File scripts\db.ps1 init

# (optionnel) réponses rédigées : copier .env.example en .env et renseigner GEMINI_API_KEY

powershell -File scripts\start.ps1      # ouvre http://localhost:5173
```

Puis, page **Dépôt** : choisissez un dossier à indexer. Les modèles ONNX sont téléchargés automatiquement au premier usage.

## Structure

| Dossier | Rôle |
|---|---|
| `apps/web` | Interface React (3 pages) |
| `apps/api` | API, orchestration des tâches, recherche, filtre de secrets, Gemini |
| `workers/python` | Extraction, OCR, embeddings, reranking |
| `packages/shared` | Types partagés |
| `db/migrations` | Schéma SQL versionné |
| `scripts` | Démarrage / base de données |
| `bench` | Scripts de benchmark (jeu de test privé non versionné, exemple fourni) |
| `docs` | Vision, architecture, décisions, tâches, journal des sessions |

## Documentation de projet

Le projet est entièrement documenté pour permettre une reprise à froid : [CLAUDE.md](CLAUDE.md) → [docs/STATUS.md](docs/STATUS.md) → [docs/TASKS.md](docs/TASKS.md).

## Licence

Tous droits réservés — voir [LICENSE](LICENSE). Code visible à titre de démonstration.
