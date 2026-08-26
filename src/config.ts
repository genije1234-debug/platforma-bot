// Ucitavanje podesavanja iz .env + scenarios/default.json + CLI (--kljuc=vrednost).
// Bez zavisnosti: mali .env parser.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnvFile(): Record<string, string> {
  const p = join(ROOT, ".env");
  const out: Record<string, string> = {};
  if (!existsSync(p)) return out;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadScenario(): Record<string, unknown> {
  const p = join(ROOT, "scenarios", "default.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function loadCli(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const envFile = loadEnvFile();
const scenario = loadScenario();
const cli = loadCli();

// Redosled prioriteta: CLI > .env (fajl ili proces) > scenario > podrazumevano.
function pick(cliKey: string, envKey: string, scenKey: string, def: string): string {
  if (cli[cliKey] != null) return cli[cliKey];
  if (envFile[envKey] != null) return envFile[envKey];
  if (process.env[envKey] != null) return process.env[envKey] as string;
  if (scenario[scenKey] != null) return String(scenario[scenKey]);
  return def;
}

function num(cliKey: string, envKey: string, scenKey: string, def: number): number {
  const v = Number(pick(cliKey, envKey, scenKey, String(def)));
  return Number.isFinite(v) ? v : def;
}

export interface Account {
  username: string;
  password: string;
}

function parseAccounts(): Account[] {
  const raw = pick("accounts", "ACCOUNTS", "accounts", "");
  const list: Account[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (!s) continue;
    const idx = s.indexOf(":");
    if (idx === -1) continue;
    list.push({ username: s.slice(0, idx).trim(), password: s.slice(idx + 1).trim() });
  }
  return list;
}

const baseUrl = pick("base-url", "BASE_URL", "baseUrl", "http://www.singlbet.com").replace(/\/+$/, "");

function deriveWsUrl(): string {
  const explicit = pick("ws-url", "WS_URL", "wsUrl", "");
  if (explicit) return explicit;
  const u = new URL(baseUrl);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}/ws/prematch`;
}

export const config = {
  baseUrl,
  wsUrl: deriveWsUrl(),
  accounts: parseAccounts(),
  // Ako je zadat --bots=N, ogranici broj botova (za probu). Inace = broj naloga.
  botLimit: cli["bots"] != null ? Math.max(1, parseInt(cli["bots"], 10) || 1) : null,

  ticketIntervalSec: num("interval", "TICKET_INTERVAL_SEC", "ticketIntervalSec", 60),
  ticketsBeforePause: num("pause-after", "TICKETS_BEFORE_PAUSE", "ticketsBeforePause", 100),
  pauseMinMin: num("pause-min", "PAUSE_MIN_MIN", "pauseMinMin", 1),
  pauseMaxMin: num("pause-max", "PAUSE_MAX_MIN", "pauseMaxMin", 30),
  stakeMin: num("stake-min", "STAKE_MIN", "stakeMin", 100),
  stakeMax: num("stake-max", "STAKE_MAX", "stakeMax", 500),
  legsMin: num("legs-min", "LEGS_MIN", "legsMin", 1),
  legsMax: num("legs-max", "LEGS_MAX", "legsMax", 7),
  singleProb: num("single-prob", "SINGLE_PROB", "singleProb", 0.3),
  footballProb: num("football-prob", "FOOTBALL_PROB", "footballProb", 0.5),
  maxOdds: num("max-odds", "MAX_ODDS", "maxOdds", 5),
  maxHoursAhead: num("max-hours", "MAX_HOURS_AHEAD", "maxHoursAhead", 24),
  // Suvi hod: sve do slanja, ali bez pravog POST place-bet (za test logike).
  dryRun: (pick("dry-run", "DRY_RUN", "dryRun", "0") || "0") === "1",
};

export function activeAccounts(): Account[] {
  const all = config.accounts;
  if (config.botLimit == null) return all;
  return all.slice(0, config.botLimit);
}
