import { describe, expect, it } from "vitest";
import {
  byType,
  childCounts,
  cycleStats,
  DAY_MS,
  formatDays,
  hasRole,
  inRange,
  itemsWiql,
  linksWiql,
  percentile,
  stats,
  toDateInput,
  toItems,
  weekly,
  weekStart,
} from "../src/hub/logic";

const iso = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const raw = (id: number, fields: Record<string, unknown>) => ({
  id,
  fields: { "System.Title": `t${id}`, "System.WorkItemType": "Task", "System.State": "Closed", ...fields },
});

describe("toItems", () => {
  const data = [
    raw(1, { "System.CreatedDate": iso(2026, 1, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 11) }),
    raw(2, {
      "System.CreatedDate": iso(2026, 1, 2),
      "Microsoft.VSTS.Common.StateChangeDate": iso(2026, 1, 4),
      "Microsoft.VSTS.Common.ActivatedDate": iso(2026, 1, 3),
      "System.Parent": 1,
      "System.AssignedTo": { displayName: "Ayşe" },
    }),
    raw(3, { "System.CreatedDate": iso(2026, 1, 2) }),
    null,
  ];

  it("lead ve cycle time hesaplar, kapanışı olmayanı atlar", () => {
    const items = toItems(data, "https://s/c/P");
    expect(items.map((i) => i.id)).toEqual([1, 2]);
    expect(items[0].leadDays).toBe(10);
    expect(items[0].cycleDays).toBeUndefined();
    expect(items[1].leadDays).toBe(2);
    expect(items[1].cycleDays).toBe(1);
    expect(items[1].assignee).toBe("Ayşe");
    expect(items[1].url).toBe("https://s/c/P/_workitems/edit/2");
  });

  it("ClosedDate yoksa StateChangeDate kullanır; 9999 yılını boş sayar", () => {
    const [item] = toItems(
      [
        raw(5, {
          "System.CreatedDate": iso(2026, 1, 1),
          "Microsoft.VSTS.Common.ClosedDate": "9999-01-01T00:00:00Z",
          "Microsoft.VSTS.Common.StateChangeDate": iso(2026, 1, 3),
        }),
      ],
      "b/",
    );
    expect(item.leadDays).toBe(2);
  });

  it("parent/child rollerini ayırır", () => {
    const derived = toItems(data, "b/");
    expect(hasRole(derived[0], "parent")).toBe(true);
    expect(hasRole(derived[0], "child")).toBe(false);
    expect(hasRole(derived[1], "child")).toBe(true);
    expect(hasRole(derived[1], "standalone")).toBe(false);

    // Link sorgusu varsa sayılar oradan gelir (açık child'lar dahil).
    const counts = childCounts([{ source: null, target: { id: 1 } }, { source: { id: 1 }, target: { id: 2 } }, { source: { id: 1 }, target: { id: 9 } }, { source: { id: 2 }, target: { id: 7 } }]);
    const linked = toItems(data, "b/", counts);
    expect(linked[0].childCount).toBe(2);
    // Hem parent'ı hem child'ı olan kayıt iki rolde de sayılır.
    expect(hasRole(linked[1], "parent") && hasRole(linked[1], "child")).toBe(true);
  });
});

describe("istatistik", () => {
  it("yüzdelik ve özet", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([5], 0.85)).toBe(5);
    expect(stats([])).toBeUndefined();
    expect(stats([4, 1, 3, 2])).toMatchObject({ count: 4, avg: 2.5, median: 2.5, min: 1, max: 4 });
  });

  it("cycle time'ı olmayanları dışarıda tutar", () => {
    const items = toItems(
      [
        raw(1, { "System.CreatedDate": iso(2026, 1, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 5) }),
        raw(2, { "System.CreatedDate": iso(2026, 1, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 5), "Microsoft.VSTS.Common.ActivatedDate": iso(2026, 1, 2) }),
      ],
      "b/",
    );
    expect(cycleStats(items)).toMatchObject({ count: 1, median: 3 });
  });

  it("haftaya ve türe göre gruplar", () => {
    const items = toItems(
      [
        raw(1, { "System.CreatedDate": iso(2026, 11, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 11, 3) }), // Salı
        raw(2, { "System.CreatedDate": iso(2026, 11, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 11, 5) }),
        raw(3, { "System.WorkItemType": "Bug", "System.CreatedDate": iso(2026, 11, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 11, 10) }),
      ],
      "b/",
    );
    expect(new Date(weekStart(items[0].closed)).getDay()).toBe(1);
    expect(weekly(items).map((w) => [toDateInput(w.start), w.count, w.median])).toEqual([
      ["2026-11-02", 2, 3],
      ["2026-11-09", 1, 9],
    ]);
    expect(byType(items).map((r) => [r.type, r.stats.count])).toEqual([["Task", 2], ["Bug", 1]]);
  });

  it("aralık dışındaki kapanışları süzer (uç günler dahil)", () => {
    const items = toItems(
      [3, 5, 6].map((d) => raw(d, { "System.CreatedDate": iso(2026, 11, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 11, d, 23) })),
      "b/",
    );
    expect(inRange(items, { from: "2026-11-04", to: "2026-11-05" }).map((i) => i.id)).toEqual([5]);
  });
});

describe("wiql", () => {
  const now = new Date(2026, 10, 10, 15).getTime();
  const opts = { from: "2026-10-01", to: "2026-10-31" };

  it("proje, durum ve tarih koşullarını yazar", () => {
    const q = itemsWiql(["Closed", "Ta'mam"], opts, now, "Proje");
    expect(q).toContain("[System.TeamProject] = 'Proje'");
    expect(q).toContain("[System.State] IN ('Closed', 'Ta''mam')");
    expect(q).toContain("[Microsoft.VSTS.Common.StateChangeDate] >= @Today - 41");
    expect(q).toContain("[Microsoft.VSTS.Common.StateChangeDate] <= @Today - 9");
  });

  it("bugüne kadar olan aralıkta üst sınır koymaz, proje yoksa proje koşulu yazmaz", () => {
    const q = itemsWiql(["Closed"], { from: "2026-10-01", to: toDateInput(now) }, now);
    expect(q).not.toContain("<=");
    expect(q).not.toContain("TeamProject");
  });

  it("link sorgusu Source önekini kullanır", () => {
    const q = linksWiql(["Closed"], opts, now, "P");
    expect(q).toContain("FROM WorkItemLinks");
    expect(q).toContain("Source.[System.State] IN ('Closed')");
    expect(q).toContain("Hierarchy-Forward");
  });
});

describe("formatDays", () => {
  const u = { day: "gün", hour: "sa" };
  it("bir günden kısayı saat, uzunu gün yazar", () => {
    expect(formatDays(0.5, u, "tr-TR")).toBe("12 sa");
    expect(formatDays(3.25, u, "tr-TR")).toBe("3,3 gün");
    expect(formatDays(undefined, u, "tr-TR")).toBe("—");
    expect(formatDays((36 * 3_600_000) / DAY_MS, u, "en-US")).toBe("1.5 gün");
  });
});
