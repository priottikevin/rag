"""Évalue l'API de recherche réelle sur bench/queries.json. Usage : python eval_api.py "wd=1&wl=0.6" [-v]"""
import json, urllib.request, urllib.parse, sys
EXTRA = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else ""
VERBOSE = "-v" in sys.argv
import os
Q = json.load(open('queries.json' if os.path.exists('queries.json') else 'queries.example.json', encoding='utf-8')); r5 = r10 = mrr = 0; miss = []
for q in Q:
    url = "http://127.0.0.1:3001/api/search?limit=10&" + EXTRA + "&q=" + urllib.parse.quote(q['q'])
    d = json.load(urllib.request.urlopen(url))
    pos = next((i for i, h in enumerate(d['hits']) if any(e.lower() in p.lower() for p in h['paths'] for e in q['exp'])), None)
    if pos is None: miss.append((q['q'], [h['title'] for h in d['hits'][:3]]))
    else: mrr += 1 / (pos + 1); r5 += pos < 5; r10 += pos < 10
n = len(Q); print(f"[{EXTRA}] recall@5={r5/n:.2f} recall@10={r10/n:.2f} MRR={mrr/n:.2f}")
if VERBOSE:
    for m in miss: print("MISS", m)
