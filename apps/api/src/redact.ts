/** Rédaction des secrets avant tout envoi à un service externe (ADR-008). Fail-closed : en cas de doute, on bloque. */

/** En-têtes / mots qui signalent des identifiants : le document entier est alors exclu de l'envoi externe. */
export const SENSITIVE_MARKER = /\b(pass(word|wd)?|mot[s]? de passe|mdp|pwd|passphrase|secret|api[_ -]?key|client[_ -]?secret|token|private[_ -]?key|identifiants?|credentials?)\b/i;

const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;
const BIC_LABELED = /\b(?:BIC|SWIFT)\s*:?\s*[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/gi;
const RIB = /\d{5}[ ]?\d{5}[ ]?[A-Z0-9]{11}[ ]?\d{2}/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
const KEY_VALUE = /\b(pass(?:word|wd)?|mot[s]? de passe|mdp|pwd|secret|token|api[_ -]?key|login|identifiant|username)\s*[:=]\s*\S+/gi;
const LONG_TOKEN = /\b(?:sk|pk|AIza|ghp|gho|xox[bap]|AKIA)[-_A-Za-z0-9]{16,}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g;

function luhn(digits: string): boolean {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

export interface Redacted { text: string; count: number }

export function redact(input: string): Redacted {
  let count = 0;
  const sub = (re: RegExp, repl: string | ((m: string, ...g: string[]) => string)) => {
    input = input.replace(re, (...a) => { count++; return typeof repl === "string" ? repl : repl(a[0], ...(a.slice(1) as string[])); });
  };
  sub(KEY_VALUE, (_m, k) => `${k}: [SECRET MASQUÉ]`);
  sub(LONG_TOKEN, "[CLÉ MASQUÉE]");
  sub(BEARER, "Bearer [JETON MASQUÉ]");
  sub(IBAN, "[IBAN MASQUÉ]");
  sub(RIB, "[RIB MASQUÉ]");
  sub(BIC_LABELED, "BIC [MASQUÉ]");
  input = input.replace(CARD, (m) => {
    const d = m.replace(/[ -]/g, "");
    if (d.length >= 13 && d.length <= 19 && luhn(d)) { count++; return "[CARTE MASQUÉE]"; }
    return m;
  });
  return { text: input, count };
}

/** Un passage est « bloqué » (jamais envoyé) s'il évoque des identifiants ou si trop de masquages ont été nécessaires. */
export function isBlocked(text: string, redactions: number): boolean {
  return SENSITIVE_MARKER.test(text) || redactions >= 3;
}
