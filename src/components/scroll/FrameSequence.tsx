"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { frameUrl } from "@/lib/frames";

gsap.registerPlugin(ScrollTrigger);

interface Props {
  sceneId: string;
  frameCount: number;
  /** Scroll distance of this scene, in viewport heights. */
  scrollScreens: number;
  /** Called with 0..1 progress as the user scrubs through the scene. */
  onProgress?: (progress: number) => void;
}

/**
 * Apple-style scroll-scrubbed video: a pinned <canvas> that draws the frame
 * matching scroll progress.
 *
 * Quality rule: the canvas backing store is sized to the real device pixels
 * (cssSize * devicePixelRatio). Never downscale to "optimise"; reduce cost by
 * loading fewer frames up front instead (first/last frames load first, the
 * rest stream in behind them).
 */
export function FrameSequence({ sceneId, frameCount, scrollScreens, onProgress }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const images: (HTMLImageElement | undefined)[] = new Array(frameCount);
    let current = -1;
    let disposed = false;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      current = -1; // force redraw
      draw(Math.max(0, current));
    };

    const draw = (index: number) => {
      // Fall back to the nearest already-loaded frame so scrubbing never blanks.
      let img = images[index];
      if (!img?.complete || !img.naturalWidth) {
        for (let d = 1; d < frameCount; d++) {
          const a = images[index - d];
          const b = images[index + d];
          if (a?.complete && a.naturalWidth) { img = a; break; }
          if (b?.complete && b.naturalWidth) { img = b; break; }
        }
      }
      if (!img || !img.naturalWidth) return;
      // object-fit: cover
      const cw = canvas.width, ch = canvas.height;
      const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
      current = index;
    };

    const load = (i: number) => {
      if (images[i]) return;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (!disposed && i === Math.max(0, current)) draw(i);
        if (!disposed && current === -1 && i === 0) draw(0);
      };
      img.src = frameUrl(sceneId, i + 1);
      images[i] = img;
    };

    // Priority: first + last frame, then every 8th, then the rest.
    const order: number[] = [0, frameCount - 1];
    for (let i = 0; i < frameCount; i += 8) order.push(i);
    for (let i = 0; i < frameCount; i++) order.push(i);
    let cursor = 0;
    const pump = () => {
      if (disposed) return;
      for (let n = 0; n < 6 && cursor < order.length; n++) load(order[cursor++]);
      if (cursor < order.length) setTimeout(pump, 30);
    };
    pump();

    resize();
    window.addEventListener("resize", resize);

    const state = { frame: 0 };
    const tween = gsap.to(state, {
      frame: frameCount - 1,
      ease: "none",
      onUpdate: () => {
        const idx = Math.round(state.frame);
        if (idx !== current) draw(idx);
      },
      scrollTrigger: {
        trigger: wrap,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.4,
        onUpdate: (self) => onProgress?.(self.progress),
      },
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [sceneId, frameCount, onProgress]);

  return (
    <div
      ref={wrapRef}
      id={sceneId}
      style={{ height: `${scrollScreens * 100}vh` }}
      className="relative"
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <canvas ref={canvasRef} className="h-full w-full" aria-hidden />
      </div>
    </div>
  );
}
