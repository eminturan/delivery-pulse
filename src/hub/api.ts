import {
  chunk,
  childCounts,
  DataSource,
  DEFAULT_CLOSED_STATES,
  inRange,
  itemsWiql,
  linksWiql,
  LoadOptions,
  mapLimit,
  PulseData,
  RawRelation,
  RawWorkItem,
  toItems,
  withSlash,
} from "./logic";

// Server 2022 için 7.0.
const API = "api-version=7.0";
/** Tek yüklemede okunan en fazla work item. */
const ITEM_LIMIT = 2000;
const LINK_LIMIT = 10000;
const BATCH = 200; // workitemsbatch tek istekte en fazla 200 id kabul eder
const PARALLEL = 4;

const FIELDS = [
  "System.Id",
  "System.Title",
  "System.WorkItemType",
  "System.State",
  "System.AssignedTo",
  "System.CreatedDate",
  "System.Parent",
  "Microsoft.VSTS.Common.ClosedDate",
  "Microsoft.VSTS.Common.StateChangeDate",
  "Microsoft.VSTS.Common.ActivatedDate",
];

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
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
  const scope = project ? `${encodeURIComponent(project)}/` : "";
  let statesCache: Promise<string[]> | undefined;

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

  /** Projedeki türlerin "Completed" kategorisindeki durum adları (örn. Closed, Done, Tamamlandı). */
  async function closedStates(token: string): Promise<string[]> {
    if (!project) return DEFAULT_CLOSED_STATES;
    const data = await call<{ value?: { states?: { name?: string; category?: string }[] }[] }>(
      token,
      `${scope}_apis/wit/workitemtypes?${API}`,
    );
    const names = new Set<string>();
    for (const t of data.value ?? [])
      for (const s of t.states ?? []) if (s.name && s.category === "Completed") names.add(s.name);
    return names.size > 0 ? [...names] : DEFAULT_CLOSED_STATES;
  }

  return {
    async load(opts: LoadOptions): Promise<PulseData> {
      const token = await getToken();
      const now = Date.now();
      const warnings: string[] = [];

      const states = await (statesCache ??= closedStates(token)).catch((e) => {
        statesCache = undefined;
        warnings.push(`states: ${message(e)}`);
        return DEFAULT_CLOSED_STATES;
      });

      const [found, links] = await Promise.all([
        call<{ workItems?: { id: number }[] }>(token, `_apis/wit/wiql?$top=${ITEM_LIMIT}&${API}`, {
          query: itemsWiql(states, opts, now, project),
        }),
        call<{ workItemRelations?: RawRelation[] }>(token, `_apis/wit/wiql?$top=${LINK_LIMIT}&${API}`, {
          query: linksWiql(states, opts, now, project),
        }).catch((e) => {
          warnings.push(`links: ${message(e)}`);
          return undefined;
        }),
      ]);

      const ids = (found.workItems ?? []).map((w) => w.id);
      const batches = await mapLimit(chunk(ids, BATCH), PARALLEL, (part) =>
        call<{ value: (RawWorkItem | null)[] }>(token, `_apis/wit/workitemsbatch?${API}`, {
          ids: part,
          fields: FIELDS,
          errorPolicy: "Omit",
        }),
      );
      const relations = links?.workItemRelations;
      const items = toItems(
        batches.flatMap((b) => b.value ?? []),
        base + scope,
        relations ? childCounts(relations) : undefined,
      );
      return {
        items: inRange(items, opts),
        project,
        closedStates: states,
        truncated: ids.length >= ITEM_LIMIT || (relations?.length ?? 0) >= LINK_LIMIT,
        warnings,
      };
    },
  };
}
