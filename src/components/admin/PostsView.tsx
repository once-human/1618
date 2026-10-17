"use client";

import { useEffect, useRef, useState } from "react";
import { act, type AdminState, type Post } from "./store";
import { Button, Chip, Confirm, Empty, Icon, ago, when } from "./ui";

type Kind = "song" | "note";
type Show = "showing" | "hidden" | "all";

/** Songs people sent, and the guestbook. Everything goes up straight away; hide or delete here. */
export function PostsView({ data }: { data: AdminState }) {
  const [kind, setKind] = useState<Kind>("song");
  const [show, setShow] = useState<Show>("showing");
  const all = data.posts.filter((p) => p.kind === kind);
  const list = all.filter((p) => (show === "all" ? true : show === "hidden" ? p.hidden : !p.hidden));
  const songs = data.posts.filter((p) => p.kind === "song");
  const notes = data.posts.filter((p) => p.kind === "note");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-a-soft inline-flex rounded-xl p-1" role="tablist">
          {(
            [
              ["song", `Songs ${songs.length}`],
              ["note", `Guestbook ${notes.length}`],
            ] as [Kind, string][]
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`rounded-lg px-4 py-1.5 text-[14.5px] ${kind === k ? "bg-a-panel font-semibold shadow-sm" : "text-a-quiet"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(["showing", "hidden", "all"] as Show[]).map((s) => (
            <Chip key={s} on={show === s} onClick={() => setShow(s)}>
              {s === "showing" ? `On the site ${all.filter((p) => !p.hidden).length}` : s === "hidden" ? `Hidden ${all.filter((p) => p.hidden).length}` : "All"}
            </Chip>
          ))}
        </div>
      </div>

      {kind === "song" && songs.length ? (
        <p className="text-a-quiet text-[14px]">
          You&apos;ve played {songs.filter((s) => s.played?.count).length} of {songs.length} songs people sent. The sender sees it next time they visit.
        </p>
      ) : null}

      {list.length ? (
        <ul className="bg-a-panel border-a-line divide-a-line divide-y overflow-hidden rounded-2xl border">
          {list.map((p) => (
            <PostRow key={p.id} p={p} />
          ))}
        </ul>
      ) : (
        <div className="bg-a-panel border-a-line rounded-2xl border">
          <Empty>
            {all.length
              ? "Nothing here with this filter."
              : kind === "song"
                ? "Nobody's sent a song yet. They can from the home page, under listening."
                : "The guestbook's empty. It's at the end of the home page."}
          </Empty>
        </div>
      )}
    </div>
  );
}

function PostRow({ p }: { p: Post }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (op: "hide" | "show" | "delete", done: string) => {
    setBusy(op);
    await act("post", { id: p.id, op }, done);
    setBusy(null);
  };
  return (
    <li className={`flex flex-wrap items-start gap-3 px-4 py-3.5 ${p.hidden ? "opacity-55" : ""}`}>
      {p.kind === "song" ? (
        p.song?.art ? (
          // eslint-disable-next-line @next/next/no-img-element -- Apple's artwork, as sent
          <img src={p.song.art.replace("96x96", "160x160")} alt="" width={56} height={56} className="size-14 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="bg-a-soft size-14 shrink-0 rounded-lg" />
        )
      ) : null}
      <div className="min-w-0 flex-1 basis-56">
        {p.kind === "song" ? (
          <p className="font-semibold">
            {p.song?.track} <span className="text-a-quiet font-normal">by {p.song?.artist}</span>
          </p>
        ) : null}
        {p.message ? <p className={p.kind === "note" ? "text-[15.5px]" : "mt-0.5 text-[14.5px]"}>{p.kind === "song" ? `“${p.message}”` : p.message}</p> : null}
        <p className="text-a-quiet mt-1 text-[13px]">
          {p.name || "No name"} · <span title={when(p.at)}>{ago(p.at)}</span>
          {p.hidden ? " · hidden from the site" : ""}
          {p.kind === "song" ? (p.played?.count ? ` · you've played it ${p.played.count}×, last ${ago(p.played.last)}` : " · not played yet") : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {p.song?.preview ? <Preview url={p.song.preview} /> : null}
        {p.song?.link ? (
          <a href={p.song.link} target="_blank" rel="noopener noreferrer" className="text-a-quiet hover:text-a-ink hover:bg-a-soft inline-flex min-h-9 items-center rounded-lg px-2.5 text-[14px]">
            Apple Music
          </a>
        ) : null}
        {p.hidden ? (
          <Button kind="quiet" busy={busy === "show"} onClick={() => run("show", "Back on the site")}>
            Show
          </Button>
        ) : (
          <Button kind="quiet" busy={busy === "hide"} onClick={() => run("hide", "Hidden from the site")}>
            Hide
          </Button>
        )}
        <Confirm label="Delete" yes="Delete for good" busy={busy === "delete"} onYes={() => run("delete", "Deleted")} />
      </div>
    </li>
  );
}

/** A 30-second preview, one at a time. */
let playing: HTMLAudioElement | null = null;
function Preview({ url }: { url: string }) {
  const [on, setOn] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = () => {
    audio.current ??= Object.assign(new Audio(url), { onended: () => setOn(false), onpause: () => setOn(false), onplay: () => setOn(true) });
    if (on) audio.current.pause();
    else {
      if (playing && playing !== audio.current) playing.pause();
      playing = audio.current;
      void audio.current.play();
    }
  };
  return (
    <Button kind="quiet" onClick={toggle} aria-label={on ? "Pause preview" : "Play preview"} className="px-2">
      <Icon name={on ? "pause" : "play"} className="size-4" />
    </Button>
  );
}
