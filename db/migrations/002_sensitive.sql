-- 002: marquage des documents sensibles (mots de passe / identifiants / secrets) -> jamais envoyés à un service externe (ADR-008)
UPDATE documents d SET meta = meta || '{"sensitive": true}'::jsonb
WHERE EXISTS (
  SELECT 1 FROM chunks c WHERE c.document_id = d.id
    AND c.text ~* '(\m(pass(word|wd)?|mot[s]? de passe|mdp|pwd|passphrase|secret|api[_ -]?key|client[_ -]?secret|private[_ -]?key)\M)'
);
