import type { Metadata } from "next";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { profile } from "@/content/profile";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy, Onkar Yaglewad",
  description: "What this site knows about you (almost nothing) and how it uses my own Pinterest, music and GitHub data.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "16 October 2026";
const host = SITE_URL.replace(/^https?:\/\//, "");

const link = "underline decoration-1 underline-offset-4 hover:decoration-2";

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
      {children}
    </a>
  );
}

/** One ruled row: the heading on the left, the words on the right. */
function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-ink pt-1.5 pb-12 md:grid-cols-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="max-w-[62ch] space-y-3 md:col-span-2">{children}</div>
    </section>
  );
}

export default function Privacy() {
  const email = profile.links.email?.replace(/^mailto:/, "") ?? null;

  return (
    <>
      <Nav />
      <main className="px-4 pt-24 pb-32 text-[15px] leading-relaxed">
        <h1 className="bigword mb-10 -ml-[0.04em] text-[clamp(4.5rem,17vw,17rem)]">privacy</h1>

        <p className="tnum mb-12 text-quiet">
          {host}, last updated {UPDATED}
        </p>

        <Part title="The short version">
          <p>
            This is my personal website. It has no accounts, no forms, no cookies, no analytics and no ads. Nothing
            on it tracks you, and I don&apos;t collect anything about you.
          </p>
          <p>
            The live parts of the page (what I&apos;m listening to, what I&apos;ve saved on Pinterest, what I&apos;ve
            pushed to GitHub) are about me, not you.
          </p>
        </Part>

        <Part title="When you visit">
          <p>
            The site is hosted on Vercel. As with any website, their servers handle each request, which includes
            your IP address, your browser and the page you asked for, and may keep these in short-lived logs to run
            and protect the service. I don&apos;t use those logs to identify or follow anyone. Vercel&apos;s handling
            is covered by the <Ext href="https://vercel.com/legal/privacy-policy">Vercel privacy policy</Ext>.
          </p>
          <p>
            Nothing is stored in your browser: no cookies, no local storage. The clock shows Pune time, worked out in
            your browser. The weather is Pune&apos;s, fetched by the server, not based on where you are.
          </p>
        </Part>

        <Part title="Images from elsewhere">
          <p>
            Album covers load directly from Apple&apos;s servers and pin images directly from Pinterest&apos;s. Your
            browser fetches them the way it would on any page that shows their images, so Apple and Pinterest receive
            the usual details of that request, such as your IP address. Fonts are served from this site, not from a
            font service.
          </p>
          <p>
            Links to Apple Music, Pinterest and GitHub open those sites, and their own privacy policies apply there.
          </p>
        </Part>

        <Part title="My Pinterest">
          <p>
            The site shows my own Pinterest: my profile, my boards and the pins I&apos;ve saved, along with account
            numbers such as followers and monthly views. It reads them from my public profile and through
            Pinterest&apos;s official API, using access I granted to my own account.
          </p>
          <p>
            That access is read only. The site never posts, saves, edits or deletes anything on Pinterest. It only
            ever reads my account. Visitors never sign in with Pinterest, and the site never asks for or sees anyone
            else&apos;s Pinterest data.
          </p>
          <p>
            The access keys are kept encrypted in the hosting settings and are used only on the server. They are
            never sent to your browser. What Pinterest returns is cached for up to half an hour so the page stays
            fast. Then it is replaced with fresh data. None of it is sold, shared, or used for advertising. I can
            withdraw the site&apos;s access at any time from my Pinterest settings.
          </p>
        </Part>

        <Part title="My music and GitHub">
          <p>
            What I play on Apple Music is sent to my Last.fm account by a scrobbler app on my phone, and the site
            reads it from Last.fm. Covers and song links are looked up on Apple Music, with Deezer and song.link as
            fallbacks. Public GitHub activity comes from GitHub&apos;s public API. All of it is about my own accounts.
          </p>
        </Part>

        <Part title="Children">
          <p>The site isn&apos;t aimed at children, and it doesn&apos;t collect information from anyone, of any age.</p>
        </Part>

        <Part title="Changes">
          <p>
            If any of this changes, I&apos;ll update this page and the date at the top of it.
          </p>
        </Part>

        <Part title="Questions">
          <p>
            {email ? (
              <>
                Email me at{" "}
                <a href={`mailto:${email}`} className={link}>
                  {email}
                </a>{" "}
                with any question about this page.
              </>
            ) : (
              <>
                Open an issue on the{" "}
                <Ext href="https://github.com/once-human/1618/issues">site&apos;s GitHub repository</Ext> with any
                question about this page.
              </>
            )}
          </p>
        </Part>
      </main>
      <Footer />
    </>
  );
}
