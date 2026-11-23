// @vitest-environment jsdom
/**
 * Accessibility and behaviour tests for shared UI: axe-core finds no violations, status is
 * never colour-only, every chart has a text alternative, and the SOS hold can't be tapped
 * by accident.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AiNote, Chip, Empty, LIVE_STATUS, PageHeader, Section } from "../../src/web/components/ui";
import { DecisionCard } from "../../src/web/features/decisions/DecisionCard";
import { Dumbbell, Heatmap, Lorenz, TableView, UtilRing } from "../../src/web/features/admin/charts";
import type { Decision } from "../../src/shared/domain";

async function noViolations(container: HTMLElement) {
  const res = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(res.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

const decision: Decision = {
  id: "d1",
  equipmentId: "eq-scope-1",
  start: "2026-11-24T03:30:00.000Z",
  end: "2026-11-24T05:30:00.000Z",
  candidates: [
    { userId: "a", projectId: "pa", eligible: true, scores: { deadline: 30, stage: 17, usage: 16, wait: 7.5, fit: 10, unblocks: 5, noShowPenalty: 0, total: 85.5 } },
    { userId: "b", projectId: "pb", eligible: false, filteredBy: "Needs certification." },
  ],
  winnerUserId: "a",
  alternatives: { b: [{ kind: "later_slot", equipmentId: "eq-2", start: "2026-11-24T06:00:00.000Z", end: "2026-11-24T08:00:00.000Z", note: "Nearest slot that still keeps your deadline." }] },
  policyVersion: "2026.11-1",
  explanation: "Asha got this slot mainly because of a closer deadline.",
  explanationSource: "ai",
  createdAt: "2026-11-23T05:00:00.000Z",
};

describe("shared UI accessibility", () => {
  it("status chips pair colour with a word", async () => {
    const { container } = render(<Chip tone={LIVE_STATUS.free!.tone}>{LIVE_STATUS.free!.label}</Chip>);
    expect(screen.getByText("Free now")).toBeInTheDocument();
    await noViolations(container);
  });

  it("AI output is labelled as AI and announced politely", () => {
    render(<AiNote source="gemini">Draft plan ready.</AiNote>);
    const note = screen.getByText(/Draft plan ready/).closest("[aria-live]");
    expect(note).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/A person confirms it/)).toBeInTheDocument();
  });

  it("rules-based fallbacks are not dressed up as AI", () => {
    render(<AiNote source="fallback">Template plan.</AiNote>);
    expect(screen.getByText(/Rules-based/)).toBeInTheDocument();
    expect(screen.queryByText(/A person confirms it/)).toBeNull();
  });

  it("page header, sections and empty states have no violations; doodles are hidden from AT", async () => {
    const { container } = render(
      <main>
        <PageHeader title="My projects" note="hello" lead="Lead" />
        <Section title="Later">content</Section>
        <Empty title="Nothing here">Try again</Empty>
      </main>,
    );
    container.querySelectorAll("svg.doodle, svg.spark").forEach((svg) => expect(svg.closest("[aria-hidden='true']") ?? svg).toHaveAttribute("aria-hidden", "true"));
    await noViolations(container);
  });

  it("the decision record explains winners and filtered candidates in words", async () => {
    const { container } = render(
      <MemoryRouter>
        <DecisionCard decision={decision} names={{ a: "Asha", b: "Student B" }} equipmentName="Oscilloscope 1" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Why Asha got/)).toBeInTheDocument();
    expect(screen.getByText("Needs certification.")).toBeInTheDocument();
    expect(screen.getAllByRole("meter").length).toBe(5);
    await noViolations(container);
  });
});

describe("charts have text alternatives", () => {
  it("ring, Lorenz and heatmap expose an accessible name", async () => {
    const grid = Array.from({ length: 7 }, (_, d) => Array.from({ length: 14 }, (_, h) => (d + h) % 4));
    const { container } = render(
      <div>
        <UtilRing value={0.27} label="of bench time used" />
        <Lorenz series={[{ label: "This week", color: "#5f35d9", values: [1, 2, 3, 10] }]} />
        <Heatmap grid={grid} />
        <Dumbbell rows={[{ name: "Scope 1", booked: 10, used: 6 }]} />
        <TableView caption="Hours" head={["A", "B"]} rows={[["x", 1]]} />
      </div>,
    );
    expect(screen.getByRole("img", { name: /27%/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Lorenz curve/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Booked lab hours by weekday/ })).toBeInTheDocument();
    expect(screen.getByText(/6h used of 10h/)).toBeInTheDocument();
    expect(screen.getByText("Show as table")).toBeInTheDocument();
    await noViolations(container);
  });
});

describe("SOS hold-to-send", () => {
  it("a quick tap does nothing; a 1.5 s hold advances to the type picker", async () => {
    vi.useFakeTimers();
    vi.doMock("../../src/web/lib/api", () => ({ post: vi.fn().mockResolvedValue({ notified: 3, demo: true }) }));
    const { SosSheet } = await import("../../src/web/components/Sos");
    render(<SosSheet open onOpenChange={() => {}} context={{ labId: "lab-ece-1" }} />);
    const sos = screen.getByRole("button", { name: /press and hold/i });
    fireEvent.pointerDown(sos);
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerUp(sos);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText(/What's happening/)).toBeNull();
    fireEvent.pointerDown(sos);
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByText(/What's happening/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call 112/ })).toHaveAttribute("href", "tel:112");
    vi.useRealTimers();
  });
});
