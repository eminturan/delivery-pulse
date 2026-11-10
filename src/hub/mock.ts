import { DataSource, DAY_MS, inRange, Item } from "./logic";

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
      state: "Tamamlandı",
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
  return items;
}

export const mockSource: DataSource = {
  async load(opts) {
    await new Promise((r) => setTimeout(r, 300));
    return {
      items: inRange(build(Date.now()), opts),
      project: "Örnek Proje",
      closedStates: ["Tamamlandı", "Closed"],
      truncated: false,
      warnings: [],
    };
  },
};
