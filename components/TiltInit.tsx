"use client";

import { useEffect } from "react";

// Gentle pointer-follow 3D tilt on the main content cards — the Up Level Guild
// "card tilt" effect. Applied globally so pages don't need per-element wiring.
const SELECTOR = "main article, main > section .tile, .board-stat, .performance-source-card";
const MAX_DEG = 6;

export function TiltInit() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return; // skip touch devices

    const cards = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
    const cleanups: Array<() => void> = [];

    for (const card of cards) {
      card.classList.add("tilt-card");
      const onMove = (event: PointerEvent) => {
        const rect = card.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.setProperty("--rx", `${px * MAX_DEG}deg`);
        card.style.setProperty("--ry", `${-py * MAX_DEG}deg`);
      };
      const onLeave = () => {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      };
      card.addEventListener("pointermove", onMove);
      card.addEventListener("pointerleave", onLeave);
      cleanups.push(() => {
        card.removeEventListener("pointermove", onMove);
        card.removeEventListener("pointerleave", onLeave);
        card.classList.remove("tilt-card");
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
