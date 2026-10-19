"use client";

import { useEffect } from "react";

/**
 * Closes a dialog/menu on Escape — the one keyboard interaction every
 * dismissible overlay in the app (Concierge, About, PlaceDetail, the HUD
 * menu, AtmospherePicker, LangSwitcher) is expected to support per WAI-ARIA
 * authoring practices, but none implemented before this hook existed (the
 * only way to dismiss any of them was a mouse click, on the backdrop or an
 * explicit close button). Only listens while `active` is true, so closed
 * overlays add no global listener.
 */
export function useEscapeToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, onClose]);
}
