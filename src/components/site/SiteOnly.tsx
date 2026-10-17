"use client";

import { usePathname } from "next/navigation";

/** The site's own extras (being counted as here, talk notices, the menu) stay out of /admin. */
export function SiteOnly({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return path?.startsWith("/admin") ? null : <>{children}</>;
}
