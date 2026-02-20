import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/morphy-ux/hooks/use-smooth-stream-progress", () => ({
  useSmoothStreamProgress: (value: number) => value,
}));

import { ImportProgressView } from "@/components/kai/views/import-progress-view";

describe("ImportProgressView stream surface", () => {
  it("renders unified transcript with stage/reasoning/token sections from first stage", () => {
    render(
      <ImportProgressView
        stage="indexing"
        stageTrail={["[INDEXING] Indexing document structure..."]}
        streamedText="token-1 token-2"
        isStreaming
        totalChars={18}
        chunkCount={2}
        thoughts={["Detected account summary and holdings table."]}
        thoughtCount={1}
        progressPct={15}
      />
    );

    expect(screen.getByText("AI Stream Transcript")).toBeTruthy();
    expect(screen.getByText("Stage timeline")).toBeTruthy();
    expect(screen.getByText(/reasoning \(1\)/i)).toBeTruthy();
    expect(screen.getByText(/vertex gemini token stream/i)).toBeTruthy();
    expect(screen.getByText(/\[INDEXING\] Indexing document structure\.\.\./)).toBeTruthy();
    expect(screen.queryByText(/AI Reasoning/i)).toBeNull();
  });
});
