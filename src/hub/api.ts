import {
  buildReport,
  CANCELLED_STATES,
  chunk,
  childCounts,
  childLinksWiql,
  ClosedStates,
  DataSource,
  DateMatch,
  DEFAULT_CLOSED_STATES,
  inRange,
  isClosedRaw,
  itemsWiql,
  LinkSource,
  linksWiql,
  LoadOptions,
  mapLimit,
  missingParentIds,
  PulseData,
  RawRelation,
  RawWorkItem,
  ReportData,
  reportWiql,
  splitParents,
  toItems,
  toLinks,
  toOpenParents,
  Via,
  withCancelled,
  withSlash,
} from "./logic";

// Server 2022 için 7.0.
const API = "api-version=7.0";
/** Tek yüklemede bu projeden okunan en fazla work item. */
const ITEM_LIMIT = 2000;
/** Tek yüklemede diğer projelerden okunan en fazla child. */
const CHILD_LIMIT = 5000;
/** Rapor widget'ında bu projeden ve alt kayıtlardan okunan en fazla work item (her biri için). */
const REPORT_LIMIT = 10000;
const LINK_LIMIT = 20000;
/** En fazla bu kadar seviye inilir (child, child'ın child'ı, ...). */
const MAX_DEPTH = 5;
const BATCH = 200; // workitemsbatch tek istekte en fazla 200 id kabul eder
const PARALLEL = 4;

const FIELDS = [
  "System.Id",
  "System.Title",
  "System.WorkItemType",
  "System.State",
  "System.TeamProject",
  "System.AssignedTo",
  "System.CreatedDate",
  "System.Parent",
  "Microsoft.VSTS.Common.ClosedDate",
  "Microsoft.VSTS.Common.StateChangeDate",
  "Microsoft.VSTS.Common.ActivatedDate",
];

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
type Links = { workItemRelations?: RawRelation[] };
type Below = { ids: number[]; relatedTo: Map<number, { to: number; via: Via }>; truncated: boolean };
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * @param baseUrl Collection adresi, örn. https://sunucu/tfs/DefaultCollection/
 * @param getToken Extension'ın erişim token'ını döndürür.
 * @param project Hub'ın açıldığı proje; yoksa tüm collection sorgulanır.
 */
export function createRestSource(
  baseUrl: string,
  getToken: () => Promise<string>,
  project?: string,
  // credentials: "omit": sunucu 401 dönerse tarayıcı kendi kullanıcı adı/parola penceresini açmaz.
  fetchFn: Fetch = (u, i) => fetch(u, { ...i, credentials: "omit" }),
): DataSource {
  const base = withSlash(baseUrl);
  /** Proje adı → "Completed" kategorisindeki durum adları; okunamayan proje için undefined. Sayfa açıkken değişmez. */
  const statesCache = new Map<string, Promise<string[] | undefined>>();

  async function call<T>(token: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchFn(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res
        .json()
        .then((b) => (typeof b?.message === "string" ? `: ${b.message.slice(0, 300)}` : ""))
        .catch(() => "");
      throw new Error(`HTTP ${res.status}${detail}`);
    }
    return (await res.json()) as T;
  }

  const wiql = <T>(token: string, query: string, top: number) =>
    call<T>(token, `_apis/wit/wiql?$top=${top}&${API}`, { query });

  const read = async (token: string, list: number[]) =>
    (
      await mapLimit(chunk(list, BATCH), PARALLEL, (part) =>
        call<{ value: (RawWorkItem | null)[] }>(token, `_apis/wit/workitemsbatch?${API}`, {
          ids: part,
          fields: FIELDS,
          errorPolicy: "Omit",
        }),
      )
    ).flatMap((b) => b.value ?? []);

  /** Projedeki türlerin "Completed" kategorisindeki durum adları (örn. Closed, Done, Tamamlandı) ve iptal. */
  function projectStates(token: string, name: string): Promise<string[] | undefined> {
    let cached = statesCache.get(name);
    if (!cached) {
      cached = call<{ value?: { states?: { name?: string; category?: string }[] }[] }>(
        token,
        `${encodeURIComponent(name)}/_apis/wit/workitemtypes?${API}`,
      ).then(
        (data) => {
          const names = new Set<string>();
          for (const t of data.value ?? [])
            for (const s of t.states ?? []) if (s.name && s.category === "Completed") names.add(s.name);
          return names.size > 0 ? withCancelled([...names]) : undefined;
        },
        () => {
          statesCache.delete(name);
          return undefined;
        },
      );
      statesCache.set(name, cached);
    }
    return cached;
  }

  /** Kayıtların ait olduğu projelerin kapalı durumları; okunamayan projeler `fallback` ile değerlendirilir. */
  async function closedStatesFor(token: string, raw: (RawWorkItem | null)[], fallback: string[]): Promise<ClosedStates> {
    const names = [...new Set(raw.map((r) => String(r?.fields["System.TeamProject"] ?? "")).filter(Boolean))];
    const byProject = new Map<string, string[]>();
    await mapLimit(names, PARALLEL, async (name) => {
      const states = await projectStates(token, name);
      if (states) byProject.set(name, states);
    });
    return { byProject, fallback };
  }

  /**
   * Kaynağa bağlı kayıtları seviye seviye bulur: önce doğrudan bağlı olanlar, sonra onlara bağlı olanlar.
   * Kayıt hangi projede olursa olsun gelir. Aralık verildiyse yalnızca aralıkta durumu değişen kayıtlar
   * bulunur ve bir alt seviyeye yalnızca onlar üzerinden inilir.
   * @param seen Zaten bilinen id'ler; bulunanlar buna eklenir.
   */
  async function descend(
    token: string,
    first: LinkSource,
    opts: LoadOptions,
    seen: Set<number>,
    match: DateMatch = "state",
    limit = CHILD_LIMIT,
  ): Promise<Below> {
    const query = (source: LinkSource, m: DateMatch) =>
      wiql<Links>(token, childLinksWiql(opts, Date.now(), source, opts.related, m), LINK_LIMIT);
    // "either" koşulunu sunucu kabul etmezse iki ayrı sorgu çalıştırılıp sonuçlar birleştirilir.
    const run = (source: LinkSource): Promise<Links[]> =>
      match !== "either"
        ? query(source, match).then((r) => [r])
        : query(source, "either").then(
            (r) => [r],
            () => Promise.all([query(source, "created"), query(source, "state")]),
          );
    const ids: number[] = [];
    const relatedTo = new Map<number, { to: number; via: Via }>();
    let truncated = false;
    let frontier: number[] = [];
    for (let depth = 0; depth < MAX_DEPTH && ids.length <= limit; depth++) {
      if (depth > 0 && frontier.length === 0) break;
      const sources: LinkSource[] = depth === 0 ? [first] : chunk(frontier, BATCH).map((part) => ({ ids: part }));
      const found = (await mapLimit(sources, PARALLEL, run)).flat();
      frontier = [];
      for (const result of found) {
        const relations = result.workItemRelations ?? [];
        if (relations.length >= LINK_LIMIT) truncated = true;
        for (const link of toLinks(relations, opts.related)) {
          if (seen.has(link.target)) continue;
          seen.add(link.target);
          frontier.push(link.target);
          if (link.kind !== "child") relatedTo.set(link.target, { to: link.source, via: link.kind });
        }
      }
      ids.push(...frontier);
    }
    return { ids, relatedTo, truncated: truncated || ids.length > limit };
  }

  return {
    async load(opts: LoadOptions): Promise<PulseData> {
      const token = await getToken();
      const now = Date.now();
      const warnings: string[] = [];
      const soft = <T>(name: string, fallback: T) => (e: unknown) => {
        warnings.push(`${name}: ${message(e)}`);
        return fallback;
      };

      const states = (project && (await projectStates(token, project))) || withCancelled(DEFAULT_CLOSED_STATES);
      const fallback = [...new Set([...states, ...DEFAULT_CLOSED_STATES])];

      const [found, links] = await Promise.all([
        // Bu projede aralıkta kapananlar.
        wiql<{ workItems?: { id: number }[] }>(token, itemsWiql(states, opts, now, project), ITEM_LIMIT),
        // Onların child sayıları.
        wiql<Links>(token, linksWiql(states, opts, now, project), LINK_LIMIT).catch(soft("links", undefined)),
      ]);

      const ids = (found.workItems ?? []).map((w) => w.id);
      const raw = await read(token, ids);
      const relations = links?.workItemRelations;
      const counts = relations ? childCounts(relations) : undefined;

      // Bu projenin kayıtlarının altındaki, aralıkta durumu değişen kayıtlar (diğer projeler dahil).
      const none: Below = { ids: [], relatedTo: new Map(), truncated: false };
      const below = project ? await descend(token, { project }, opts, new Set(ids)).catch(soft("children", none)) : none;

      // Diğer projelerdeki child'lar kendi projelerinin kapalı durumlarına göre ayıklanır.
      const rawChildren = await read(token, below.ids.slice(0, CHILD_LIMIT)).catch(soft("children", []));
      const childStates = await closedStatesFor(token, rawChildren, fallback);
      const closedChildren = rawChildren.filter((r): r is RawWorkItem => !!r && isClosedRaw(r, childStates));
      const all = [...raw, ...closedChildren];
      const own = inRange(toItems(all, base, counts, below.relatedTo), opts);

      // Kapanan child'ların listede olmayan parent'ları: hâlâ açık, aralık dışında kapanmış ya da
      // (hub bir child projesinden açıldıysa) başka projede olabilirler.
      const rawParents = await read(token, missingParentIds(own)).catch(soft("parents", []));
      const parents = splitParents(rawParents, await closedStatesFor(token, rawParents, fallback));
      const items = inRange(toItems([...all, ...parents.closed], base, counts, below.relatedTo), opts);

      return {
        items,
        openParents: toOpenParents(parents.open, base, items, now),
        parentsOutOfRange: Math.max(0, parents.closed.length - (items.length - own.length)),
        project,
        // Gösterimde iptal bir kez yer alır.
        closedStates: states.filter((s) => !CANCELLED_STATES.slice(1).includes(s)),
        truncated: ids.length >= ITEM_LIMIT || (relations?.length ?? 0) >= LINK_LIMIT || below.truncated,
        warnings,
      };
    },

    async loadReport(opts: LoadOptions): Promise<ReportData> {
      const token = await getToken();
      const now = Date.now();
      const warnings: string[] = [];
      const soft = <T>(name: string, fallback: T) => (e: unknown) => {
        warnings.push(`${name}: ${message(e)}`);
        return fallback;
      };
      const states = (project && (await projectStates(token, project))) || withCancelled(DEFAULT_CLOSED_STATES);
      const fallback = [...new Set([...states, ...DEFAULT_CLOSED_STATES])];
      const found = await wiql<{ workItems?: { id: number }[] }>(token, reportWiql(opts, now, project), REPORT_LIMIT);
      const ids = (found.workItems ?? []).map((w) => w.id);
      const none: Below = { ids: [], relatedTo: new Map(), truncated: false };
      const [raw, below] = await Promise.all([
        read(token, ids),
        // Bu projenin kayıtlarının altındaki kayıtlar (diğer projeler dahil).
        project ? descend(token, { project }, opts, new Set(ids), "either", REPORT_LIMIT).catch(soft("children", none)) : none,
      ]);
      const rawChildren = await read(token, below.ids.slice(0, REPORT_LIMIT)).catch(soft("children", []));
      const all = [...raw, ...rawChildren].filter((r): r is RawWorkItem => !!r);
      return {
        ...buildReport(all, await closedStatesFor(token, all, fallback), opts),
        truncated: ids.length >= REPORT_LIMIT || below.truncated,
        warnings,
      };
    },
  };
}
