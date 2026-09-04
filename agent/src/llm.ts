import axios from "axios";

// Minimal LLM wrapper that attempts to use the Copilot SDK if configured,
// otherwise falls back to a mocked prediction. This keeps the code runnable
// without external credentials while showing where Copilot integration would go.

export async function decideExecutionStrategy(prompt: string): Promise<string> {
  // [Requirement] Select the appropriate execution tool/strategy.
  // This is the single place where we map test metadata (title, description,
  // type) to a decided runner (functional, performance, security, etc.).
  // If COPILOT_API_KEY is provided, user intends to use the Copilot SDK.
  if (process.env.COPILOT_API_KEY) {
    // Placeholder: require('@copilot/sdk') and call it here.
    // We don't import directly to keep repo runnable without the SDK.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Copilot = require("@copilot/sdk");
      const client = new Copilot.Client({ apiKey: process.env.COPILOT_API_KEY });
      const resp = await client.complete({ prompt, maxTokens: 32 });
      return resp.text || "mock-runner";
    } catch (e) {
      console.warn("Copilot SDK not available at runtime, falling back to heuristic.");
    }
  }

  // Heuristic fallback: inspect keywords for a simple mapping
  const p = prompt.toLowerCase();
  if (p.includes("performance") || p.includes("load")) return "performance-runner";
  if (p.includes("security") || p.includes("2fa") ) return "security-scan";
  if (p.includes("integration")) return "integration-runner";
  return "functional-runner";
}
