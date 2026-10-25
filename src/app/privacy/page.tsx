import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { profile } from "@/content/profile";
import { SITE_URL } from "@/lib/site";
import { PageTransition } from "@/components/site/PageTransition";
import { YourVisit } from "@/components/pages/YourVisit";

export const metadata: Metadata = pageMeta(
  "Privacy",
  "What this site keeps about your visit, for how long, and how to see it, delete it or turn it off.",
  "/privacy",
);

const UPDATED = "25 October 2026";
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
function Part({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="border-ink grid scroll-mt-24 grid-cols-1 gap-x-4 gap-y-2 border-t pt-1.5 pb-12 md:grid-cols-4">
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
              This is my personal website. It has no accounts, no cookies, no ads and no analytics
              company watching. It does keep its own log of visits, so I can see how people find it
              and what they read: the town you&apos;re in, your kind of device, and which pages you
              open, in what order and for how long. Never your IP address, never your exact
              location, never your name.
            </p>
            <p>
              Every visit is kept in full for 30 days. After that, all that&apos;s left of it is a
              count: one more person, from your country, on that day. You can see exactly what the
              log holds about your browser, delete it, or turn it off,{" "}
              <a href="#your-visit" className={link}>
                right here
              </a>
              .
            </p>
            <p>
              The live parts of the page (what I&apos;m listening to, what I&apos;ve saved on
              Pinterest, what I&apos;ve pushed to GitHub, my runs) are about me, not you.
            </p>
          </Part>

          <Part title="The visitor log" id="log">
            <p>When you visit, your browser tells the site, every few seconds while the page is open:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>which pages you open, in order, how long each was on your screen, and how far down you got;</li>
              <li>which links to other sites you follow (the site and page, not anything about you);</li>
              <li>things you do here: sending a song, signing the guestbook, writing to me, playing a preview (that you did it, not what you wrote);</li>
              <li>the site you came from, as a name only (&ldquo;instagram.com&rdquo;), your browser&apos;s language, and whether you&apos;re on a phone, tablet or computer.</li>
            </ul>
            <p>
              The server adds the town and country your connection comes from (from Vercel, never
              anything finer) and a device name like &ldquo;iPhone, Safari&rdquo;. To tell one visit
              of yours from the next, your browser makes up a random code and keeps it in its own
              storage. It isn&apos;t a cookie, isn&apos;t sent to anyone else, and isn&apos;t made
              from anything about you; clearing your browser&apos;s data, or deleting it below,
              makes it disappear. Programs that fetch pages (search engines, link previews, curl)
              are logged too, by name, so I can tell them apart from people.
            </p>
            <p>
              Only I can read the log. Full detail is kept for 30 days; every night, anything older
              is reduced to counts per day (people per country, views per page) and the rest is
              deleted. Nothing in it is sold, shared or used for advertising. If your browser asks
              sites not to track it (Global Privacy Control, or Do Not Track), the log leaves you
              out entirely.
            </p>
          </Part>

          <Part title="Your visit" id="your-visit">
            <YourVisit />
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
              Still no cookies. The clock shows the time where I am, and your own time next to it, both
              worked out in your browser. The weather is for the town I&apos;m in, fetched by the
              server, never based on where you are.
            </p>
            <p>
              Separately from the log, two live counts. The visitor count adds you once a day, however often you
              reload, recognising a returning visitor only by the scrambled, daily-changing code
              described below. For the map of today&apos;s visitors on /now, the town your
              connection comes from is kept with it (coordinates rounded to about 10 km) and
              shown only as a dot and a count per town; it&apos;s deleted with the code each night. And to show how many people are on the site right now, each open tab
              holds a live connection to Supabase Realtime and is given a scrambled code for
              the device it&apos;s on, so your tabs, private windows and other browsers on one
              phone or laptop count as one person. The code is worked out by the server from
              your connection&apos;s address, your operating system and your screen&apos;s pixel
              size, mixed with a secret and the date. It can&apos;t be turned back into any of
              those, changes every day, and isn&apos;t stored anywhere; it&apos;s only passed to
              the other people on the site so their browsers can count. Along with it go the town
              your connection comes from (never anything finer) and, while a few people are on the
              same page, roughly how far down it you are, so everyone can see &ldquo;someone in
              Berlin&rdquo; and a dot where they&apos;re reading. (If that fails, your
              browser keeps one random code in its local storage instead.) A tab that sits in
              the background for a minute steps out until you come back. Like any server,
              Supabase sees your connection&apos;s address while you&apos;re connected; see the{" "}
              <Ext href="https://supabase.com/privacy">Supabase privacy policy</Ext>.
            </p>
          </Part>

          <Part title="If you talk to me" id="talk">
            <p>
              Messages you send through &ldquo;Talk to me&rdquo; (on the site or from a terminal) are
              kept in the site&apos;s database and passed to me on Telegram, with the name you gave
              (if any), the town your connection comes from and the page you were on, so I know who
              I&apos;m talking to. They aren&apos;t shown to anyone else. My replies are kept with
              them and sent back to you.
            </p>
            <p>
              Your chat is a random code that only your browser keeps, and it&apos;s the only key to
              it. There&apos;s no account. You&apos;re asked what to call you first; staying
              anonymous is a fine answer. One browser has one chat, under that name; a new name
              starts a fresh chat. You can open your chat on another device with its link (anyone
              with that link can read it, so keep it to yourself).
            </p>
            <p>
              <strong>Delete</strong> removes a chat from the site and from your browser for good.
              What you&apos;d already sent stays in my Telegram, the way a text you sent someone
              stays on their phone. To keep it from turning into spam: at most 5 messages in a row
              until I reply, limits on how often one network can write or start chats, and each chat
              keeps a one-way code for the network and the kind of device it came from (made with a
              secret, so it can&apos;t be turned back into an address; your IP address itself is never
              stored). That&apos;s what lets me block a network that abuses it. Telegram&apos;s
              handling is covered by the <Ext href="https://telegram.org/privacy">Telegram privacy policy</Ext>.
            </p>
          </Part>

          <Part title="If you post something">
            <p>
              When you send me a song or sign the guestbook, the site keeps what you typed (your
              name, if you gave one, and your message) and the song you picked, and shows it on the
              page for everyone. Song searches are passed to Apple Music by the server and not kept. If you send a
              song, your browser keeps a random code (and the site a scrambled copy of it) so that
              next time you visit it can tell you whether I&apos;ve played it.
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
              Steps, distance, calories and workouts come from Apple Health, sent by a shortcut on my
              own phone, and only the numbers I choose to send.
            </p>
            <p>
              When I say &ldquo;Hey Siri, good night&rdquo;, a shortcut on my phone tells the site the time I
              went to bed. The site says so for a few hours, and keeps the time in its history.
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
