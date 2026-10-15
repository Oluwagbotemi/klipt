"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * For a horizontally scrollable element: returns a mask style that fades the
 * edge(s) with hidden content, plus an onScroll handler to keep it current.
 */
export function useOverflowFade(ref: RefObject<HTMLElement | null>, fade = "1.5rem") {
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setOverflow((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    // Re-measure when the element resizes or its items change.
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    const mutations = new MutationObserver(measure);
    mutations.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, [ref, measure]);

  const mask = `linear-gradient(to right, ${overflow.left ? "transparent" : "black"}, black ${fade}, black calc(100% - ${fade}), ${overflow.right ? "transparent" : "black"})`;
  return { style: { maskImage: mask, WebkitMaskImage: mask }, onScroll: measure };
}
