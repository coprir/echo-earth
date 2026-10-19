import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PresenceField from "./PresenceField";

describe("PresenceField", () => {
  it("renders nothing — no motes, no announcement — when not connected, even with a nonzero count (never fakes presence)", () => {
    render(<PresenceField othersCount={3} connected={false} reducedMotion={false} />);
    expect(document.querySelectorAll("span").length).toBe(0);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("renders nothing when connected but genuinely alone", () => {
    render(<PresenceField othersCount={0} connected={true} reducedMotion={false} />);
    expect(document.querySelectorAll("span").length).toBe(0);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("announces the count via an aria-live region, independent of the visual motes, for screen-reader parity", () => {
    render(<PresenceField othersCount={3} connected={true} reducedMotion={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("3 other explorers nearby");
  });

  it("renders one mote per other explorer, up to a cap, never more", () => {
    const { rerender } = render(<PresenceField othersCount={3} connected={true} reducedMotion={false} />);
    expect(document.querySelectorAll("span").length).toBe(3);

    rerender(<PresenceField othersCount={50} connected={true} reducedMotion={false} />);
    expect(document.querySelectorAll("span").length).toBe(6); // MAX_VISIBLE_MOTES
  });

  it("respects prefers-reduced-motion by omitting the breathing animation class", () => {
    render(<PresenceField othersCount={2} connected={true} reducedMotion={true} />);
    const motes = document.querySelectorAll("span");
    expect(motes.length).toBe(2);
    for (const mote of motes) {
      expect(mote.className).not.toContain("ee-breathe");
    }
  });

  it("applies the breathing animation when reduced motion is not requested", () => {
    render(<PresenceField othersCount={2} connected={true} reducedMotion={false} />);
    const motes = document.querySelectorAll("span");
    for (const mote of motes) {
      expect(mote.className).toContain("ee-breathe");
    }
  });

  it("the mote layer is non-interactive and hidden from the accessibility tree (the aria-live region carries the a11y signal instead)", () => {
    render(<PresenceField othersCount={2} connected={true} reducedMotion={false} />);
    const layer = document.querySelector('[aria-hidden="true"]');
    expect(layer).toBeTruthy();
    expect(layer).toHaveClass("pointer-events-none");
  });
});
