// Probe: does the gateway accept max_tokens, and what is the real output ceiling?
// One small call; asks for a short reply so we don't burn tokens.
import ZAI from "z-ai-web-dev-sdk";

const PROBES = [4096, 8192, 16384, 32000];

async function probe(maxTokens) {
  const zai = await ZAI.create();
  const body = {
    messages: [{ role: "user", content: "Reply with exactly: OK" }],
    stream: false,
    max_tokens: maxTokens,
    thinking: { type: "disabled" },
  };
  try {
    const res = (await zai.chat.completions.create(body)) ?? {};
    const msg = res?.choices?.[0]?.message?.content ?? "";
    const fr = res?.choices?.[0]?.finish_reason ?? "n/a";
    const usage = res?.usage ? JSON.stringify(res.usage) : "no usage";
    console.log(`max_tokens=${maxTokens} -> ACCEPTED, finish=${fr}, content=${JSON.stringify(msg.slice(0, 40))}, usage=${usage}`);
    return true;
  } catch (err) {
    console.log(`max_tokens=${maxTokens} -> REJECTED: ${String(err?.message ?? err).slice(0, 200)}`);
    return false;
  }
}

let accepted = [];
for (const mt of PROBES) {
  const ok = await probe(mt);
  if (ok) accepted.push(mt);
  await new Promise((r) => setTimeout(r, 1500)); // be gentle with the rate limiter
}
console.log(`RESULT: accepted=${accepted.join(",") || "none"}`);
