import { describe, expect, it } from "vitest";
import {
  buildReport,
  childCounts,
  childLinksWiql,
  cycleStats,
  DAY_MS,
  formatDays,
  groupStats,
  hasRole,
  isClosedRaw,
  inRange,
  itemsWiql,
  linksWiql,
  missingParentIds,
  percentile,
  reportWiql,
  splitParents,
  stats,
  exportRows,
  toCsv,
  toDateInput,
  toItems,
  toLinks,
  toOpenParents,
  weekly,
  weekStart,
  withCancelled,
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

describe("listede olmayan parent'lar", () => {
  const children = toItems(
    [
      raw(10, { "System.CreatedDate": iso(2026, 1, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 5), "System.Parent": 100 }),
      raw(11, { "System.CreatedDate": iso(2026, 1, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 6), "System.Parent": 100 }),
      raw(12, { "System.CreatedDate": iso(2026, 1, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 6), "System.Parent": 10 }),
      raw(13, { "System.CreatedDate": iso(2026, 1, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 6), "System.Parent": 200 }),
    ],
    "b/",
  );
  const parents = [
    // Açık: StateChangeDate dolu olsa da kapalı sayılmaz.
    raw(100, { "System.State": "Geliştirme", "System.CreatedDate": iso(2025, 12, 1), "Microsoft.VSTS.Common.StateChangeDate": iso(2026, 1, 2) }),
    raw(200, { "System.State": "tamamlandı", "System.CreatedDate": iso(2025, 12, 1), "Microsoft.VSTS.Common.StateChangeDate": iso(2026, 1, 8) }),
    null,
  ];

  it("yalnızca yüklenmemiş parent id'lerini verir", () => {
    expect(missingParentIds(children).sort()).toEqual([100, 200]);
  });

  it("kapalı ve açık parent'ları ayırır", () => {
    const { closed, open } = splitParents(parents, { byProject: new Map(), fallback: ["Tamamlandı"] });
    expect(closed.map((r) => r.id)).toEqual([200]);
    expect(open.map((r) => r.id)).toEqual([100]);

    const [p] = toOpenParents(open, "https://s/c/", children, new Date(2026, 0, 10, 12).getTime());
    expect(p).toMatchObject({ id: 100, state: "Geliştirme", closedChildren: 2, ageDays: 40, url: "https://s/c/_workitems/edit/100" });
  });

  it("sonradan okunan kapalı parent, link sorgusunda olmasa da parent sayılır", () => {
    const { closed } = splitParents(parents, { byProject: new Map(), fallback: ["Tamamlandı"] });
    const all = toItems([...children.map((c) => raw(c.id, { "System.CreatedDate": iso(2026, 1, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 6), "System.Parent": c.parentId })), ...closed], "b/", new Map([[10, 1]]));
    const parent = all.find((i) => i.id === 200)!;
    expect(parent.childCount).toBe(1);
    expect(hasRole(parent, "parent")).toBe(true);
    expect(parent.leadDays).toBe(38);
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
    expect(groupStats(items, (i) => i.type).map((r) => [r.name, r.stats.count])).toEqual([["Task", 2], ["Bug", 1]]);
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

  it("child sorgusu parent projesine ve child'ın durum değişim tarihine bakar, durumu süzmez", () => {
    const q = childLinksWiql(opts, now, { project: "Talep" });
    expect(q).toContain("Source.[System.TeamProject] = 'Talep'");
    expect(q).toContain("Target.[Microsoft.VSTS.Common.StateChangeDate] >= @Today - 41");
    expect(q).toContain("Hierarchy-Forward");
    expect(q).not.toContain("System.State");
  });

  it("alt seviyeye id ile iner; Related istenirse bağlantı türünü süzmez", () => {
    const q = childLinksWiql(opts, now, { ids: [5, 6] }, true);
    expect(q).toContain("Source.[System.Id] IN (5, 6)");
    expect(q).not.toContain("LinkType");
  });

  it("yanıttan child ve (istenirse) Related bağlantılarını ayıklar", () => {
    const relations = [
      { rel: null, source: null, target: { id: 1 } },
      { rel: "System.LinkTypes.Hierarchy-Forward", source: { id: 1 }, target: { id: 2 } },
      { rel: "System.LinkTypes.Related", source: { id: 1 }, target: { id: 3 } },
      { rel: "System.LinkTypes.Hierarchy-Reverse", source: { id: 2 }, target: { id: 1 } },
      { rel: "System.LinkTypes.Dependency-Forward", source: { id: 1 }, target: { id: 4 } },
      { rel: "Microsoft.VSTS.Common.TestedBy-Forward", source: { id: 1 }, target: { id: 5 } },
      { rel: "Microsoft.VSTS.Common.TestedBy-Reverse", source: { id: 5 }, target: { id: 1 } },
    ];
    expect(toLinks(relations)).toEqual([{ source: 1, target: 2, kind: "child" }]);
    expect(toLinks(relations, true)).toEqual([
      { source: 1, target: 2, kind: "child" },
      { source: 1, target: 3, kind: "related" },
      { source: 1, target: 5, kind: "tested" },
    ]);
  });

  it("Related / Tested By ile ulaşılan kayıt child sayılır, bağlı olduğu kayıt parent sayılır", () => {
    const items = toItems(
      [
        raw(1, { "System.CreatedDate": iso(2026, 1, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 9) }),
        raw(3, { "System.CreatedDate": iso(2026, 1, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 5) }),
        // Parent'ı olan kayıtta Related bilgisi kullanılmaz.
        raw(4, { "System.CreatedDate": iso(2026, 1, 1), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 5), "System.Parent": 3 }),
      ],
      "b/",
      undefined,
      new Map([[3, { to: 1, via: "tested" as const }], [4, { to: 1, via: "related" as const }]]),
    );
    expect(items.map((i) => [i.id, i.relatedTo, i.via, i.childCount])).toEqual([[1, undefined, undefined, 1], [3, 1, "tested", 1], [4, undefined, undefined, 0]]);
    expect(hasRole(items[1], "child")).toBe(true);
    expect(hasRole(items[1], "standalone")).toBe(false);
  });

  it("kapalılığı kaydın kendi projesinin durumlarına göre belirler", () => {
    const states = { byProject: new Map([["A", ["Canlıda"]]]), fallback: ["Closed"] };
    const item = (project: string, state: string, extra = {}) => raw(1, { "System.TeamProject": project, "System.State": state, ...extra });
    expect(isClosedRaw(item("A", "canlıda"), states)).toBe(true);
    // Projesi bilinen kayıtta varsayılan adlar ve ClosedDate geçerli değildir.
    expect(isClosedRaw(item("A", "Closed", { "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 1) }), states)).toBe(false);
    expect(isClosedRaw(item("B", "Closed"), states)).toBe(true);
    expect(isClosedRaw(item("B", "Test", { "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 1) }), states)).toBe(true);
    expect(isClosedRaw(item("B", "Test"), states)).toBe(false);
  });

  it("iptal durumlarını büyük/küçük harf ayırmadan kapalı sayar", () => {
    const states = { byProject: new Map([["A", withCancelled(["Tamamlandı"])]]), fallback: withCancelled(["Closed"]) };
    for (const name of ["İptal", "iptal", "IPTAL", "İPTAL"]) {
      expect(isClosedRaw(raw(1, { "System.TeamProject": "A", "System.State": name }), states)).toBe(true);
      expect(isClosedRaw(raw(1, { "System.TeamProject": "B", "System.State": name }), states)).toBe(true);
    }
    expect(itemsWiql(withCancelled(["Tamamlandı"]), opts, now)).toContain("IN ('Tamamlandı', 'İptal', 'iptal', 'Iptal')");
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

describe("csv", () => {
  it("ayırıcıyı, tırnağı ve ondalık işaretini uygular; formülleri etkisizleştirir", () => {
    const csv = toCsv([["ID", "Başlık", "Süre"], [7, 'a;b "c"', 3.25], [8, "=SUM(A1)", undefined]], ";", ",");
    expect(csv).toBe('ID;Başlık;Süre\r\n7;"a;b ""c""";3,25\r\n8;\'=SUM(A1);');
  });

  it("kayıtları satıra çevirir", () => {
    const [item] = toItems(
      [raw(2, { "System.TeamProject": "P", "System.CreatedDate": iso(2026, 1, 2), "Microsoft.VSTS.Common.ClosedDate": iso(2026, 1, 4), "System.Parent": 1 })],
      "b/",
    );
    expect(exportRows([item])[0]).toEqual([2, "t2", "Task", "Closed", "P", undefined, 1, "Child", 0, "2026-01-02 12:00", "2026-01-04 12:00", 2, undefined]);
  });
});

describe("rapor", () => {
  const states = { byProject: new Map(), fallback: ["Closed"] };
  const opts = { from: "2026-03-01", to: "2026-03-31" };
  const item = (id: number, type: string, created: string, closed?: string) =>
    raw(id, {
      "System.WorkItemType": type,
      "System.State": closed ? "Closed" : "Active",
      "System.CreatedDate": created,
      "Microsoft.VSTS.Common.StateChangeDate": closed ?? created,
    });

  it("kart tipine göre açılan ve kapananları ayırır", () => {
    const report = buildReport(
      [
        item(1, "Dev", iso(2026, 3, 2), iso(2026, 3, 12)), // açılıp kapanan, 10 gün
        item(2, "Dev", iso(2026, 3, 5)), // hâlâ açık
        item(3, "Dev", iso(2026, 3, 20), iso(2026, 4, 9)), // aralıktan sonra kapandı: aralık sonunda açık
        item(4, "Dev", iso(2026, 2, 10), iso(2026, 3, 2)), // önceden açılıp kapanan, 20 gün
        item(5, "Bug", iso(2026, 3, 31, 23), iso(2026, 3, 31, 23)), // son gün dahil
        item(6, "Bug", iso(2026, 1, 1), iso(2026, 2, 1)), // aralık dışı
        item(7, "Bug", iso(2026, 1, 1)), // önceden açılmış, hâlâ açık: sayılmaz
      ],
      states,
      opts,
    );
    expect(report.rows).toEqual([
      { type: "Dev", openedClosed: 1, stillOpen: 2, closedOlder: 1, median: 15 },
      { type: "Bug", openedClosed: 1, stillOpen: 0, closedOlder: 0, median: 0 },
    ]);
    expect(report.total).toEqual({ type: "", openedClosed: 2, stillOpen: 2, closedOlder: 1, median: 10 });
  });

  it("seçilen kart tiplerini sayar; toplam da onlara göredir", () => {
    const data = [
      item(1, "Dev", iso(2026, 3, 2), iso(2026, 3, 12)),
      item(2, "HotFix", iso(2026, 3, 5)),
      item(3, "Bug", iso(2026, 3, 5), iso(2026, 3, 7)),
    ];
    const report = buildReport(data, states, { ...opts, types: ["dev", " HOTFIX "] });
    expect(report.rows.map((r) => r.type).sort()).toEqual(["Dev", "HotFix"]);
    expect(report.total).toEqual({ type: "", openedClosed: 1, stillOpen: 1, closedOlder: 0, median: 10 });
    expect(buildReport(data, states, { ...opts, types: [] }).rows.length).toBe(3);
  });

  it("aday sorgusu açılışı ya da durum değişimi aralıkta olanları iki uçtan sınırlı sorar", () => {
    const now = new Date(2026, 10, 10, 15).getTime();
    const q = reportWiql({ from: "2026-01-01", to: "2026-02-01" }, now, "P");
    expect(q).toContain("[System.TeamProject] = 'P'");
    expect(q).toContain(
      "(([System.CreatedDate] >= @Today - 314 AND [System.CreatedDate] <= @Today - 281) OR " +
        "([Microsoft.VSTS.Common.StateChangeDate] >= @Today - 314 AND [Microsoft.VSTS.Common.StateChangeDate] <= @Today - 281))",
    );
  });

  it("alt kayıt sorgusu istenen tarihe göre süzer", () => {
    const now = new Date(2026, 10, 10, 15).getTime();
    const o = { from: "2026-01-01", to: "2026-02-01" };
    expect(childLinksWiql(o, now, { ids: [1] }, false, "created")).toContain("Target.[System.CreatedDate] <= @Today - 281");
    expect(childLinksWiql(o, now, { ids: [1] }, false, "created")).not.toContain("StateChangeDate");
    expect(childLinksWiql(o, now, { ids: [1] }, false, "either")).toContain(") OR (Target.[Microsoft.VSTS.Common.StateChangeDate] >= @Today - 314");
  });
});
