// Izbor parova za jedan tiket po pravilima iz spiska:
//  - 30% singl (1 par), inace 2..7 parova
//  - 50% sansa da par bude fudbal
//  - mec pocinje najdalje za 24h (i jos nije poceo)
//  - nijedna pojedinacna kvota > 5 (ni <= 1)
//  - jedan mec = jedan par
//  - sport/igra na slucajan uzorak
import { config } from "./config.ts";
import { type EventLite, type Selection, isFootball } from "./feed.ts";

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function choice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Selekcije jednog meca koje prolaze granicu kvote. */
function eligibleOutcomes(ev: EventLite): Selection[] {
  return ev.outcomes.filter((o) => o.odds > 1 && o.odds <= config.maxOdds);
}

/** Vrati listu selekcija za jedan tiket, ili [] ako nema dovoljno ponude. */
export function buildTicket(offer: EventLite[]): Selection[] {
  const now = Math.floor(Date.now() / 1000);
  const horizon = now + config.maxHoursAhead * 3600;

  // Prematch: mec u prozoru [sada, +24h]. Live: mec je vec poceo, bez prozora.
  const inWindow = (ev: EventLite): boolean =>
    config.mode === "live" ? true : ev.kickoff > now && ev.kickoff <= horizon;

  // Kandidati: prolaze prozor i imaju bar jednu selekciju u granici kvote.
  const pool = offer.filter((ev) => inWindow(ev) && eligibleOutcomes(ev).length > 0);
  if (!pool.length) return [];

  const football = pool.filter(isFootball);
  const other = pool.filter((ev) => !isFootball(ev));

  // Koliko parova.
  let legs =
    Math.random() < config.singleProb
      ? 1
      : randInt(Math.max(2, config.legsMin), config.legsMax);
  legs = Math.min(legs, pool.length);

  const usedEvents = new Set<string>();
  const picks: Selection[] = [];

  for (let i = 0; i < legs; i++) {
    // Fudbal sa zadatom verovatnocom, inace ostalo; sa fallbackom ako je prazno.
    let wantFootball = Math.random() < config.footballProb;
    let source = wantFootball ? football : other;
    let avail = source.filter((ev) => !usedEvents.has(ev.id));
    if (!avail.length) {
      // izabrani bazen prazan -> uzmi iz drugog
      source = wantFootball ? other : football;
      avail = source.filter((ev) => !usedEvents.has(ev.id));
    }
    if (!avail.length) {
      // nista vise -> uzmi iz celog bazena
      avail = pool.filter((ev) => !usedEvents.has(ev.id));
    }
    if (!avail.length) break;

    const ev = choice(avail);
    usedEvents.add(ev.id);
    const outs = eligibleOutcomes(ev);
    if (!outs.length) continue;
    picks.push(choice(outs));
  }

  return picks;
}

export function slipKey(s: Selection): string {
  return `${s.eventId}|${s.oddId}|${s.param}`;
}

export function randomStake(): number {
  // Ceo dinar u rasponu [stakeMin, stakeMax].
  return randInt(Math.ceil(config.stakeMin), Math.floor(config.stakeMax));
}
