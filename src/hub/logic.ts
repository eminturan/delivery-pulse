/** Saf hesaplama: sunucuya ya da arayüze bağlı değildir, testleri tests/logic.test.ts içindedir. */

export interface RawWorkItem {
  id: number;
  fields: Record<string, unknown>;
}

export interface Item {
  id: number;
  title: string;
  type: string;
  state: string;
  assignee?: string;
  /** Epoch ms. */
  created: number;
  closed: number;
  activated?: number;
  parentId?: number;
  /** Kapalı ya da açık, doğrudan bağlı child sayısı. */
  childCount: number;
  /** Açılıştan kapanışa geçen gün. */
  leadDays: number;
  /** İlk aktifleşmeden kapanışa geçen gün; aktifleşme tarihi yoksa boş. */
  cycleDays?: number;
  url: string;
}

/** parent: child'ı olan; child: parent'ı olan; standalone: ikisi de olmayan. Bir kayıt hem parent hem child olabilir. */
export type Role = "parent" | "child" | "standalone";
export const ROLES: Role[] = ["parent", "child", "standalone"];

export interface Stats {
  count: number;
  avg: number;
  median: number;
  p85: number;
  min: number;
  max: number;
}

export interface Week {
  /** Haftanın pazartesi günü, yerel saat, epoch ms. */
  start: number;
  count: number;
  median: number;
}

export interface LoadOptions {
  /** YYYY-AA-GG, yerel gün. */
  from: string;
  to: string;
}

export interface PulseData {
  items: Item[];
  project?: string;
  /** Kapalı sayılan durum adları. */
  closedStates: string[];
  /** Sunucu sınırı nedeniyle listenin kesilip kesilmediği. */
  truncated: boolean;
  warnings: string[];
}

export interface DataSource {
  load(opts: LoadOptions): Promise<PulseData>;
}

export const DAY_MS = 86_400_000;
/** Proje durumları okunamazsa kapalı sayılan durumlar. İptal edilen işler teslimat sayılmaz. */
export const DEFAULT_CLOSED_STATES = ["Closed", "Done", "Completed", "Tamamlandı"];

export const withSlash = (url: string) => (url.endsWith("/") ? url : `${url}/`);

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** En fazla `limit` işi aynı anda çalıştırır; sonuç sırası girdi sırasıdır. */
export async function mapLimit<T, R>(list: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await run(list[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

/** Yerel günün başlangıcı (YYYY-AA-GG → epoch ms); geçersizse NaN. */
export function dayStart(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
}

export function toDateInput(time: number): string {
  const d = new Date(time);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Bugünden kaç gün önce (yerel gün farkı). */
export function daysAgo(date: string, now: number): number {
  return Math.round((dayStart(toDateInput(now)) - dayStart(date)) / DAY_MS);
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Kapanış koşulu. Tarih yazmak yerine @Today'e göre gün farkı kullanılır (sunucunun tarih biçimine
 * bağlı kalmaz); saat dilimi farkı için iki uçta birer gün pay bırakılır, kesin süzme tarayıcıdadır.
 * Kapanış anı olarak StateChangeDate kullanılır: ClosedDate özel durum adlarında dolmayabilir.
 */
function closedClause(prefix: string, states: string[], opts: LoadOptions, now: number, project?: string): string {
  const f = (name: string) => `${prefix}[${name}]`;
  const parts = [`${f("System.State")} IN (${states.map(quote).join(", ")})`];
  if (project) parts.unshift(`${f("System.TeamProject")} = ${quote(project)}`);
  const fromAgo = daysAgo(opts.from, now);
  const toAgo = daysAgo(opts.to, now);
  if (!Number.isNaN(fromAgo)) parts.push(`${f("Microsoft.VSTS.Common.StateChangeDate")} >= @Today - ${fromAgo + 1}`);
  if (!Number.isNaN(toAgo) && toAgo > 1) parts.push(`${f("Microsoft.VSTS.Common.StateChangeDate")} <= @Today - ${toAgo - 1}`);
  return parts.join(" AND ");
}

/** Aralıkta kapanmış work item'lar. */
export function itemsWiql(states: string[], opts: LoadOptions, now: number, project?: string): string {
  return `SELECT [System.Id] FROM WorkItems WHERE ${closedClause("", states, opts, now, project)} ORDER BY [Microsoft.VSTS.Common.StateChangeDate] DESC`;
}

/** Aralıkta kapanmış work item'ların (kapalı ya da açık) child bağlantıları. */
export function linksWiql(states: string[], opts: LoadOptions, now: number, project?: string): string {
  return `SELECT [System.Id] FROM WorkItemLinks WHERE ${closedClause("Source.", states, opts, now, project)} AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' MODE (MustContain)`;
}

export interface RawRelation {
  source?: { id: number } | null;
  target?: { id: number } | null;
}

/** Link sorgusu yanıtından parent id → child sayısı. */
export function childCounts(relations: RawRelation[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const r of relations) {
    if (r.source?.id && r.target?.id) counts.set(r.source.id, (counts.get(r.source.id) ?? 0) + 1);
  }
  return counts;
}

const time = (v: unknown): number | undefined => {
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  // Hiç dolmamış tarih alanları sunucudan 9999 yılı olarak gelebilir.
  return Number.isNaN(t) || t > Date.UTC(9000, 0) ? undefined : t;
};

const personName = (v: unknown): string | undefined => {
  if (typeof v === "string") return v.replace(/\s*<[^>]*>$/, "");
  if (v && typeof v === "object") return (v as { displayName?: string }).displayName;
  return undefined;
};

/**
 * @param counts Link sorgusundan gelen child sayıları; yoksa (sorgu başarısızsa) yüklenen kayıtların
 *               parent alanından türetilir, bu durumda yalnızca aralıkta kapanan child'lar sayılır.
 */
export function toItems(raw: (RawWorkItem | null)[], baseUrl: string, counts?: Map<number, number>): Item[] {
  const items: Item[] = [];
  for (const r of raw) {
    if (!r) continue;
    const f = r.fields;
    const created = time(f["System.CreatedDate"]);
    const closed = time(f["Microsoft.VSTS.Common.ClosedDate"]) ?? time(f["Microsoft.VSTS.Common.StateChangeDate"]);
    if (created === undefined || closed === undefined || closed < created) continue;
    const activated = time(f["Microsoft.VSTS.Common.ActivatedDate"]);
    const parent = f["System.Parent"];
    items.push({
      id: r.id,
      title: String(f["System.Title"] ?? ""),
      type: String(f["System.WorkItemType"] ?? ""),
      state: String(f["System.State"] ?? ""),
      assignee: personName(f["System.AssignedTo"]),
      created,
      closed,
      activated,
      parentId: typeof parent === "number" ? parent : undefined,
      childCount: 0,
      leadDays: (closed - created) / DAY_MS,
      cycleDays: activated !== undefined && activated >= created && activated <= closed ? (closed - activated) / DAY_MS : undefined,
      url: `${withSlash(baseUrl)}_workitems/edit/${r.id}`,
    });
  }
  const derived = new Map<number, number>();
  if (!counts) for (const i of items) if (i.parentId) derived.set(i.parentId, (derived.get(i.parentId) ?? 0) + 1);
  for (const i of items) i.childCount = (counts ?? derived).get(i.id) ?? 0;
  return items;
}

/** Kapanışı [from, to] yerel gün aralığına düşen kayıtlar. */
export function inRange(items: Item[], opts: LoadOptions): Item[] {
  const from = dayStart(opts.from);
  const to = dayStart(opts.to) + DAY_MS;
  return items.filter((i) => (Number.isNaN(from) || i.closed >= from) && (Number.isNaN(to) || i.closed < to));
}

export function hasRole(item: Item, role: Role): boolean {
  if (role === "parent") return item.childCount > 0;
  if (role === "child") return item.parentId !== undefined;
  return item.childCount === 0 && item.parentId === undefined;
}

/** Sıralı listede doğrusal ara değerli yüzdelik (p: 0–1). */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function stats(values: number[]): Stats | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  return {
    count: s.length,
    avg: s.reduce((a, b) => a + b, 0) / s.length,
    median: percentile(s, 0.5),
    p85: percentile(s, 0.85),
    min: s[0],
    max: s[s.length - 1],
  };
}

export const leadStats = (items: Item[]) => stats(items.map((i) => i.leadDays));
export const cycleStats = (items: Item[]) =>
  stats(items.map((i) => i.cycleDays).filter((d): d is number => d !== undefined));

/** Yerel saate göre haftanın pazartesisi. */
export function weekStart(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
}

/** Kapanış haftasına göre adet ve medyan lead time; eskiden yeniye. */
export function weekly(items: Item[]): Week[] {
  const groups = new Map<number, number[]>();
  for (const i of items) {
    const w = weekStart(i.closed);
    groups.set(w, [...(groups.get(w) ?? []), i.leadDays]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, days]) => ({ start, count: days.length, median: stats(days)!.median }));
}

/** Work item türüne göre lead time; en çok kayıt olan tür önce. */
export function byType(items: Item[]): { type: string; stats: Stats }[] {
  const groups = new Map<string, number[]>();
  for (const i of items) groups.set(i.type, [...(groups.get(i.type) ?? []), i.leadDays]);
  return [...groups.entries()]
    .map(([type, days]) => ({ type, stats: stats(days)! }))
    .sort((a, b) => b.stats.count - a.stats.count || a.type.localeCompare(b.type));
}

/** Süre metni: bir günden kısaysa saat, değilse bir ondalıklı gün. */
export function formatDays(days: number | undefined, units: { day: string; hour: string }, locale: string): string {
  if (days === undefined || Number.isNaN(days)) return "—";
  if (days < 1) return `${Math.max(0, Math.round(days * 24))} ${units.hour}`;
  return `${days.toLocaleString(locale, { maximumFractionDigits: 1 })} ${units.day}`;
}

export function matches(query: string, ...texts: (string | number | undefined)[]): boolean {
  const q = query.trim().toLocaleLowerCase("tr");
  return !q || texts.some((t) => t !== undefined && String(t).toLocaleLowerCase("tr").includes(q));
}
