import { describe, it, expect, vi } from "vitest";

// Mock the bedrock invoke module before importing dispatcher
vi.mock("@/lib/bedrock/invoke", () => ({
  invokeNovaLite: vi.fn().mockResolvedValue({ text: '{"route":"full","confidence":0.9,"reasoning":"health question"}' }),
}));
vi.mock("@/lib/utils/logging", () => ({
  log: vi.fn(),
}));

import { dispatchMessage } from "@/lib/agents/dispatcher";

describe("dispatchMessage — regex pre-filter", () => {
  it("routes 'hello' to greeting", async () => {
    const result = await dispatchMessage("hello", false, []);
    expect(result.route).toBe("greeting");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("routes 'hi!' to greeting", async () => {
    const result = await dispatchMessage("hi!", false, []);
    expect(result.route).toBe("greeting");
  });

  it("routes 'cześć' to greeting", async () => {
    const result = await dispatchMessage("cześć", false, []);
    expect(result.route).toBe("greeting");
  });

  it("routes 'dzien dobry' to greeting", async () => {
    const result = await dispatchMessage("dzien dobry", false, []);
    expect(result.route).toBe("greeting");
  });

  it("routes 'thanks' to quick", async () => {
    const result = await dispatchMessage("thanks!", false, []);
    expect(result.route).toBe("quick");
  });

  it("routes 'ok' to quick", async () => {
    const result = await dispatchMessage("ok", false, []);
    expect(result.route).toBe("quick");
  });

  it("routes 'dziękuję' to quick", async () => {
    const result = await dispatchMessage("dziękuję", false, []);
    expect(result.route).toBe("quick");
  });

  it("routes image to photo", async () => {
    const result = await dispatchMessage("what is this", true, []);
    expect(result.route).toBe("photo");
    expect(result.confidence).toBe(0.99);
  });

  it("routes short non-health message to quick", async () => {
    const result = await dispatchMessage("cool", false, []);
    expect(result.route).toBe("quick");
  });

  it("routes health complaint to full", async () => {
    const result = await dispatchMessage("I feel terrible, slept 3 hours", false, []);
    expect(result.route).toBe("full");
  });

  it("routes plan request to full", async () => {
    const result = await dispatchMessage("create a plan for me", false, []);
    expect(result.route).toBe("full");
  });

  it("routes followup with history to followup", async () => {
    const history = [
      { id: "1", role: "user" as const, content: "I'm tired", createdAt: "" },
      { id: "2", role: "assistant" as const, content: "Here's a plan...", createdAt: "" },
    ];
    const result = await dispatchMessage("yes, the first option", false, history);
    expect(result.route).toBe("followup");
  });

  it("routes 'what should I eat' to full (health keyword)", async () => {
    const result = await dispatchMessage("what should I eat for dinner?", false, []);
    expect(result.route).toBe("full");
  });

  it("routes dangerous question to offtopic", async () => {
    const result = await dispatchMessage("mogę psiknąć sobie gazu do buzi?", false, []);
    expect(result.route).toBe("offtopic");
  });

  it("routes 'drink bleach' to offtopic", async () => {
    const result = await dispatchMessage("can I drink bleach to clean my body?", false, []);
    expect(result.route).toBe("offtopic");
  });

  it("routes 'inhale spray' to offtopic", async () => {
    const result = await dispatchMessage("what happens if I huff aerosol spray", false, []);
    expect(result.route).toBe("offtopic");
  });

  it("routes programming question to offtopic", async () => {
    const result = await dispatchMessage("write me a python program", false, []);
    expect(result.route).toBe("offtopic");
  });

  it("routes joke request to offtopic", async () => {
    const result = await dispatchMessage("tell me a joke", false, []);
    expect(result.route).toBe("offtopic");
  });
});
