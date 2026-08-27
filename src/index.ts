// Ulazna tacka: podigne sve botove ISTOVREMENO (jedan po nalogu).
import { config, activeAccounts } from "./config.ts";
import { Bot } from "./bot.ts";

function main(): void {
  const accounts = activeAccounts();
  if (!accounts.length) {
    console.error(
      "Nema naloga. Popuni ACCOUNTS u .env (format: korisnik:lozinka,korisnik:lozinka).",
    );
    process.exit(1);
  }

  console.log("=== PLATFORMA BOT ===");
  console.log(`Meta:        ${config.baseUrl}`);
  console.log(`Faza:        ${config.mode.toUpperCase()}${config.mode === "live" ? " (uzivo)" : " (prematch, mecevi <=24h)"}`);
  console.log(`Botova:      ${accounts.length}`);
  console.log(`Ritam:       1 tiket / ${config.ticketIntervalSec}s po botu`);
  console.log(`Parovi:      ${config.legsMin}-${config.legsMax} (singl ${Math.round(config.singleProb * 100)}%)`);
  console.log(`Fudbal:      ${Math.round(config.footballProb * 100)}%`);
  console.log(`Ulog:        ${config.stakeMin}-${config.stakeMax} RSD`);
  console.log(`Kvota max:   ${config.maxOdds}`);
  console.log(`Prozor:      mecevi ≤ ${config.maxHoursAhead}h`);
  console.log(`Pauza:       posle ${config.ticketsBeforePause} tiketa, ${config.pauseMinMin}-${config.pauseMaxMin} min`);
  if (config.dryRun) console.log("REZIM:       DRY-RUN (ne salje place-bet)");
  console.log("=====================");

  // Svi krecu istovremeno (bez rampe) — svaki bot je svoj async lanac.
  for (let i = 0; i < accounts.length; i++) {
    const bot = new Bot(accounts[i], i + 1, accounts.length);
    bot.start().catch((e) => console.error(`bot#${i + 1} pao:`, e));
  }
}

main();
