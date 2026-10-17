import type { Metadata } from "next";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { profile } from "@/content/profile";
import { SITE_URL } from "@/lib/site";
import { PageTransition } from "@/components/site/PageTransition";

export const metadata: Metadata = {
  title: "Privacy, Onkar Yaglewad",
  description:
    "What this site knows about you (almost nothing) and how it uses my own Pinterest, music and GitHub data.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "17 October 2026";
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
    <section className="border-ink grid grid-cols-1 gap-x-4 gap-y-2 border-t pt-1.5 pb-12 md:grid-cols-4">
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
      <PageTransition>
        <main className="px-4 pt-24 pb-32 text-[15px] leading-relaxed">
          <h1 className="bigword mb-10 -ml-[0.04em] text-[clamp(4.5rem,17vw,17rem)]">privacy</h1>

          <p className="tnum text-quiet mb-12">
            {host}, last updated {UPDATED}
          </p>

          <Part title="The short version">
            <p>
              This is my personal website. It has no accounts, no cookies, no analytics and no ads.
              Nothing on it tracks you. The only things it keeps from visitors are what you choose
              to post (a song for me, or a line in the guestbook) and a few anonymous counts.
            </p>
            <p>
              The live parts of the page (what I&apos;m listening to, what I&apos;ve saved on
              Pinterest, what I&apos;ve pushed to GitHub, my runs) are about me, not you.
            </p>
          </Part>

          <Part title="When you visit">
            <p>
              The site is hosted on Vercel. As with any website, their servers handle each request,
              which includes your IP address, your browser and the page you asked for, and may keep
              these in short-lived logs to run and protect the service. I don&apos;t use those logs
              to identify or follow anyone. Vercel&apos;s handling is covered by the{" "}
              <Ext href="https://vercel.com/legal/privacy-policy">Vercel privacy policy</Ext>.
            </p>
            <p>
              No cookies. The clock shows the time where I am, and your own time next to it, both
              worked out in your browser. The weather is for the town I&apos;m in, fetched by the
              server, never based on where you are.
            </p>
            <p>
              Two counts, nothing more. The visitor count adds you once a day, however often you
              reload, recognising a returning visitor only by the scrambled, daily-changing code
              described below. And to show how many people are on the site right now, your browser
              keeps one random code in its local storage (so your tabs count as one person) and,
              while a tab is open, holds a live connection to Supabase Realtime, which passes that
              code around to the other people on the site and nothing else. The code isn&apos;t
              linked to your address or anything about you, isn&apos;t stored on any server once you
              leave, and a private window gets its own. A tab that sits in the background for a
              minute steps out until you come back. Like any server, Supabase sees your
              connection&apos;s address while you&apos;re connected; see the{" "}
              <Ext href="https://supabase.com/privacy">Supabase privacy policy</Ext>.
            </p>
          </Part>

          <Part title="If you post something">
            <p>
              When you send me a song or sign the guestbook, the site keeps what you typed (your
              name, if you gave one, and your message) and the song you picked, and shows it on the
              page for everyone. Song searches are passed to Apple Music by the server and not kept.
            </p>
            <p>
              To count people rather than page loads, and to stop one person flooding the page, the
              site makes a one-way, scrambled code from your IP address that changes every day. It
              can&apos;t be turned back into your address, can&apos;t follow you from one day to the
              next, and is deleted within a few days. The same goes for 🔥 reactions, which are kept
              only as a count per song.
            </p>
            <p>
              I can hide or delete any post, and I&apos;ll remove yours if you ask (see the end of
              this page).
            </p>
          </Part>

          <Part title="Images and sound from elsewhere">
            <p>
              Album covers load directly from Apple&apos;s servers and pin images directly from
              Pinterest&apos;s. Pressing a cover plays a 30-second preview, streamed from Apple.
              Your browser fetches these the way it would on any page that shows them, so Apple and
              Pinterest receive the usual details of that request, such as your IP address. Fonts
              are served from this site, not from a font service.
            </p>
            <p>
              Links to Apple Music, Pinterest and GitHub open those sites, and their own privacy
              policies apply there.
            </p>
          </Part>

          <Part title="My Pinterest">
            <p>
              The site shows my own Pinterest: my profile, my boards and the pins I&apos;ve saved,
              along with account numbers such as followers and monthly views. It reads them from my
              public profile and through Pinterest&apos;s official API, using access I granted to my
              own account.
            </p>
            <p>
              That access is read only. The site never posts, saves, edits or deletes anything on
              Pinterest. It only ever reads my account. Visitors never sign in with Pinterest, and
              the site never asks for or sees anyone else&apos;s Pinterest data.
            </p>
            <p>
              The access keys are kept encrypted in the hosting settings and are used only on the
              server. They are never sent to your browser. The site keeps a record of my own saves
              in its database, so it can show my history over time. None of it is sold, shared, or
              used for advertising. I can withdraw the site&apos;s access at any time from my
              Pinterest settings.
            </p>
          </Part>

          <Part title="My music, code and runs">
            <p>
              What I play on Apple Music is sent to my Last.fm account by a scrobbler app on my
              phone, and the site reads it from Last.fm. Covers and song links are looked up on
              Apple Music, with Deezer and song.link as fallbacks. Public GitHub activity comes from
              GitHub&apos;s public API.
            </p>
            <p>
              My runs and rides come from Strava, read only, and only the activities I&apos;ve made
              public. Steps, sleep and workouts come from Apple Health, sent by a shortcut on my own
              phone, and only the numbers I choose to send.
            </p>
            <p>
              The site keeps a copy of all of this in its own database (Neon, hosted in the United
              States), so it can show my history by week, month and year. All of it is about me.
            </p>
          </Part>

          <Part title="Children">
            <p>
              The site isn&apos;t aimed at children, and it doesn&apos;t ask anyone, of any age, for
              personal information.
            </p>
          </Part>

          <Part title="Changes">
            <p>If any of this changes, I&apos;ll update this page and the date at the top of it.</p>
          </Part>

          <Part title="Questions">
            <p>
              {email ? (
                <>
                  Email me at{" "}
                  <a href={`mailto:${email}`} className={link}>
                    {email}
                  </a>{" "}
                  with any question about this page, or to have a post of yours removed.
                </>
              ) : (
                <>
                  Open an issue on the{" "}
                  <Ext href="https://github.com/once-human/1618/issues">
                    site&apos;s GitHub repository
                  </Ext>{" "}
                  with any question about this page, or to have a post of yours removed.
                </>
              )}
            </p>
          </Part>
        </main>
      </PageTransition>
      <Footer />
    </>
  );
}
