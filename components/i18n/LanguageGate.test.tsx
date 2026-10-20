import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import LanguageGate from "./LanguageGate";
import { useLang } from "@/lib/i18n";

describe("LanguageGate", () => {
  beforeEach(() => {
    useLang.setState({ lang: "en", manual: false });
    try {
      localStorage.clear();
    } catch {}
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all 9 supported languages as selectable options", () => {
    render(<LanguageGate onDone={() => {}} />);
    expect(screen.getAllByRole("option")).toHaveLength(9);
  });

  it("localizes the listbox's aria-label and footer to the current (auto-detected) language, not hardcoded English", () => {
    useLang.setState({ lang: "ar", manual: false });
    render(<LanguageGate onDone={() => {}} />);
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-label", "اختر لغتك");
    expect(screen.getByText("⌖ يمكنك تغيير ذلك في أي وقت")).toBeInTheDocument();
  });

  it("defaults to the English strings when no language has been detected yet", () => {
    render(<LanguageGate onDone={() => {}} />);
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-label", "Choose your language");
    expect(screen.getByText("⌖ you can change this anytime")).toBeInTheDocument();
  });

  it("choosing a language sets it manually, persists the chosen flag, and calls onDone", () => {
    const onDone = vi.fn();
    render(<LanguageGate onDone={onDone} />);

    fireEvent.click(screen.getByRole("option", { name: "Deutsch" }));

    expect(useLang.getState().lang).toBe("de");
    expect(useLang.getState().manual).toBe(true);
    expect(localStorage.getItem("ee-lang-chosen")).toBe("1");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("marks the auto-detected language's option as the suggested one (aria-selected)", () => {
    useLang.setState({ lang: "fr", manual: false });
    render(<LanguageGate onDone={() => {}} />);
    expect(screen.getByRole("option", { name: "Français" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Deutsch" })).toHaveAttribute("aria-selected", "false");
  });
});
