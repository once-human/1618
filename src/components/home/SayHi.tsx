import Link from "next/link";
import { publicLinks } from "@/content/profile";
import { Guestbook } from "./Guestbook";

/** Contact, kept plain. */
export function SayHi() {
  const links = publicLinks();
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <p className="border-ink col-span-2 max-w-[36ch] border-t pt-1.5 text-[17px] leading-snug">
          Building something, or want to talk products, communities or coffee? I&apos;d like to hear
          about it.
        </p>
        <ul className="border-ink col-span-2 border-t pt-1.5 text-[17px] leading-snug">
          {links.map(({ label, href }) => (
            <li key={label}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-1 underline-offset-4 hover:decoration-2"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
        <p className="text-quiet col-span-2 flex flex-wrap gap-x-4 text-[13px] md:col-span-2">
          {[
            ["/now", "now"],
            ["/history", "history"],
            ["/status", "status"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="hover:text-ink underline decoration-1 underline-offset-4"
            >
              {label}
            </Link>
          ))}
        </p>
        <p className="text-quiet col-span-2 text-[13px]">
          No cookies, no tracking.{" "}
          <Link
            href="/privacy"
            className="hover:text-ink underline decoration-1 underline-offset-4"
          >
            Privacy
          </Link>
        </p>
      </div>
      <Guestbook />
    </>
  );
}
