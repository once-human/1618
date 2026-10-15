"use client";

import { useState } from "react";
import { SCENES } from "@/lib/scenes";
import { SmoothScroll } from "@/components/scroll/SmoothScroll";
import { FrameSequence } from "@/components/scroll/FrameSequence";
import { Header } from "@/components/ui/Header";

/**
 * Top-level scroll experience. Sequence scenes render a FrameSequence;
 * the interactive (Three.js) scene is a placeholder until it's built.
 *
 * NOTE: time-of-day tracking per scene (updating `time` on scroll) is not
 * wired yet; it comes with the first real scene.
 */
export function Experience() {
  const [time] = useState(SCENES[0].time);

  return (
    <SmoothScroll>
      <Header time={time} />
      <main>
        {SCENES.map((scene) =>
          scene.kind === "sequence" && scene.frameCount ? (
            <FrameSequence
              key={scene.id}
              sceneId={scene.id}
              frameCount={scene.frameCount}
              scrollScreens={scene.scrollScreens}
            />
          ) : (
            <section
              key={scene.id}
              id={scene.id}
              className="flex min-h-screen items-center justify-center font-mono text-sm text-muted"
            >
              [{scene.id}: Three.js interactive scene goes here]
            </section>
          ),
        )}
      </main>
    </SmoothScroll>
  );
}
