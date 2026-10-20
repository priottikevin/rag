# CLAUDE.md — À LIRE EN PREMIER (point d'entrée pour tout contexte vide)

Si tu démarres sans mémoire : lis dans cet ordre
1. `docs/PROJECT.md` — vision, périmètre, exigences (le « pourquoi » et le « quoi »)
2. `docs/STATUS.md` — où on en est EXACTEMENT, prochaine action (le « maintenant »)
3. `docs/TASKS.md` — backlog maître avec statuts
4. `docs/DECISIONS.md` — décisions prises (ne pas les remettre en cause sans accord)
5. `docs/QUESTIONS.md` — questions ouvertes à poser à l'utilisateur
6. Le dernier fichier de `docs/sessions/` — détail de la dernière session

## Règles de travail (imposées par l'utilisateur)
- Langue : français avec l'utilisateur.
- NE PAS interpréter à sa place : en cas de doute, poser la question (voir `docs/QUESTIONS.md`). L'utilisateur veut co-construire.
- À CHAQUE lancement d'un chantier : créer `docs/sessions/AAAA-MM-JJ_NN_titre.md` (gabarit : `docs/sessions/_TEMPLATE.md`), le tenir à jour pendant le travail, le clore à la fin.
- Mettre à jour `docs/STATUS.md` et `docs/TASKS.md` à chaque étape terminée (pas en fin de journée : au fil de l'eau).
- Toute décision structurante → `docs/DECISIONS.md` (ADR court).
- Docs très complètes et très propres : un lecteur sans contexte doit pouvoir reprendre immédiatement.
- Minimiser l'usage de l'IA (coût) : préférer les méthodes déterministes/locales ; IA (Gemini) seulement quand nécessaire. Ne jamais committer de credentials (`.env` ignoré).
- Rester à jour sur l'état de l'art RAG (pas de RAG « standard » obsolète) : vérifier par recherche web avant de figer un choix technique.

## Stack visée (à confirmer, cf. DECISIONS.md)
Monorepo · Front React · Back Node.js · PostgreSQL portable (binaires, sans install système) · Windows 11.
