# STATUS — État courant (à relire en premier après CLAUDE.md)

Dernière mise à jour : 2026-10-20

## Phase actuelle
**Première version bout-en-bout fonctionnelle** (dépôt de dossiers → indexation en arrière-plan → recherche hybride → ouverture du fichier). Détails : `docs/sessions/2026-10-20_04_fondations.md`. Architecture : `docs/ARCHITECTURE.md`.

## Lancer le projet
`powershell -File scripts\start.ps1` → interface http://localhost:5173 (API 3001, PostgreSQL 54330). Logs : `data/api.log`, `data/web.log`, `data/pg.log`. Arrêt : `scripts\db.ps1 stop` + fermer les processus node. Prérequis déjà en place : `tools/pgsql` (hors git), `workers/python/.venv`, `npm install`.

## Dernier test de charge
R-03 : 2 929 fichiers indexés en ≈ 3 h 20 (OCR dominant), base 112 Mo, aucun plantage. Voir `docs/research/R-03_test-de-charge.md`. Dépôt GitHub public : https://github.com/priottikevin/rag (aucune donnée personnelle ; jeu de test privé `bench/queries.json` ignoré).

## Prochaines actions
1. S-06/I-11 : améliorer le classement (MRR 0,54 → >0,7) et plafonner les gros fichiers de données.
2. Clé Gemini : créer `.env` (modèle `.env.example`) → active la réponse rédigée (code et filtre de secrets déjà prêts).
3. I-04b parseur .doc, I-05 miniatures/réduction d'images, index HNSW, test de charge sur gros volume.
4. Page Rangement (phase 4).
5. Installateur (phase 5).

## Fait
- Ossature de docs créée (CLAUDE.md, docs/PROJECT, TASKS, STATUS, QUESTIONS, DECISIONS, sessions/).

## En cours
- D-02 : discussion avec l'utilisateur pour répondre aux questions de `docs/QUESTIONS.md` (priorité aux 🔴 : Q-01, Q-02, Q-03, Q-07, Q-10, Q-11).

## Réponses reçues (2026-10-20)
Q-01, 02, 03, 07, 10, 11 répondues (voir QUESTIONS.md, ADR-004/005). Nouvelles questions 🔴 : Q-19, Q-20, Q-21.

Q-19, Q-20, Q-21 répondues (oui / oui / acceptable). Les 🔴 de cadrage sont toutes levées. Restent Q-22 à Q-24 et les 🟡/🟢.

## Bloquants
Aucun. À fournir plus tard par l'utilisateur : clé Gemini (Q-12).

## Environnement
- OS : Windows 11 ; dossier : `d:\dev\rag` ; pas de dépôt git (à initialiser en F-01).
- Credentials Gemini : pas encore fournis (non nécessaires avant I-08).

## Sessions
Voir `docs/sessions/` (la plus récente en bas, ordre alphabétique = chronologique).
