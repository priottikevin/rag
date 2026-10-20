# R-03 — Test de charge : indexation complète d'un dossier réel (2026-10-20)

Corpus : dossier « Documents » de l'utilisateur (2 929 fichiers, 1,4 Go ; dossiers techniques exclus : Adobe, Visual Studio, etc.). Machine : i7-8550U, 4 cœurs, CPU only. Pipeline complet : scan → hash/dédup → extraction → OCR → chunks → embeddings e5-small (2 processus Python en parallèle : extraction/OCR et embeddings).

## Résultats
| Mesure | Valeur |
|---|---|
| Durée totale (15:07 → 18:30) | **≈ 3 h 20** |
| Fichiers indexés / en erreur | 2 496 / 1 (fichiers temporaires et dossiers exclus ignorés) |
| Documents / passages | 2 409 / 20 777 (≈ 8,6 passages par document) |
| Passages vectorisés | 16 825 (les passages « données brutes » restent lexicaux) |
| Taille de la base | **112 Mo** (→ ordre de grandeur ≈ 4-5 Go pour 100 000 fichiers) |
| Tâche `process` (hash+extraction+chunks) | 0,1 s en moyenne |
| Tâche `embed` (≈ 8 passages) | 1,1 s en moyenne |
| Tâche `ocr` | **8,5 s** en moyenne (1 471 tâches ≈ 3,5 h de calcul, chevauché avec les embeddings) |
| Qualité du texte | 769 natif · 1 272 OCR · 368 vides (photos sans texte) |

## Lecture
- L'OCR domine le temps : ce corpus est atypique (39 % de JPG, des photos). Les 8,5 s/tâche sont plus lents que le benchmark isolé (≈ 4 s) car les deux workers se partagent les 4 cœurs.
- Extrapolation à 100 000 fichiers (surtout PDF/DOCX/XLSX natifs) : ≈ 860 000 passages ⇒ ~30 h d'embeddings + OCR sur 10-15 % des fichiers (~25-35 h) ⇒ **2 à 3 jours** de travail de fond, avec recherche lexicale utilisable dès les premières heures (passe 1).
- Aucun plantage, reprises et files stables ; 1 échec (fichier illisible).

## Pistes d'optimisation (backlog)
1. Ne pas lancer l'OCR sur les photos sans texte (détection rapide : variance / présence de texte via le détecteur seul).
2. Limiter l'OCR aux PDF sans couche texte ; plafonner le nombre de pages OCR par document (déjà 60).
3. Régler la répartition des cœurs (OCR 2 threads / embeddings 2 threads) ou alterner par phases.
4. Index HNSW à créer une fois l'indexation de masse terminée (I-12).
5. Test à 20-50 k fichiers pour valider la tenue de la base et les temps de requête avant les 100 k.
