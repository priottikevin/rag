# QUESTIONS — Questions ouvertes (à discuter avec l'utilisateur)

Légende : 🔴 bloquant · 🟡 important · 🟢 détail. Statut : ❓ ouverte · ✅ répondue (→ reporter dans DECISIONS.md).
Dernière mise à jour : 2026-10-20

## A. Usage & données
| ID | Pri | Question | Statut | Réponse |
|----|-----|----------|--------|---------|
| Q-01 | 🔴 | Volume et types ? | ✅ | ~100 000 fichiers de 1 à 5 Mo (≈ 100-500 Go), surtout PDF, DOCX, XLSX, images. « Pour commencer » → prévoir de grossir. |
| Q-02 | 🔴 | Où sont les fichiers ? | ✅ | Sur le PC qui héberge le RAG. Python autorisé si utile. **Il faudra un installateur** pour installer sur d'autres PC. (Surveillance de dossiers : à reconfirmer, Q-19) |
| Q-03 | 🔴 | Référencer ou copier ? | ✅ (⚠️ à préciser Q-20) | « Pas de doublons » → on ne copie pas ; on référence le chemin d'origine + dédup par hash. |
| Q-04 | 🟡 | Audio/vidéo : à transcrire (Whisper local ?) ou ignorer pour l'instant ? | ❓ | |
| Q-05 | 🟡 | Documents scannés / images avec texte : OCR local (Tesseract/autre) accepté, qualité vs coût ? | ❓ | |
| Q-06 | 🟡 | Données sensibles (société, perso) : **rien ne doit sortir du PC** sauf Gemini ? Veux-tu pouvoir marquer des fichiers « jamais envoyés à l'IA » ? | ❓ | |

## B. Recherche & réponses
| ID | Pri | Question | Statut | Réponse |
|----|-----|----------|--------|---------|
| Q-07 | 🔴 | La page Recherche renvoie quoi ? | ✅ | Les deux : liste de passages/fichiers ET réponse rédigée avec citations. |
| Q-08 | 🟡 | Langues des documents ? (FR seul, FR+EN, autres) → impacte choix du modèle d'embedding. | ❓ | |
| Q-09 | 🟡 | Le chat doit-il être conversationnel (questions de suivi) ou une recherche « one-shot » ? | ❓ | |

## C. Technique & contraintes
| ID | Pri | Question | Statut | Réponse |
|----|-----|----------|--------|---------|
| Q-10 | 🔴 | Backend = Node.js ? | ✅ | Oui, Node. (TypeScript/Fastify : reco, à confirmer) |
| Q-11 | 🔴 | Matériel ? | ✅ | i7, 32 Go RAM, « le plus possible en local ». Détecté : i7-8550U (4 cœurs/8 threads), GPU NVIDIA MX150 2 Go (trop faible → **CPU only**), D: 420 Go libres / C: 10 Go libres. Node 25.8, Python 3.14.3. |
| Q-12 | 🟡 | Credentials Gemini : quel moyen (clé API AI Studio ou Vertex AI) ? À fournir quand on arrive à la 1re tâche IA obligatoire. Budget mensuel max ? | ❓ | |
| Q-13 | 🟡 | Gestionnaire de paquets/monorepo : pnpm workspaces (reco) ou npm/yarn ? | ❓ | |
| Q-14 | 🟢 | Lancement : un script unique `start` qui démarre Postgres portable + back + front ? Auto-démarrage Windows ? | ❓ | |

## D. Page 3 (rangement)
| ID | Pri | Question | Statut | Réponse |
|----|-----|----------|--------|---------|
| Q-15 | 🟢 | Catégories : définies par toi (société, perso, …) ou **découvertes automatiquement** (clustering) ? Les deux ? | ❓ | |
| Q-16 | 🟢 | Vue souhaitée : arborescence, tableau, cartes, carte mentale/graphe ? | ❓ | |

## F. Nouvelles questions (suite aux réponses du 2026-10-20)
| ID | Pri | Question | Statut | Réponse |
|----|-----|----------|--------|---------|
| Q-19 | 🔴 | Alimentation : dossiers racine à scanner (récursif, reprise, re-scan des changements) en plus du glisser-déposer ? | ✅ | Oui. |
| Q-20 | 🔴 | « Pas de doublons » = (a) pas de copie, on pointe vers l'original + (b) pas d'indexation double d'un contenu identique (on garde les 2 chemins) ? | ✅ | Oui, a+b. |
| Q-21 | 🔴 | Indexation locale CPU de 100 000 fichiers = heures à jours en arrière-plan : acceptable ? | ✅ | Oui, acceptable → embeddings 100 % locaux. |
| Q-22 | 🟡 | Les PC cibles de l'installateur sont-ils du même niveau (Windows, sans GPU) ? Installateur : un .exe unique (Inno Setup/MSI) qui embarque Postgres, Node et Python ? | ❓ | |
| Q-23 | 🟡 | Place disque : la base + index pour 100 000 fichiers fera ~20-60 Go. On la met sur D: (C: n'a que 10 Go libres). OK ? | ❓ | |
| Q-24 | 🟡 | Les XLSX : chercher dans les cellules texte seulement, ou aussi comprendre les tableaux/chiffres (ex. « total des ventes 2024 ») ? | ❓ | |

| Q-25 | 🔴 | Échantillon pour benchmarks R-02 | ✅ | Deux dossiers privés de l'utilisateur (corpus A : 412 fichiers, 143 Mo : 202 pdf, 89 docx, 62 **doc**, 32 xlsx, 9 csv, images ; corpus B : 142 fichiers, 49 Mo : 56 pdf, 46 docx, 30 jpg, 8 doc), non versionnés. Lecture seule. ⚠️ ~70 anciens `.doc` à gérer. |
| Q-26 | 🔴 | Langues des documents (= Q-08) | ✅ | Français. |
| Q-27 | 🟡 | Réponse générée : local ou Gemini ? | ✅ | Gemini (seuls les passages retenus envoyés). Credentials à fournir avant S-04 (Q-12). |
| Q-28 | 🟡 | Licence / redistribution | ✅ | Incertain, **peut devenir payant** → n'utiliser que des composants à licence permissive (éviter AGPL/CC-BY-NC) par précaution. |

| Q-29 | 🟡 | Jeu de test | ✅ | L'utilisateur délègue : questions inventées par Claude (bench/queries.json), à enrichir au fil de l'eau. Ne plus demander de validation (consigne : « tu as tous les pouvoirs »). |
| Q-30 | 🟡 | Données sensibles et Gemini | ✅ | Pas de credentials envoyés à Gemini si possible → ADR-008 (rédaction automatique + exclusions + fail-closed). |

| Q-31 | 🟡 | Glisser-déposer de fichiers isolés : le navigateur ne donne pas leur chemin d'origine. Acceptes-tu qu'on les copie dans `data/inbox` (seule exception à « pas de copie »), ou on se limite aux dossiers + dialogue de sélection de fichiers natif (chemin conservé) ? Reco : dialogue natif. | ❓ | |

## E. Cadrage
| ID | Pri | Question | Statut | Réponse |
|----|-----|----------|--------|---------|
| Q-17 | 🟡 | Usage mono-utilisateur local uniquement (localhost) ? Pas d'authentification pour l'instant ? | ❓ | |
| Q-18 | 🟡 | Ordre souhaité : livrer d'abord un **pipeline d'ingestion minimal bout-en-bout** (dépôt → stockage → recherche simple) puis raffiner le RAG ? (c'est ma recommandation) | ❓ | |
