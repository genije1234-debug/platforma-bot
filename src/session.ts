// Login na SinglBet (Laravel): GET /login za _token + cookie, pa POST /login.
import { HttpClient, extractCsrf } from "./http.ts";

export class Session {
  http: HttpClient;
  csrf: string | null = null;
  username: string;
  private password: string;
  constructor(baseUrl: string, username: string, password: string) {
    this.username = username;
    this.password = password;
    this.http = new HttpClient(baseUrl);
  }

  /** Vrati true na uspesan login. Igracka zona je pod /user. */
  async login(): Promise<boolean> {
    // 1) Pokupi cookie (XSRF-TOKEN, session) i _token sa login stranice.
    const page = await this.http.get("/user/login");
    const html = await page.text();
    this.csrf = extractCsrf(html);

    // 2) Posalji kredencijale.
    const form: Record<string, string> = {
      username: this.username,
      password: this.password,
    };
    if (this.csrf) form._token = this.csrf;

    const res = await this.http.postForm("/user/login", form);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location") ?? "";
      if (/login/i.test(loc)) return false; // vraceni na login = neuspeh
    } else {
      const body = await res.text();
      if (/name=["']password["']/i.test(body)) return false;
    }
    // 3) Potvrdi da smo stvarno u igrackoj zoni (auth-only ruta ne redirectuje na login).
    return await this.isAuthenticated();
  }

  /** True ako auth-only ruta ne baca na login. */
  async isAuthenticated(): Promise<boolean> {
    const res = await this.http.get("/user/dashboard");
    if (res.status >= 300 && res.status < 400) {
      return !/login/i.test(res.headers.get("location") ?? "");
    }
    return res.status === 200;
  }

  /** Osvezi _token sa proizvoljne autentifikovane strane (za POST place-bet). */
  async refreshCsrf(): Promise<void> {
    const page = await this.http.get("/");
    const html = await page.text();
    const t = extractCsrf(html);
    if (t) this.csrf = t;
  }
}
