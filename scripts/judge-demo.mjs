#!/usr/bin/env node

/**
 * Hackathon demo runner.
 * Assumes the app is running locally (npm run dev) and calls /api/agent in JSON mode.
 */

const baseUrl = process.env.NOVA_HEALTH_BASE_URL ?? "http://localhost:3000";
const endpoint = `${baseUrl.replace(/\/$/, "")}/api/agent`;
const sessionId = crypto.randomUUID();

async function callAgent({ message, feedback }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      sessionId,
      message,
      feedback,
      mode: "json"
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Request failed (${response.status}): ${error}`);
  }

  return response.json();
}

function printDivider() {
  console.log("\n" + "-".repeat(72) + "\n");
}

async function run() {
  console.log("Nova Health Agent | Judge Demo Script");
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Session: ${sessionId}`);

  printDivider();

  console.log("Turn 1 input: I'm tired after work and low on energy.");
  const first = await callAgent({
    message: "I'm tired after work and low on energy."
  });

  console.log("Turn 1 analyzer summary:", first.analyzerSummary);
  console.log("Turn 1 plan summary:", first.plan?.summary ?? "(no summary)");
  console.log("Turn 1 monitor tone:", first.monitorTone);
  console.log("Turn 1 response excerpt:");
  console.log(String(first.reply ?? "").slice(0, 420) + "...");

  printDivider();

  console.log("Turn 2 input: The plan felt too intense.");
  const second = await callAgent({
    message: "I can try this tonight.",
    feedback: "The plan felt too intense. Please make it gentler."
  });

  console.log("Turn 2 analyzer summary:", second.analyzerSummary);
  console.log("Turn 2 plan summary:", second.plan?.summary ?? "(no summary)");
  console.log("Turn 2 monitor tone:", second.monitorTone);
  console.log("Turn 2 response excerpt:");
  console.log(String(second.reply ?? "").slice(0, 420) + "...");

  printDivider();

  console.log("Demo completed successfully.");
}

run().catch((error) => {
  console.error("Demo failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
