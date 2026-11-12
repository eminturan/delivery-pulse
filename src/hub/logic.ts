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
  project: string;
  assignee?: string;
  /** Epoch ms. */
  created: number;
  closed: number;
  activated?: number;
  parentId?: number;
  /** Parent'ı olmayan ama Related ya da Tested By bağlantısıyla ulaşılan kaydın bağlı olduğu kayıt. */
  relatedTo?: number;
  /** `relatedTo` bağlantısının türü. */
  via?: Via;
  /** Kapalı ya da açık, doğrudan bağlı child sayısı. */
  childCount: number;
  /** Açılıştan kapanışa geçen gün. */
  leadDays: number;
  /** İlk aktifleşmeden kapanışa geçen gün; aktifleşme tarihi yoksa boş. */
  cycleDays?: number;
  url: string;
}

/** Rapor grupları: aralıkta açılıp kapanan, aralıkta açılıp hâlâ açık olan, önceden açılıp aralıkta kapanan. */
export type Flow = "openedClosed" | "stillOpen" | "closedOlder";
export const FLOWS: Flow[] = ["openedClosed", "stillOpen", "closedOlder"];

/** Listede gösterilen kayıt: kapanmamış olabilir (o zaman kapanış ve lead time boştur). */
export type ListItem = Omit<Item, "closed" | "leadDays"> & { closed?: number; leadDays?: number; flow?: Flow };

export type Via = "related" | "tested";

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
  /** Related ve Tested By bağlantıları da child bağlantısı gibi izlenir. */
  related?: boolean;
  /** Yalnızca rapor widget'ı: sayılacak kart tipleri; boşsa hepsi. */
  types?: string[];
}

/** Child'ları aralıkta kapanmış ama kendisi kapalı olmayan parent. */
export interface OpenParent {
  id: number;
  title: string;
  type: string;
  state: string;
  assignee?: string;
  created: number;
  /** Açılıştan bugüne geçen gün. */
  ageDays: number;
  /** Aralıkta kapanan child sayısı. */
  closedChildren: number;
  url: string;
}

export interface PulseData {
  items: Item[];
  /** Kapanan child'ların hâlâ açık olan parent'ları (başka projede olabilirler). */
  openParents: OpenParent[];
  /** Kapanan child'ların, seçilen aralığın dışında kapanmış parent sayısı. */
  parentsOutOfRange: number;
  project?: string;
  /** Kapalı sayılan durum adları. */
  closedStates: string[];
  /** Sunucu sınırı nedeniyle listenin kesilip kesilmediği. */
  truncated: boolean;
  warnings: string[];
}

/** Rapor widget'ında bir kart tipinin (ya da toplamın) satırı. */
export interface ReportRow {
  type: string;
  /** Aralıkta açılıp aralıkta kapanan. */
  openedClosed: number;
  /** Aralıkta açılan ve aralık sonunda kapanmamış olan. */
  stillOpen: number;
  /** Aralıktan önce açılıp aralıkta kapanan. */
  closedOlder: number;
  /** Aralıkta açılıp aralıkta kapananların ortalama lead time'ı (gün). */
  avg?: number;
  /** Aralıkta açılıp aralıkta kapananların medyan lead time'ı (gün). */
  median?: number;
}

export interface ReportData {
  rows: ReportRow[];
  total: ReportRow;
  /** Sayılan kayıtlar; her birinin `flow` alanı hangi gruba girdiğini söyler. */
  items: ListItem[];
  truncated: boolean;
  warnings: string[];
}

export interface DataSource {
  load(opts: LoadOptions): Promise<PulseData>;
  loadReport(opts: LoadOptions): Promise<ReportData>;
}

export const DAY_MS = 86_400_000;
/** Proje durumları okunamazsa kapalı sayılan durumlar. */
export const DEFAULT_CLOSED_STATES = ["Closed", "Done", "Completed", "Tamamlandı"];
/**
 * Kategorisi ne olursa olsun kapalı sayılan durumlar: iptal edilen işin de süreci bitmiştir.
 * Sunucunun harf duyarlılığına bağlı kalmamak için yazım biçimleri ayrı ayrı yer alır.
 */
export const CANCELLED_STATES = ["İptal", "iptal", "Iptal"];

/** Kayıt iptal durumunda mı (büyük/küçük harf ayırmadan). */
export const isCancelled = (i: { state: string }) => lower(i.state) === "iptal";

/** Durum listesine iptal durumlarını ekler (yinelenmeden). */
export const withCancelled = (states: string[]) => [...new Set([...states, ...CANCELLED_STATES])];

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

/**
 * Aralığı gün sınırından ikiye böler; tek günlük ya da geçersiz aralık bölünemez.
 * Sunucu sınırına takılan sorgu daha dar aralıklarla yeniden çalıştırılırken kullanılır.
 */
export function splitRange<T extends { from: string; to: string }>(opts: T): [T, T] | undefined {
  const from = dayStart(opts.from);
  const to = dayStart(opts.to);
  const days = Math.round((to - from) / DAY_MS);
  if (Number.isNaN(days) || days < 1) return undefined;
  // Gün ortasına eklenir: yaz/kış saati geçişinde gün kaymaz.
  const day = (n: number) => toDateInput(from + n * DAY_MS + DAY_MS / 2);
  const half = Math.floor(days / 2);
  return [
    { ...opts, to: day(half) },
    { ...opts, from: day(half + 1) },
  ];
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Kapanış koşulu. Tarih yazmak yerine @Today'e göre gün farkı kullanılır (sunucunun tarih biçimine
 * bağlı kalmaz); saat dilimi farkı için iki uçta birer gün pay bırakılır, kesin süzme tarayıcıdadır.
 * Kapanış anı olarak StateChangeDate kullanılır: ClosedDate özel durum adlarında dolmayabilir.
 */
const STATE_CHANGE = "Microsoft.VSTS.Common.StateChangeDate";

function rangeParts(prefix: string, opts: LoadOptions, now: number, name = STATE_CHANGE): string[] {
  const field = `${prefix}[${name}]`;
  const parts: string[] = [];
  const fromAgo = daysAgo(opts.from, now);
  const toAgo = daysAgo(opts.to, now);
  if (!Number.isNaN(fromAgo)) parts.push(`${field} >= @Today - ${fromAgo + 1}`);
  if (!Number.isNaN(toAgo) && toAgo > 1) parts.push(`${field} <= @Today - ${toAgo - 1}`);
  return parts;
}

function closedClause(prefix: string, states: string[], opts: LoadOptions, now: number, project?: string): string {
  const f = (name: string) => `${prefix}[${name}]`;
  const parts = [`${f("System.State")} IN (${states.map(quote).join(", ")})`, ...rangeParts(prefix, opts, now)];
  if (project) parts.unshift(`${f("System.TeamProject")} = ${quote(project)}`);
  return parts.join(" AND ");
}

const HIERARCHY = "System.LinkTypes.Hierarchy-Forward";

export type DateMatch = "state" | "created" | "either";

/** Aralık koşulu; "either" için açılışı ya da durum değişimi aralıkta olanlar. Aralık geçersizse boş. */
function dateClause(prefix: string, opts: LoadOptions, now: number, match: DateMatch): string[] {
  const state = rangeParts(prefix, opts, now);
  const created = rangeParts(prefix, opts, now, "System.CreatedDate");
  if (match === "state") return state;
  if (match === "created") return created;
  return state.length ? [`((${created.join(" AND ")}) OR (${state.join(" AND ")}))`] : [];
}

/** Bağlantının çıktığı kayıtlar: bir projenin tüm kayıtları ya da belirli id'ler (alt seviyelere inerken). */
export type LinkSource = { project: string } | { ids: number[] };

/**
 * Kaynağa bağlı olan ve aralıkta durumu değişen kayıtlar; hangi projede olurlarsa olsunlar.
 * Hedef projelerin kapalı durum adları farklı olabildiği için durum burada süzülmez, kayıtlar
 * okunduktan sonra kendi projelerinin durumlarına göre ayıklanır.
 * @param related true ise bağlantı türü süzülmez (yanıt `toLinks` ile ayıklanır): Related ve Tested By'ın
 *                WIQL'deki adları sunucuya göre değişebildiği için tür adı sorguya yazılmaz.
 */
export function childLinksWiql(
  opts: LoadOptions,
  now: number,
  source: LinkSource,
  related = false,
  /** Hedefin hangi tarihi aralığa düşmeli: durum değişimi, açılış ya da ikisinden biri. */
  match: DateMatch = "state",
): string {
  const from =
    "project" in source
      ? `Source.[System.TeamProject] = ${quote(source.project)}`
      : `Source.[System.Id] IN (${source.ids.join(", ")})`;
  const parts = [from, ...dateClause("Target.", opts, now, match)];
  if (!related) parts.push(`[System.Links.LinkType] = '${HIERARCHY}'`);
  return `SELECT [System.Id] FROM WorkItemLinks WHERE ${parts.join(" AND ")} MODE (MustContain)`;
}

export interface Link {
  source: number;
  target: number;
  kind: "child" | Via;
}

/**
 * Link sorgusu yanıtından parent→child bağlantıları ve (istenirse) Related ile Tested By bağlantıları;
 * diğer türler atılır. Tested By yalnızca işten teste doğru izlenir (testten işe "Tests" yönü alınmaz).
 */
export function toLinks(relations: RawRelation[], related = false): Link[] {
  const out: Link[] = [];
  for (const r of relations) {
    if (!r.source?.id || !r.target?.id) continue;
    const rel = r.rel ?? HIERARCHY;
    const kind =
      rel === HIERARCHY
        ? "child"
        : !related
          ? undefined
          : rel.startsWith("System.LinkTypes.Related")
            ? "related"
            : rel === "Microsoft.VSTS.Common.TestedBy-Forward"
              ? "tested"
              : undefined;
    if (kind) out.push({ source: r.source.id, target: r.target.id, kind });
  }
  return out;
}

/** Kapalı sayılan durumlar: projesi bilinen kayıt için o projenin durumları, bilinmeyen için `fallback`. */
export interface ClosedStates {
  byProject: Map<string, string[]>;
  fallback: string[];
}

/**
 * Büyük/küçük harf ayırmadan karşılaştırma için: Türkçe kurala göre küçültür, sonra ı'yı i sayar.
 * Böylece hem "İPTAL"/"iptal" hem de "HOTFIX"/"HotFix" eşleşir.
 */
const lower = (s: unknown) => String(s ?? "").toLocaleLowerCase("tr").replace(/ı/g, "i");

/** Projesinin durumları bilinmiyorsa ClosedDate'i dolu olan kayıt da kapalı sayılır. */
export function isClosedRaw(r: RawWorkItem, states: ClosedStates): boolean {
  const known = states.byProject.get(String(r.fields["System.TeamProject"] ?? ""));
  const state = lower(r.fields["System.State"]);
  if (known) return known.some((s) => lower(s) === state);
  return states.fallback.some((s) => lower(s) === state) || time(r.fields["Microsoft.VSTS.Common.ClosedDate"]) !== undefined;
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
  rel?: string | null;
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
 * @param counts Link sorgusundan gelen child sayıları; bir kayıt orada yoksa yüklenen kayıtların
 *               parent alanından türetilir, bu durumda yalnızca aralıkta kapanan child'lar sayılır.
 */
export function toItems(
  raw: (RawWorkItem | null)[],
  baseUrl: string,
  counts?: Map<number, number>,
  /** Related / Tested By bağlantısıyla ulaşılan kayıt id'si → bağlı olduğu kayıt ve bağlantı türü. */
  relatedTo?: Map<number, { to: number; via: Via }>,
): Item[] {
  const items: Item[] = [];
  for (const r of raw) {
    if (!r) continue;
    const f = r.fields;
    const created = time(f["System.CreatedDate"]);
    const closed = time(f["Microsoft.VSTS.Common.ClosedDate"]) ?? time(f["Microsoft.VSTS.Common.StateChangeDate"]);
    if (created === undefined || closed === undefined || closed < created) continue;
    items.push({ ...describe(r, created, closed, baseUrl, relatedTo), closed, leadDays: (closed - created) / DAY_MS });
  }
  countChildren(items, counts);
  return items;
}

/** Ham kaydın liste satırı; `closed` verilmezse kayıt açık sayılır. */
function describe(
  r: RawWorkItem,
  created: number,
  closed: number | undefined,
  baseUrl: string,
  relatedTo?: Map<number, { to: number; via: Via }>,
): ListItem {
  const f = r.fields;
  const activated = time(f["Microsoft.VSTS.Common.ActivatedDate"]);
  const parent = f["System.Parent"];
  return {
    id: r.id,
    title: String(f["System.Title"] ?? ""),
    type: String(f["System.WorkItemType"] ?? ""),
    state: String(f["System.State"] ?? ""),
    project: String(f["System.TeamProject"] ?? ""),
    assignee: personName(f["System.AssignedTo"]),
    created,
    closed,
    activated,
    parentId: typeof parent === "number" ? parent : undefined,
    relatedTo: typeof parent === "number" ? undefined : relatedTo?.get(r.id)?.to,
    via: typeof parent === "number" ? undefined : relatedTo?.get(r.id)?.via,
    childCount: 0,
    leadDays: closed === undefined ? undefined : (closed - created) / DAY_MS,
    cycleDays:
      closed !== undefined && activated !== undefined && activated >= created && activated <= closed
        ? (closed - activated) / DAY_MS
        : undefined,
    url: `${withSlash(baseUrl)}_workitems/edit/${r.id}`,
  };
}

/** Child sayıları: link sorgusunun kapsamadığı kayıtlar (başka projedeki parent'lar) için listeden türetilir. */
function countChildren(items: ListItem[], counts?: Map<number, number>) {
  const derived = new Map<number, number>();
  for (const i of items) {
    const up = i.parentId ?? i.relatedTo;
    if (up) derived.set(up, (derived.get(up) ?? 0) + 1);
  }
  for (const i of items) i.childCount = counts?.get(i.id) ?? derived.get(i.id) ?? 0;
}

/** Listede olmayan parent id'leri: aralıkta ya da bu projede kapanmamış parent'lar. */
export function missingParentIds(items: Item[]): number[] {
  const loaded = new Set(items.map((i) => i.id));
  return [...new Set(items.map((i) => i.parentId).filter((p): p is number => p !== undefined && !loaded.has(p)))];
}

/** Sonradan okunan parent'ları kapalı / açık diye ayırır. */
export function splitParents(raw: (RawWorkItem | null)[], states: ClosedStates): { closed: RawWorkItem[]; open: RawWorkItem[] } {
  const closed: RawWorkItem[] = [];
  const open: RawWorkItem[] = [];
  for (const r of raw) if (r) (isClosedRaw(r, states) ? closed : open).push(r);
  return { closed, open };
}

/** @param children Aralıkta kapanan kayıtlar; her parent'ın kapanan child sayısı buradan çıkar. En yaşlı önce. */
export function toOpenParents(raw: RawWorkItem[], baseUrl: string, children: Item[], now: number): OpenParent[] {
  const counts = new Map<number, number>();
  for (const c of children) if (c.parentId) counts.set(c.parentId, (counts.get(c.parentId) ?? 0) + 1);
  return raw
    .map((r) => {
      const created = time(r.fields["System.CreatedDate"]) ?? now;
      return {
        id: r.id,
        title: String(r.fields["System.Title"] ?? ""),
        type: String(r.fields["System.WorkItemType"] ?? ""),
        state: String(r.fields["System.State"] ?? ""),
        assignee: personName(r.fields["System.AssignedTo"]),
        created,
        ageDays: Math.max(0, (now - created) / DAY_MS),
        closedChildren: counts.get(r.id) ?? 0,
        url: `${withSlash(baseUrl)}_workitems/edit/${r.id}`,
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);
}

/** Kapanışı [from, to] yerel gün aralığına düşen kayıtlar. */
export function inRange(items: Item[], opts: LoadOptions): Item[] {
  const from = dayStart(opts.from);
  const to = dayStart(opts.to) + DAY_MS;
  return items.filter((i) => (Number.isNaN(from) || i.closed >= from) && (Number.isNaN(to) || i.closed < to));
}

export function hasRole(item: Item, role: Role): boolean {
  if (role === "parent") return item.childCount > 0;
  const linked = item.parentId !== undefined || item.relatedTo !== undefined;
  if (role === "child") return linked;
  return item.childCount === 0 && !linked;
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

/** Bir alana (tür, proje) göre lead time; en çok kayıt olan grup önce. */
export function groupStats(items: Item[], key: (i: Item) => string): { name: string; stats: Stats }[] {
  const groups = new Map<string, number[]>();
  for (const i of items) {
    const list = groups.get(key(i));
    if (list) list.push(i.leadDays);
    else groups.set(key(i), [i.leadDays]);
  }
  return [...groups.entries()]
    .map(([name, days]) => ({ name, stats: stats(days)! }))
    .sort((a, b) => b.stats.count - a.stats.count || a.name.localeCompare(b.name));
}

/** Süre metni: bir günden kısaysa saat, değilse bir ondalıklı gün. */
export function formatDays(days: number | undefined, units: { day: string; hour: string }, locale: string): string {
  if (days === undefined || Number.isNaN(days)) return "—";
  if (days < 1) return `${Math.max(0, Math.round(days * 24))} ${units.hour}`;
  return `${days.toLocaleString(locale, { maximumFractionDigits: 1 })} ${units.day}`;
}

export function matches(query: string, ...texts: (string | number | undefined)[]): boolean {
  const q = lower(query.trim());
  return !q || texts.some((t) => t !== undefined && lower(t).includes(q));
}

type Cell = string | number | undefined;

/**
 * CSV metni. Excel'in Türkçe kurulumu ayırıcı olarak `;` ve ondalık için `,` beklediğinden ikisi de
 * dile göre seçilir. =, +, -, @ ile başlayan metinler Excel'de formül olarak çalışmasın diye ' ile başlatılır.
 */
export function toCsv(rows: Cell[][], separator: string, decimal: string): string {
  const cell = (v: Cell) => {
    if (v === undefined) return "";
    if (typeof v === "number") return String(v).replace(".", decimal);
    const text = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /["\r\n]/.test(text) || text.includes(separator) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((r) => r.map(cell).join(separator)).join("\r\n");
}

/** Yerel saatle YYYY-AA-GG SS:DD; Excel her dilde tarih olarak tanır. */
export function toDateTime(time: number | undefined): string | undefined {
  if (time === undefined) return undefined;
  const d = new Date(time);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${toDateInput(time)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const round2 = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 100) / 100);

/** Dışa aktarılan satırlar; başlık satırı çağıran tarafından eklenir. */
export function exportRows(items: ListItem[]): Cell[][] {
  return items.map((i) => [
    i.id,
    i.title,
    i.type,
    i.state,
    i.project,
    i.assignee,
    i.parentId ?? i.relatedTo,
    i.parentId !== undefined ? "Child" : i.via === "related" ? "Related" : i.via === "tested" ? "Tested By" : undefined,
    i.childCount,
    toDateTime(i.created),
    toDateTime(i.closed),
    round2(i.leadDays),
    round2(i.cycleDays),
  ]);
}

/**
 * Rapor için aday kayıtlar: açılışı ya da durum değişimi aralığa düşenler. Aralıkta açılanlar ilk koşulla,
 * aralıkta kapananlar ikinciyle gelir (kapalı kaydın son durum değişimi kapanışıdır). Sorgu iki uçtan
 * sınırlıdır; geçmişteki bir ay sorulduğunda o günden bugüne değişen her şey okunmaz.
 */
export function reportWiql(opts: LoadOptions, now: number, project?: string): string {
  const parts = dateClause("", opts, now, "either");
  if (project) parts.unshift(`[System.TeamProject] = ${quote(project)}`);
  return `SELECT [System.Id] FROM WorkItems WHERE ${parts.join(" AND ")} ORDER BY [System.Id]`;
}

/**
 * Kart tipine göre açılış/kapanış sayıları. Aralıkta açılan her kayıt ya "açılıp kapanan" ya da
 * "hâlâ açık" sütununa girer: aralık bittikten sonra kapanan kayıt, aralık sonunda açık sayılır.
 * `opts.types` doluysa yalnızca o tipler sayılır (büyük/küçük harf ayırmadan); toplam da onlara göredir.
 */
export function buildReport(
  raw: RawWorkItem[],
  states: ClosedStates,
  opts: LoadOptions,
  baseUrl = "",
  relatedTo?: Map<number, { to: number; via: Via }>,
): { rows: ReportRow[]; total: ReportRow; items: ListItem[] } {
  const from = dayStart(opts.from);
  const end = dayStart(opts.to) + DAY_MS;
  const inside = (t: number | undefined): t is number => t !== undefined && t >= from && t < end;
  const wanted = (opts.types ?? []).map((s) => lower(s.trim())).filter(Boolean);
  const items: ListItem[] = [];
  for (const r of raw) {
    const created = time(r.fields["System.CreatedDate"]);
    if (created === undefined) continue;
    if (wanted.length > 0 && !wanted.includes(lower(r.fields["System.WorkItemType"]))) continue;
    const closed = isClosedRaw(r, states)
      ? (time(r.fields["Microsoft.VSTS.Common.ClosedDate"]) ?? time(r.fields["Microsoft.VSTS.Common.StateChangeDate"]))
      : undefined;
    const flow: Flow | undefined = inside(created)
      ? inside(closed)
        ? "openedClosed"
        : "stillOpen"
      : inside(closed) && created < from
        ? "closedOlder"
        : undefined;
    if (!flow) continue;
    // Aralık bittikten sonra kapanan kayıt aralık sonunda açıktır: kapanışı gösterilmez.
    items.push({ ...describe(r, created, flow === "stillOpen" ? undefined : closed, baseUrl, relatedTo), flow });
  }
  countChildren(items);
  return { ...summarize(items), items };
}

/** Kayıtların kart tipine göre grup sayıları ve toplamı. */
export function summarize(items: ListItem[]): { rows: ReportRow[]; total: ReportRow } {
  const groups = new Map<string, { row: ReportRow; lead: number[] }>();
  const all = { row: { type: "", openedClosed: 0, stillOpen: 0, closedOlder: 0 } as ReportRow, lead: [] as number[] };
  for (const i of items) {
    if (!i.flow) continue;
    let group = groups.get(i.type);
    if (!group) groups.set(i.type, (group = { row: { type: i.type, openedClosed: 0, stillOpen: 0, closedOlder: 0 }, lead: [] }));
    for (const g of [group, all]) {
      g.row[i.flow]++;
      // Süre yalnızca aralıkta açılıp aralıkta kapananlardan hesaplanır.
      if (i.flow === "openedClosed" && i.leadDays !== undefined) g.lead.push(i.leadDays);
    }
  }
  const finish = (g: { row: ReportRow; lead: number[] }) => {
    const s = stats(g.lead);
    return { ...g.row, avg: s?.avg, median: s?.median };
  };
  const count = (r: ReportRow) => r.openedClosed + r.stillOpen + r.closedOlder;
  return {
    rows: [...groups.values()].map(finish).sort((a, b) => count(b) - count(a) || a.type.localeCompare(b.type)),
    total: finish(all),
  };
}
