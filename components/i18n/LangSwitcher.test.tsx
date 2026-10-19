import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LangSwitcher from "./LangSwitcher";
import { useLang } from "@/lib/i18n";

// the toggle button's accessible name is itself translated (t("hud.lang")),
// so it can't be matched by an English-only name regex once the store's
// language changes — its visible glyph "⌖" is the one language-independent
// handle onto it.
const openMenu = () => fireEvent.click(screen.getByText("⌖"));

describe("LangSwitcher", () => {
  beforeEach(() => {
    useLang.setState({ lang: "en", manual: false });
  });

  it("opens the language list on click and shows every supported language", () => {
    render(<LangSwitcher />);
    openMenu();
    expect(screen.getByRole("button", { name: "Deutsch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "العربية" })).toBeInTheDocument();
  });

  it("marks only the active language as pressed", () => {
    useLang.setState({ lang: "fr" });
    render(<LangSwitcher />);
    openMenu();
    expect(screen.getByRole("button", { name: "Français" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Deutsch" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switching language sets it manually (overriding future auto-detection) and closes the menu", async () => {
    render(<LangSwitcher />);
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));

    expect(useLang.getState().lang).toBe("de");
    expect(useLang.getState().manual).toBe(true);
    // the menu closes via an exit animation (AnimatePresence) — real timers,
    // so wait for the unmount rather than asserting synchronously
    await waitFor(() => expect(screen.queryByRole("button", { name: "Français" })).not.toBeInTheDocument());
  });

  it("a manual choice is never overridden by a later auto-detect call", () => {
    render(<LangSwitcher />);
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));

    useLang.getState().autoFromCountry("FR");
    expect(useLang.getState().lang).toBe("de"); // manual=true blocks the auto-detect
  });
});
