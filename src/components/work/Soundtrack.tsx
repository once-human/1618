import { soundtrack } from "@/lib/history/soundtrack";
import { fmtNum } from "@/lib/time";

const cell = "border-t border-ink pt-1.5";
const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/** What I was listening to while I built this, matched against the repo's commits. */
export async function Soundtrack({ repo }: { repo: string }) {
  const s = await soundtrack(repo);
  if (!s) return null;
  const enough = s.plays >= 3;

  return (
    <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <h2 className={`${cell} col-span-2 font-semibold md:col-span-1`}>Built to this soundtrack</h2>
      {enough ? (
        <div className={`${cell} col-span-2 md:col-span-3`}>
          <p className="max-w-[62ch]">
            {fmtNum(s.plays)} songs played across {s.sittings} {s.sittings === 1 ? "sitting" : "sittings"} and {s.commits}{" "}
            {s.commits === 1 ? "commit" : "commits"} since {date(s.since)}, worked out from when I committed and what was playing.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <ol>
              {s.artists.map((a, i) => (
                <li key={a.name} className="flex justify-between gap-4 border-b border-ink/15 py-1.5">
                  <span className="truncate">
                    <span className="tnum mr-3 text-quiet">{i + 1}</span>
                    {a.name}
                  </span>
                  <span className="tnum text-quiet">{fmtNum(a.plays)}</span>
                </li>
              ))}
            </ol>
            <ol>
              {s.tracks.map((t) => (
                <li key={`${t.track}|${t.artist}`} className="flex justify-between gap-4 border-b border-ink/15 py-1.5">
                  <span className="min-w-0 truncate">
                    {t.link ? (
                      <a href={t.link} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
                        {t.track}
                      </a>
                    ) : (
                      <span className="font-semibold">{t.track}</span>
                    )}{" "}
                    <span className="text-quiet">{t.artist}</span>
                  </span>
                  <span className="tnum text-quiet">{fmtNum(t.plays)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : (
        <p className={`${cell} col-span-2 max-w-[62ch] text-quiet md:col-span-3`}>
          My listening history only goes back to {date(s.since)}, so this fills in as I keep building: whatever plays
          while I commit here shows up.
        </p>
      )}
    </section>
  );
}
