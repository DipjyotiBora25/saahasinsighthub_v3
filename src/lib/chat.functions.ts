import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  question: z.string().min(1).max(2000),
  context: z.string().max(20000).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional(),
});

export const askAnalyticsBot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY missing");

    const systemPrompt = `You are an expert data analytics Sales & Purchase analyst for Saahas Zero Waste.
You reason carefully over the uploaded sales/purchase context provided. Be concise, use bullets,
and call out concrete numbers (₹ in Cr/L). When data is insufficient, say so plainly. Focus on:
revenue vs spend, profitability, category mix, top customers/vendors, YoY trends, and waste flow.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(data.context ? [{ role: "system", content: `DATA CONTEXT:\n${data.context}` }] : []),
      ...(data.history ?? []),
      { role: "user", content: data.question },
    ];

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        // FIXED: Replaced "groq/fastest" with an actual valid production model ID
        model: "llama-3.3-70b-versatile", 
        messages,
        temperature: 0.2,
        max_tokens: 512,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached — please retry shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings.");
      throw new Error(`AI error ${res.status}: ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "";
    return { text };
  });