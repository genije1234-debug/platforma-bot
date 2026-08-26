// Jedan bot: login pa u petlji igra po jedan tiket u zadatom ritmu.
import { config, type Account } from "./config.ts";
import { Session } from "./session.ts";
import { fetchOffer } from "./feed.ts";
import { buildTicket, slipKey, randomStake } from "./pick.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

export class Bot {
  private session: Session;
  private tickets = 0;
  private ok = 0;
  private fail = 0;
  private acc: Account;
  private id: number;
  constructor(acc: Account, id: number) {
    this.acc = acc;
    this.id = id;
    this.session = new Session(config.baseUrl, acc.username, acc.password);
  }

  private log(msg: string): void {
    console.log(`[${ts()}] bot#${this.id} ${this.acc.username}: ${msg}`);
  }

  async start(): Promise<void> {
    try {
      const ok = await this.session.login();
      if (!ok) {
        this.log("LOGIN NEUSPEO — proveri kredencijale");
        return;
      }
      await this.session.refreshCsrf();
      this.log("ulogovan");
    } catch (e) {
      this.log(`login greska: ${(e as Error).message}`);
      return;
    }
    // Beskonacna petlja; prekid je Ctrl+C.
    for (;;) {
      const started = Date.now();
      try {
        await this.playOne();
      } catch (e) {
        this.fail++;
        this.log(`greska u rundi: ${(e as Error).message}`);
      }

      this.tickets++;
      // Pauza posle N tiketa (raspad sinhronizacije).
      if (config.ticketsBeforePause > 0 && this.tickets % config.ticketsBeforePause === 0) {
        const mins = randInt(config.pauseMinMin, config.pauseMaxMin);
        this.log(`pauza ${mins} min posle ${this.tickets} tiketa (ok=${this.ok} fail=${this.fail})`);
        await sleep(mins * 60_000);
        continue;
      }
      // Ritam: jedan tiket na ticketIntervalSec (racunaj utroseno vreme).
      const elapsed = Date.now() - started;
      const wait = config.ticketIntervalSec * 1000 - elapsed;
      if (wait > 0) await sleep(wait);
    }
  }

  private async playOne(): Promise<void> {
    // 1) Ocisti eventualni zaostali slip iz sesije.
    await this.postSafe("/bet/remove-all", {});

    // 2) Ponuda.
    const offer = await fetchOffer(this.session.http);
    if (!offer.length) {
      this.log("ponuda prazna — preskacem rundu");
      return;
    }

    // 3) Izbor parova po pravilima.
    const picks = buildTicket(offer);
    if (!picks.length) {
      this.log("nema pogodnih parova (≤24h, kvota≤5) — preskacem");
      return;
    }

    // 4) Dodaj svaku selekciju u slip (GET, bez CSRF).
    let added = 0;
    for (const p of picks) {
      const qs = new URLSearchParams({
        event_id: p.eventId,
        odd_id: p.oddId,
        param: p.param,
        odds: String(p.odds),
      }).toString();
      const res = await this.session.http.get(`/bet/add-to-bet-slip?${qs}`);
      const body = await res.text();
      // Odgovor je HTML partial na uspeh, ili JSON {error:...} na gresku.
      if (/"error"/.test(body) && body.trim().startsWith("{")) {
        // preskoci ovu selekciju
        continue;
      }
      added++;
    }
    if (added === 0) {
      this.log("nijedna selekcija nije primljena — preskacem");
      return;
    }

    // 5) Odigraj.
    const stake = randomStake();
    const selections = JSON.stringify(
      picks.map((p) => ({ slip_key: slipKey(p), odds: p.odds })),
    );

    if (config.dryRun) {
      this.ok++;
      this.log(`[DRY] tiket: ${added} par(ova), ulog ${stake} RSD — nije poslato`);
      return;
    }

    const res = await this.session.http.postForm("/user/bet/place-bet", {
      stake_amount: String(stake),
      selections,
      ...(this.session.csrf ? { _token: this.session.csrf } : {}),
    });

    // 302 je uspeh SAMO ako ne vodi na login (izgubljena sesija).
    const loc = res.headers.get("location") ?? "";
    if (res.status >= 300 && res.status < 400) {
      if (/login/i.test(loc)) {
        this.fail++;
        this.log("ODBIJEN: sesija istekla (redirect na login)");
        return;
      }
      this.ok++;
      this.log(`ODIGRAN: ${added} par(ova), ulog ${stake} RSD (redirect ${loc || "back"})`);
      return;
    }

    const body = await res.text();
    if (/name=["']password["']/i.test(body)) {
      this.fail++;
      this.log("ODBIJEN: nije ulogovan");
      return;
    }
    const rejected = /nedovoljno|error|greska|nije /i.test(body);
    if (rejected) {
      this.fail++;
      this.log(`ODBIJEN (HTTP ${res.status}): ${body.replace(/\s+/g, " ").slice(0, 140)}`);
    } else {
      this.ok++;
      this.log(`ODIGRAN: ${added} par(ova), ulog ${stake} RSD (HTTP ${res.status})`);
    }
  }

  private async postSafe(path: string, form: Record<string, string>): Promise<void> {
    try {
      await this.session.http.postForm(path, {
        ...form,
        ...(this.session.csrf ? { _token: this.session.csrf } : {}),
      });
    } catch {
      /* nebitno */
    }
  }
}
