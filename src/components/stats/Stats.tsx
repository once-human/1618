import { fmtNum } from "@/lib/time";
import { Cover } from "@/components/live/Cover";
import { Preview } from "@/components/live/Preview";

/**
 * The visual language for numbers on the site: one huge figure where a
 * number is the story, thin ink bars where the shape matters, every chart
 * labelled in words so nobody has to decode it.
 */

/* ---- One big number ---- */

export function BigNumber({
  label,
  value,
  unit,
  sub,
  size = "lg",
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
  size?: "xl" | "lg" | "md";
}) {
  const cls =
    size === "xl"
      ? "text-[clamp(4rem,12vw,10rem)]"
      : size === "lg"
        ? "text-[clamp(2.5rem,6vw,4.75rem)]"
        : "text-[clamp(1.75rem,3.5vw,2.75rem)]";
  return (
    <div className="border-t border-ink pt-1.5">
      <p className="text-quiet">{label}</p>
      <p className={`tnum mt-1 leading-[0.85] font-extrabold tracking-[-0.045em] ${cls}`}>
        {value}
        {unit ? <span className="ml-[0.18em] text-[0.32em] font-semibold tracking-normal">{unit}</span> : null}
      </p>
      {sub ? <p className="mt-2 text-[13px] text-quiet">{sub}</p> : null}
    </div>
  );
}

/* ---- Ranked list with proportional bars ---- */

export interface RankItem {
  key: string;
  title: string;
  sub?: string | null;
  count: number;
  image?: string | null;
  url?: string | null;
  preview?: string | null;
}

export function RankList({
  items,
  unit = "plays",
  cover,
  start = 1,
}: {
  items: RankItem[];
  unit?: string;
  /** Show covers at this size (px). */
  cover?: number;
  start?: number;
}) {
  if (!items.length) return <p className="text-quiet">Nothing yet.</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ol className="border-t border-ink pt-1">
      {items.map((it, i) => (
        <li key={it.key} className="py-1.5">
          <div className="flex items-center gap-3">
            <span className="tnum w-5 shrink-0 text-right text-[13px] text-quiet">{i + start}</span>
            {cover ? (
              it.preview !== undefined ? (
                <Preview id={`rank|${it.key}`} url={it.preview ?? null} image={it.image ?? null} label={it.title} size={cover} />
              ) : (
                <Cover url={it.image ?? null} px={cover} />
              )
            ) : null}
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block truncate font-semibold">
                {it.url ? (
                  <a href={it.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {it.title}
                  </a>
                ) : (
                  it.title
                )}
              </span>
              {it.sub ? <span className="block truncate text-[13px] text-quiet">{it.sub}</span> : null}
            </span>
            <span className="tnum shrink-0 text-[13px] text-quiet">
              {fmtNum(it.count)} <span className="hidden sm:inline">{it.count === 1 ? unit.replace(/s$/, "") : unit}</span>
            </span>
          </div>
          <span aria-hidden className="mt-1 ml-8 block h-px bg-ink/10">
            <span className="block h-full bg-ink" style={{ width: `${(it.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---- The 24-hour listening clock ---- */

const hourName = (h: number) => (h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`);
const NIGHT = (h: number) => h >= 22 || h < 6;

export function HourChart({ clock, nowHour, height = 150 }: { clock: number[]; nowHour?: number | null; height?: number }) {
  const total = clock.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...clock);
  const peak = clock.indexOf(max);
  const night = total ? Math.round((clock.reduce((s, n, h) => s + (NIGHT(h) ? n : 0), 0) / total) * 100) : 0;
  const evening = total ? Math.round((clock.slice(18).reduce((a, b) => a + b, 0) / total) * 100) : 0;

  return (
    <figure>
      <div className="relative" style={{ height }} role="img" aria-label={`Plays by hour of the day, most around ${hourName(peak)}`}>
        {/* Night, shaded so the shape reads at a glance */}
        <span aria-hidden className="absolute inset-y-0 left-0 bg-ink/[0.04]" style={{ width: `${(6 / 24) * 100}%` }} />
        <span aria-hidden className="absolute inset-y-0 right-0 bg-ink/[0.04]" style={{ width: `${(2 / 24) * 100}%` }} />
        <div className="absolute inset-0 grid grid-cols-[repeat(24,1fr)] items-end gap-[3px] px-[1px]">
          {clock.map((n, h) => (
            <span key={h} className="relative flex h-full items-end" title={`${hourName(h)}: ${fmtNum(n)} ${n === 1 ? "play" : "plays"}`}>
              <span
                className={`block w-full ${h === peak ? "bg-ink" : "bg-ink/55"}`}
                style={{ height: `${n ? Math.max(3, (n / max) * 86) : 1}%`, opacity: n ? 1 : 0.25 }}
              />
              {h === peak && n > 0 ? (
                <span className="tnum absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap" style={{ bottom: `calc(${(n / max) * 86}% + 4px)` }}>
                  {fmtNum(n)}
                </span>
              ) : null}
              {h === nowHour ? <span aria-hidden className="absolute -bottom-2 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-ink" /> : null}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 text-[11px] text-quiet">
        <span>midnight</span>
        <span>6 am</span>
        <span>noon</span>
        <span>6 pm</span>
      </div>
      {total > 0 && (
        <figcaption className="mt-4 text-[15px]">
          Mostly around <span className="font-semibold">{hourName(peak)}</span>.{" "}
          <span className="text-quiet">
            {evening}% of plays happen after 6 pm, {night}% between 10 pm and 6 am.
            {nowHour != null ? " The dot is now." : ""}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

/* ---- Months of a year ---- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthChart({ byMonth, current }: { byMonth: { month: string; plays: number; topArtist?: string | null }[]; current?: number }) {
  const map = new Map(byMonth.map((m) => [Number(m.month.slice(5)) - 1, m]));
  const max = Math.max(1, ...byMonth.map((m) => m.plays));
  return (
    <figure>
      <div className="grid h-36 grid-cols-12 items-end gap-1.5" role="img" aria-label="Plays per month">
        {MONTHS.map((label, i) => {
          const m = map.get(i);
          const pct = m ? Math.max(4, (m.plays / max) * 82) : 0;
          return (
            <span key={label} className="relative flex h-full flex-col justify-end" title={m ? `${label}: ${m.plays} plays${m.topArtist ? `, mostly ${m.topArtist}` : ""}` : `${label}: no plays`}>
              {m ? <span className="tnum mb-1 text-center text-[11px]">{fmtNum(m.plays)}</span> : null}
              <span className={`block w-full ${i === current ? "bg-ink" : "bg-ink/55"}`} style={{ height: m ? `${pct}%` : "1px", opacity: m ? 1 : 0.3 }} />
            </span>
          );
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-12 gap-1.5 text-center text-[11px] text-quiet">
        {MONTHS.map((m, i) => (
          <span key={m} className={i === current ? "font-semibold text-ink" : ""}>
            {m[0]}
          </span>
        ))}
      </div>
    </figure>
  );
}

/* ---- Day by day ---- */

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function DayChart({ byDay, from, to }: { byDay: { day: string; plays: number }[]; from?: string; to?: string }) {
  // Fill in quiet days so gaps show as gaps.
  const days: { day: string; plays: number }[] = [];
  const start = from ?? byDay[0]?.day;
  const end = to ?? byDay[byDay.length - 1]?.day;
  if (start && end) {
    const map = new Map(byDay.map((d) => [d.day, d.plays]));
    for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`) && days.length < 400; t += 86400_000) {
      const d = new Date(t).toISOString().slice(0, 10);
      days.push({ day: d, plays: map.get(d) ?? 0 });
    }
  }
  if (!days.length) return null;
  const max = Math.max(1, ...days.map((d) => d.plays));
  const peak = days.reduce((a, b) => (b.plays > a.plays ? b : a));
  return (
    <figure>
      <div className="flex h-28 items-end gap-[2px]" role="img" aria-label={`Plays per day, most on ${dayLabel(peak.day)}`}>
        {days.map((d) => (
          <span
            key={d.day}
            title={`${dayLabel(d.day)}: ${d.plays} plays`}
            className={`block min-w-px flex-1 ${d === peak ? "bg-ink" : "bg-ink/55"}`}
            style={{ height: d.plays ? `${Math.max(3, (d.plays / max) * 100)}%` : "1px", opacity: d.plays ? 1 : 0.3, maxWidth: 28 }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-quiet">
        <span>{dayLabel(days[0].day)}</span>
        <span>{dayLabel(days[days.length - 1].day)}</span>
      </div>
      {peak.plays > 0 && (
        <figcaption className="mt-3 text-[15px]">
          Busiest day: <span className="font-semibold">{dayLabel(peak.day)}</span>
          <span className="text-quiet">, {fmtNum(peak.plays)} plays.</span>
        </figcaption>
      )}
    </figure>
  );
}

/** A plain word-and-number fact line. */
export function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-ink/15 py-2">
      <span className="text-quiet">{k}</span>
      <span className="tnum text-right">{v}</span>
    </div>
  );
}
