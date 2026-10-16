import { publicLinks } from "@/content/profile";

/** Contact, kept plain. */
export function SayHi() {
  const links = publicLinks();
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <p className="col-span-2 max-w-[36ch] border-t border-ink pt-1.5 text-[17px] leading-snug">
        Building something, or want to talk products, communities or coffee? I&apos;d like to hear about it.
      </p>
      <ul className="col-span-2 border-t border-ink pt-1.5 text-[17px] leading-snug">
        {links.map(({ label, href }) => (
          <li key={label}>
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-1 underline-offset-4 hover:decoration-2">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
