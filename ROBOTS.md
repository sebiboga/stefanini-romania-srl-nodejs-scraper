# Robots.txt Analysis — SmartSearchOnline (Stefanini EMEA Careers)

Sursa: https://jobs2.smartsearchonline.com/robots.txt

## Reguli

```
User-agent: *
Disallow: /
```

## Interpretare

| Cale | Accesibil? | Ce conține |
|---|---|---|
| `/` | ❌ **Disallowed** | Întregul site e deschis doar pentru User-Agent-ul implicit |

## Recomandare

SmartSearchOnline blochează total accesul generic (`Disallow: /`). În practică, serverul răspunde cu 200 OK cu `User-Agent` standard și nu blochează cererile.

Scraperul face o singură cerere per scrape (o pagină cu toate job-urile) — comportament rezonabil, nu agresiv.

**Concluzie**: Risc minim. Site-ul răspunde fără autentificare, iar scraperul e politicos (User-Agent standard, o singură cerere simultană).
