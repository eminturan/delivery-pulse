import { DataSource, DAY_MS, dayStart, inRange, Item, ListItem, summarize } from "./logic";

const OPEN_PARENT_ID = 900;

/** `npm run dev` için örnek veri: Feature → User Story → Task hiyerarşisi ve bağımsız Bug'lar. */
function build(now: number): Item[] {
  // Her açılışta aynı veriyi üreten basit sözde rastgele sayı.
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const items: Item[] = [];
  let id = 1000;
  const add = (type: string, title: string, closedAgo: number, lead: number, parentId?: number, childCount = 0) => {
    const closed = now - closedAgo * DAY_MS;
    const created = closed - lead * DAY_MS;
    const cycle = lead * (0.4 + rnd() * 0.4);
    items.push({
      id: ++id,
      title,
      type,
      // Her yedinci kayıt iptal edilmiş: "İptal edilenleri hariç tut" seçeneği denenebilsin.
      state: id % 7 === 6 ? "İptal" : "Tamamlandı",
      // Parent'lar tek projede, child'lar farklı projelerde.
      project: type === "Feature" ? "Talep Yönetimi" : ["Mobil", "Kredi", "Ödemeler"][Math.floor(rnd() * 3)],
      assignee: ["Ayşe Yılmaz", "Mehmet Demir", "Zeynep Kaya", "Can Öztürk"][Math.floor(rnd() * 4)],
      created,
      closed,
      activated: closed - cycle * DAY_MS,
      parentId,
      childCount,
      leadDays: lead,
      cycleDays: cycle,
      url: `#${id}`,
    });
    return id;
  };
  for (let f = 0; f < 6; f++) {
    const featureAgo = 2 + f * 13 + rnd() * 5;
    const feature = add("Feature", `Örnek özellik ${f + 1}`, featureAgo, 30 + rnd() * 40, undefined, 3);
    for (let s = 0; s < 3; s++) {
      const storyAgo = featureAgo + 1 + rnd() * 10;
      const story = add("User Story", `Özellik ${f + 1} — hikâye ${s + 1}`, storyAgo, 6 + rnd() * 18, feature, 2);
      for (let t = 0; t < 2; t++) add("Task", `Hikâye ${s + 1} — görev ${t + 1}`, storyAgo + rnd() * 3, 0.2 + rnd() * 5, story);
    }
  }
  for (let b = 0; b < 14; b++) add("Bug", `Örnek hata ${b + 1}`, rnd() * 85, 0.3 + rnd() * 9);
  // Parent'ı hâlâ açık olan child'lar.
  for (let t = 0; t < 4; t++) add("Task", `Açık talep — görev ${t + 1}`, 5 + rnd() * 40, 1 + rnd() * 12, OPEN_PARENT_ID);
  // Related ve Tested By bağlantısıyla ilk özelliğe bağlı kayıtlar.
  for (let r = 0; r < 4; r++) {
    add(r < 2 ? "Bug" : "Test Case", r < 2 ? `İlişkili hata ${r + 1}` : `Test kartı ${r - 1}`, 4 + rnd() * 50, 1 + rnd() * 6);
    Object.assign(items[items.length - 1], { relatedTo: 1001, via: r < 2 ? "related" : "tested" });
  }
  return items;
}

export const mockSource: DataSource = {
  async loadReport(opts) {
    await new Promise((r) => setTimeout(r, 300));
    const from = dayStart(opts.from);
    const end = dayStart(opts.to) + DAY_MS;
    const wanted = (opts.types ?? []).map((s) => s.toLowerCase());
    const items: ListItem[] = [];
    for (const i of build(Date.now())) {
      if (wanted.length > 0 && !wanted.includes(i.type.toLowerCase())) continue;
      const opened = i.created >= from && i.created < end;
      const closed = i.closed >= from && i.closed < end;
      if (opened && closed) items.push({ ...i, flow: "openedClosed" });
      else if (closed) items.push({ ...i, flow: "closedOlder" });
      // Her üçüncü kaydın açık bir eşi: aralıkta açılmış, henüz kapanmamış.
      if (opened && i.id % 3 === 0)
        items.push({ ...i, id: i.id + 5000, title: `${i.title} (devam ediyor)`, state: "Aktif", closed: undefined, leadDays: undefined, cycleDays: undefined, childCount: 0, flow: "stillOpen" });
    }
    return { ...summarize(items), items, truncated: false, warnings: [] };
  },
  async load(opts) {
    await new Promise((r) => setTimeout(r, 300));
    const now = Date.now();
    const items = inRange(build(now), opts).filter((i) => opts.related || i.relatedTo === undefined);
    return {
      items,
      openParents: [
        {
          id: OPEN_PARENT_ID,
          title: "Örnek açık talep",
          type: "Feature",
          state: "Geliştirme",
          assignee: "Zeynep Kaya",
          created: now - 140 * DAY_MS,
          ageDays: 140,
          closedChildren: items.filter((i) => i.parentId === OPEN_PARENT_ID).length,
          url: `#${OPEN_PARENT_ID}`,
        },
      ].filter((p) => p.closedChildren > 0),
      parentsOutOfRange: 0,
      project: "Talep Yönetimi",
      closedStates: ["Tamamlandı", "Closed", "İptal"],
      truncated: false,
      warnings: [],
    };
  },
};
