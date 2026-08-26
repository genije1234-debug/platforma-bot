# PLATFORMA BOT

Load-test bot za kladionicu (SinglBet) — simulira igrače da bi se videlo kako
platforma trpi opterećenje. Svaki bot je jedan nalog: loguje se, povlači ponudu,
sastavlja tiket po pravilima i uplaćuje ga u zadatom ritmu.

## Šta radi (pravila)

- 20 (ili koliko naloga daš) botova, kreću **istovremeno**
- **1 tiket u minuti** po botu
- **1–7 parova** po tiketu; **30%** tiketa su singlovi
- **50%** parova je fudbal
- samo mečevi koji počinju **najdalje za 24h**
- nijedna pojedinačna **kvota > 5**
- ulog **100–500 RSD** (slučajno)
- posle **100 tiketa** svaki bot pauzira **1–30 min** (raspad sinhronizacije)
- sport i igra na slučajan uzorak

## Zahtevi

- Node.js **22+** (koristi nativni `fetch`; `.ts` se pokreće bez build koraka).
  Testirano na Node 24.

## Podešavanje

1. Kopiraj `.env.example` u `.env` i popuni:
   ```
   BASE_URL=http://www.singlbet.com
   ACCOUNTS=korisnik1:lozinka1,korisnik2:lozinka2,...
   ```
   Koliko naloga u `ACCOUNTS` — toliko botova.
2. (opciono) Parametri opterećenja se menjaju u `.env` ili `scenarios/default.json`.

## Pokretanje

```bash
# svi botovi (jedan po nalogu iz ACCOUNTS)
node src/index.ts

# proba: samo 1 bot
node src/index.ts --bots=1

# suvi hod (sve do slanja, ali BEZ prave uplate) — za proveru logike
node src/index.ts --bots=1 --dry-run=1
```

Prekid: `Ctrl+C`.

## Kako radi (tehnički)

Reverse-inženjerovano iz koda same platforme:

- **Login:** `POST /user/login` (uz `_token` sa `GET /user/login`)
- **Ponuda:** `GET /api/events?live=0` (prematch katalog iz feed relay-a)
- **Dodaj par:** `GET /bet/add-to-bet-slip?event_id=&odd_id=&param=&odds=`
  (par se čuva u serverskoj sesiji)
- **Odigraj:** `POST /user/bet/place-bet` sa `stake_amount` + `selections` (JSON)

## Struktura

- `src/config.ts` — učitavanje `.env` / scenarija / CLI
- `src/http.ts` — HTTP klijent sa cookie-jar + CSRF (po botu)
- `src/session.ts` — login
- `src/feed.ts` — povlačenje i parsiranje ponude
- `src/pick.ts` — izbor parova po pravilima
- `src/bot.ts` — jedan bot (petlja: ponuda → tiket → uplata → pauza)
- `src/index.ts` — podiže sve botove istovremeno

## Pravila korišćenja

- Koristi se **samo** na sopstvenoj infrastrukturi (ovo je load test tvoje platforme).
- Kredencijali idu u `.env` (nikad u git). Vidi `.env.example`.
