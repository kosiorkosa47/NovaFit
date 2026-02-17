#!/usr/bin/env node

/**
 * SSE demo runner for /api/agent.
 * Prints status/agent/final events in the terminal.
 */

const baseUrl = process.env.NOVA_HEALTH_BASE_URL ?? "http://localhost:3000";
const endpoint = `${baseUrl.replace(/\/$/, "")}/api/agent`;
const sessionId = crypto.randomUUID();

function parseSseChunk(chunk) {
  const lines = chunk.split("\n");
  let event = "message";
  const data = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    }

    if (line.startsWith("data:")) {
      data.push(line.slice(5).trim());
    }
  }

  if (!data.length) {
    return null;
  }

  return {
    event,
    data: data.join("\n")
  };
}

async function run() {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify({
      sessionId,
      message: "I'm tired after work and need a simple healthy evening plan.",
      feedback: "Keep it light.",
      mode: "stream"
    })
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  console.log(`Streaming from ${endpoint}`);

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let idx = buffer.indexOf("\n\n");

    while (idx !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const parsed = parseSseChunk(chunk);

      if (parsed) {
        try {
          const json = JSON.parse(parsed.data);
          console.log(`[${parsed.event}]`, json.message ?? "");
          if (parsed.event === "done") {
            return;
          }
        } catch {
          console.log(`[${parsed.event}]`, parsed.data);
        }
      }

      idx = buffer.indexOf("\n\n");
    }
  }
}

run().catch((error) => {
  console.error("SSE demo failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
