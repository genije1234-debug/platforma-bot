// Mali HTTP klijent sa cookie-jar po botu (nativni fetch, bez zavisnosti).
// Laravel: nosimo session cookie + XSRF-TOKEN i saljemo CSRF na POST.

export class HttpClient {
  private cookies = new Map<string, string>();
  baseUrl: string;
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private storeSetCookie(res: Response): void {
    // Node fetch spaja vise Set-Cookie u getSetCookie().
    const raw = (res.headers as any).getSetCookie?.() as string[] | undefined;
    const list = raw && raw.length
      ? raw
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
    for (const line of list) {
      const first = line.split(";")[0];
      const eq = first.indexOf("=");
      if (eq === -1) continue;
      const name = first.slice(0, eq).trim();
      const val = first.slice(eq + 1).trim();
      if (name) this.cookies.set(name, val);
    }
  }

  /** Laravel XSRF token = url-decoded XSRF-TOKEN cookie, ide kao X-XSRF-TOKEN. */
  xsrfToken(): string | null {
    const c = this.cookies.get("XSRF-TOKEN");
    return c ? decodeURIComponent(c) : null;
  }

  async get(path: string, opts: { headers?: Record<string, string> } = {}): Promise<Response> {
    const url = path.startsWith("http") ? path : this.baseUrl + path;
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (platforma-bot)",
        "Accept": "text/html,application/xhtml+xml,application/json,*/*",
        "X-Requested-With": "XMLHttpRequest",
        ...(this.cookieHeader() ? { Cookie: this.cookieHeader() } : {}),
        ...(opts.headers ?? {}),
      },
    });
    this.storeSetCookie(res);
    return res;
  }

  async postForm(
    path: string,
    form: Record<string, string>,
    opts: { headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const url = path.startsWith("http") ? path : this.baseUrl + path;
    const body = new URLSearchParams(form).toString();
    const xsrf = this.xsrfToken();
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (platforma-bot)",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/json,*/*",
        "X-Requested-With": "XMLHttpRequest",
        ...(xsrf ? { "X-XSRF-TOKEN": xsrf } : {}),
        ...(this.cookieHeader() ? { Cookie: this.cookieHeader() } : {}),
        ...(opts.headers ?? {}),
      },
      body,
    });
    this.storeSetCookie(res);
    return res;
  }
}

/** Iz HTML-a izvuci Laravel _token (meta csrf-token ili hidden input). */
export function extractCsrf(html: string): string | null {
  const meta = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i);
  if (meta) return meta[1];
  const input =
    html.match(/name=["']_token["'][^>]*value=["']([^"']+)["']/i) ||
    html.match(/value=["']([^"']+)["'][^>]*name=["']_token["']/i);
  return input ? input[1] : null;
}
