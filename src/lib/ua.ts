/** "iPhone, Safari" from a user agent: enough to tell devices apart in /admin, nothing more. */
export function deviceName(ua: string | null | undefined): string {
  const s = ua ?? "";
  const device = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Mac OS X/.test(s) ? "Mac" : /Windows/.test(s) ? "Windows" : /CrOS/.test(s) ? "Chromebook" : /Linux/.test(s) ? "Linux" : /curl|Wget|HTTPie|xh\//i.test(s) ? "Terminal" : "Unknown device";
  const browser = /curl\//i.test(s)
    ? "curl"
    : /Edg\//.test(s)
      ? "Edge"
      : /SamsungBrowser/.test(s)
        ? "Samsung Internet"
        : /Instagram/.test(s)
          ? "Instagram"
          : /CriOS|Chrome\//.test(s)
            ? "Chrome"
            : /FxiOS|Firefox\//.test(s)
              ? "Firefox"
              : /Safari\//.test(s)
                ? "Safari"
                : "";
  return browser && device !== "Terminal" ? `${device}, ${browser}` : browser || device;
}
