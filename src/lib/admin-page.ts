/** Headers for my private pages: never cached, never indexed, never shown inside another site's frame. */
export const PRIVATE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
};

/** The login form, for when /admin is opened by a browser that isn't logged in. */
export function loginPage(note: string | null): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>admin</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:24px;max-width:420px}h1{font-size:40px;margin:0 0 16px}
input,button{font:inherit;padding:8px 10px}input{width:100%;box-sizing:border-box;margin:8px 0}p.q{color:#6e6e6e;font-size:14px}p.n{color:#b00}</style>
</head><body><h1>admin</h1>
${note ? `<p class=n>${note}</p>` : ""}
<form method="post" action="/admin/login">
  <label for=k>Site key</label>
  <input id=k name="key" type="password" autocomplete="current-password" required autofocus>
  <button>Log in</button>
</form>
<p class=q>Stays logged in on this browser for 30 days. Five wrong tries locks this network out for 15 minutes.</p>
</body></html>`;
}
