// Ponuda: GET /api/events?live=0 (relay servira prematch katalog iz memorije).
// Ista struktura koju board dobija preko /ws/prematch.
import { HttpClient } from "./http.ts";

export interface Outcome {
  oddId: string;
  param: string;
  odds: number;
  label: string;
}
export interface Selection extends Outcome {
  eventId: string;
  sport: string;
  sportId: number;
  kickoff: number; // unix sekunde
  marketName: string;
  eventName: string;
}
export interface EventLite {
  id: string;
  name: string;
  sport: string;
  sportId: number;
  kickoff: number;
  outcomes: Selection[]; // sve validne selekcije ovog meca (svi marketi)
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Iz sirovog feed eventa izvuci sve validne (nesuspendovane) selekcije. */
function extractSelections(ev: any): Selection[] {
  const out: Selection[] = [];
  const eventId = String(ev?.id ?? "");
  if (!eventId) return out;
  const sport = String(ev?.sport ?? "");
  const sportId = num(ev?.sport_id);
  const kickoff = num(ev?.kickoff);
  const eventName = String(ev?.event ?? "");
  const buckets = [ev?.markets, ev?.custom_markets];
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    for (const m of bucket) {
      if (!m || m.suspended || !Array.isArray(m.outcomes)) continue;
      const marketName = String(m?.name ?? "");
      for (const o of m.outcomes) {
        if (!o || o.suspended) continue;
        const oddId = String(o?.odd_id ?? "");
        const odds = num(o?.value ?? o?.odds ?? o?.price);
        if (!oddId || odds <= 1) continue;
        out.push({
          eventId,
          sport,
          sportId,
          kickoff,
          eventName,
          marketName,
          oddId,
          param: String(o?.param ?? "").trim(),
          odds,
          label: String(o?.label ?? ""),
        });
      }
    }
  }
  return out;
}

/**
 * Povuci ponudu (prematch ili live) i vrati meceve sa validnim selekcijama.
 * mode="live" cita ?live=1 i zadrzava uzivo meceve; "prematch" cita ?live=0.
 */
export async function fetchOffer(
  http: HttpClient,
  mode: "prematch" | "live" = "prematch",
): Promise<EventLite[]> {
  const liveFlag = mode === "live" ? 1 : 0;
  const res = await http.get(`/api/events?live=${liveFlag}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`/api/events HTTP ${res.status}`);
  const data = await res.json();
  const events: any[] = Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [];
  const list: EventLite[] = [];
  for (const ev of events) {
    if (ev?.removed || ev?.suspend) continue;
    // prematch mod odbacuje live meceve; live mod uzima samo live.
    if (mode === "live" ? !ev?.live : ev?.live) continue;
    const sels = extractSelections(ev);
    if (!sels.length) continue;
    list.push({
      id: String(ev.id),
      name: String(ev?.event ?? ""),
      sport: String(ev?.sport ?? ""),
      sportId: num(ev?.sport_id),
      kickoff: num(ev?.kickoff),
      outcomes: sels,
    });
  }
  return list;
}

const FOOTBALL_RE = /fudbal|football|soccer/i;
export function isFootball(ev: EventLite): boolean {
  return FOOTBALL_RE.test(ev.sport) || ev.sportId === 1;
}
