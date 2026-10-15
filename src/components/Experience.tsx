"use client";

import { CHAPTERS } from "@/content/story";
import { SmoothScroll } from "@/components/scroll/SmoothScroll";
import { Grade } from "@/components/scroll/Grade";
import { Intro } from "@/components/scroll/Intro";
import { Chapter } from "@/components/scroll/Chapter";
import { Counter } from "@/components/finale/Counter";
import { Closing } from "@/components/finale/Closing";
import { Header } from "@/components/ui/Header";
import { LivingProfile } from "@/components/live/LivingProfile";

/** The whole film: intro, six chapters, the counter finale, closing credits. */
export function Experience() {
  return (
    <SmoothScroll>
      <Grade />
      <Header />
      <main>
        <Intro />
        {CHAPTERS.map((chapter, i) => (
          <Chapter key={chapter.id} chapter={chapter} index={i} />
        ))}
        <Counter />
      </main>
      <Closing />
      <LivingProfile />
    </SmoothScroll>
  );
}
