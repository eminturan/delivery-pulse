import { describe, expect, it } from "vitest";
import { createRestSource } from "../src/hub/api";

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe("createRestSource", () => {
  it("sorgu sunucu sınırına ulaşınca aralığı bölerek yeniden sorar", async () => {
    const queries: string[] = [];
    const source = createRestSource(
      "https://sunucu/tfs/C",
      async () => "t",
      undefined, // proje yok: alt kayıtlara inilmez, yalnızca kayıt sorgusu çalışır
      async (url, init) => {
        if (url.includes("/wiql")) {
          const query = JSON.parse(String(init?.body)).query as string;
          queries.push(query);
          // İlk (tüm aralık) sorgusu sınırı doldurur; yarım aralıklar birer kayıt döndürür.
          const n = queries.length === 1 ? 20000 : 1;
          return json({ workItems: Array.from({ length: n }, (_, i) => ({ id: queries.length * 100000 + i })) });
        }
        if (url.includes("/workitemsbatch")) return json({ value: [] });
        return json({ value: [] });
      },
    );
    const report = await source.loadReport({ from: "2026-01-01", to: "2026-02-01", related: true });
    expect(queries.length).toBe(3);
    expect(new Set(queries).size).toBe(3);
    expect(report.truncated).toBe(false);
  });
});
