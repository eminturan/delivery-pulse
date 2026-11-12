import "azure-devops-ui/Core/override.css";
import "./hub.css";

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import {
  CommonServiceIds,
  ILocationService,
  IProjectPageService,
} from "azure-devops-extension-api/Common/CommonServices";
import { Header, TitleSize } from "azure-devops-ui/Header";
import { MessageCard, MessageCardSeverity } from "azure-devops-ui/MessageCard";
import { Page } from "azure-devops-ui/Page";

import { createRestSource } from "./api";
import { firstOf, pickLang, Strings, STRINGS } from "./i18n";
import {
  cycleStats,
  DataSource,
  DAY_MS,
  exportRows,
  Flow,
  FLOWS,
  isCancelled,
  formatDays,
  groupStats,
  Item,
  leadStats,
  ListItem,
  matches,
  OpenParent,
  PulseData,
  ReportData,
  toCsv,
  toDateInput,
  weekly,
} from "./logic";
import { mockSource } from "./mock";

/** Sayfa açılışında tarih aralığı: son bu kadar gün. */
const DEFAULT_DAYS = 90;
/** Tarih değiştikten sonra yüklemeden önce beklenen süre. */
const OPTION_DELAY_MS = 500;
const PAGE_SIZE = 100;

type SortKey =
  | "id"
  | "title"
  | "type"
  | "project"
  | "assignee"
  | "created"
  | "closed"
  | "lead"
  | "cycle"
  | "children";

const SORTERS: Record<SortKey, (i: ListItem) => string | number> = {
  id: (i) => i.id,
  title: (i) => i.title.toLocaleLowerCase("tr"),
  type: (i) => i.type,
  project: (i) => i.project,
  assignee: (i) => (i.assignee ?? "").toLocaleLowerCase("tr"),
  created: (i) => i.created,
  closed: (i) => i.closed ?? Infinity,
  lead: (i) => i.leadDays ?? -1,
  cycle: (i) => i.cycleDays ?? -1,
  children: (i) => i.childCount,
};

/** `onClick` verilirse kart bir düğmedir; `active` seçili olduğunu gösterir. */
function Card(props: {
  label: string;
  value: string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="dp-card-value">{props.value}</div>
      <div className="dp-card-label">{props.label}</div>
      {props.hint && <div className="dp-muted">{props.hint}</div>}
    </>
  );
  return props.onClick ? (
    <button
      className={`dp-card dp-card-button${props.active ? " dp-card-active" : ""}`}
      title={props.hint}
      aria-pressed={!!props.active}
      onClick={props.onClick}
    >
      {body}
    </button>
  ) : (
    <div className="dp-card" title={props.hint}>
      {body}
    </div>
  );
}

function WeeklyChart({ items, t }: { items: Item[]; t: Strings }) {
  const weeks = weekly(items);
  if (weeks.length === 0) return null;
  const max = Math.max(...weeks.map((w) => w.median), 0.01);
  const date = (ms: number) =>
    new Date(ms).toLocaleDateString(t.locale, {
      day: "numeric",
      month: "short",
    });
  return (
    <section>
      <h3 className="dp-h">{t.weeklyTitle}</h3>
      <div className="dp-muted">{t.weeklyHint}</div>
      <div className="dp-chart" role="img" aria-label={t.weeklyTitle}>
        {weeks.map((w) => (
          <div
            className="dp-week"
            key={w.start}
            title={`${date(w.start)} – ${date(w.start + 6 * DAY_MS)}: ${formatDays(w.median, t.units, t.locale)}, ${w.count}`}
          >
            <div className="dp-week-value">
              {formatDays(w.median, t.units, t.locale)}
            </div>
            <div
              className="dp-bar"
              style={{ height: `${Math.max(2, (w.median / max) * 120)}px` }}
            />
            <div className="dp-week-label">{date(w.start)}</div>
            <div className="dp-muted">{w.count}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GroupTable(props: {
  items: Item[];
  t: Strings;
  title: string;
  label: string;
  group: (i: Item) => string;
}) {
  const { items, t } = props;
  const fmt = (d: number) => formatDays(d, t.units, t.locale);
  return (
    <section>
      <h3 className="dp-h">{props.title}</h3>
      <table className="dp-table dp-table-narrow">
        <thead>
          <tr>
            <th>{props.label}</th>
            <th className="dp-num">{t.count}</th>
            <th className="dp-num">{t.avg}</th>
            <th className="dp-num">{t.median}</th>
            <th className="dp-num">{t.p85}</th>
          </tr>
        </thead>
        <tbody>
          {groupStats(items, props.group).map((r) => (
            <tr key={r.name}>
              <td>{r.name || "—"}</td>
              <td className="dp-num">{r.stats.count}</td>
              <td className="dp-num">{fmt(r.stats.avg)}</td>
              <td className="dp-num">{fmt(r.stats.median)}</td>
              <td className="dp-num">{fmt(r.stats.p85)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Metni dosya olarak indirir. Baştaki BOM, Excel'in Türkçe karakterleri doğru okuması içindir. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob(["\ufeff", text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ItemTable({
  items,
  name,
  t,
}: {
  items: ListItem[];
  name: string;
  t: Strings;
}) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({
    key: "lead",
    desc: true,
  });
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const rows = React.useMemo(() => {
    const get = SORTERS[sort.key];
    return items
      .filter((i) => matches(query, i.id, i.title, i.assignee, i.project))
      .sort((a, b) => {
        const x = get(a);
        const y = get(b);
        return (x < y ? -1 : x > y ? 1 : 0) * (sort.desc ? -1 : 1);
      });
  }, [items, query, sort]);
  const date = (ms?: number) =>
    ms === undefined ? "—" : new Date(ms).toLocaleDateString(t.locale);
  const fmt = (d?: number) => formatDays(d, t.units, t.locale);
  const head = (key: SortKey, label: string, num = false) => (
    <th
      className={num ? "dp-num" : undefined}
      aria-sort={
        sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined
      }
    >
      <button
        className="dp-sort"
        onClick={() =>
          setSort((s) => ({ key, desc: s.key === key ? !s.desc : num }))
        }
      >
        {label}
        {sort.key === key ? (sort.desc ? " ▼" : " ▲") : ""}
      </button>
    </th>
  );
  return (
    <section>
      <div className="dp-toolbar">
        <h3 className="dp-h">{t.itemsTitle}</h3>
        <input
          className="dp-input dp-search"
          type="search"
          placeholder={t.search}
          aria-label={t.search}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE_SIZE);
          }}
        />
        <span className="dp-muted">
          {t.shown(Math.min(limit, rows.length), rows.length)}
        </span>
        <button
          className="dp-button"
          disabled={rows.length === 0}
          onClick={() => {
            // Yalnızca ekranda görünen ilk sayfa değil, arama ve sıralamadan geçen tüm satırlar aktarılır.
            const header = [
              t.col.id,
              t.col.title,
              t.col.type,
              t.state,
              t.col.project,
              t.col.assignee,
              t.col.parent,
              t.csv.link,
              t.col.children,
              t.col.created,
              t.col.closed,
              t.csv.leadDays,
              t.csv.cycleDays,
            ];
            download(
              `delivery-pulse-${name}-${toDateInput(Date.now())}.csv`,
              toCsv(
                [header, ...exportRows(rows)],
                t.csv.separator,
                t.csv.decimal,
              ),
            );
          }}
        >
          {t.exportCsv}
        </button>
      </div>
      <div className="dp-scroll">
        <table className="dp-table">
          <thead>
            <tr>
              {head("id", t.col.id, true)}
              {head("title", t.col.title)}
              {head("type", t.col.type)}
              {head("project", t.col.project)}
              {head("assignee", t.col.assignee)}
              {head("children", t.col.children, true)}
              <th className="dp-num">{t.col.parent}</th>
              {head("created", t.col.created, true)}
              {head("closed", t.col.closed, true)}
              {head("lead", t.col.lead, true)}
              {head("cycle", t.col.cycle, true)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((i) => (
              <tr key={i.id}>
                <td className="dp-num">{i.id}</td>
                <td className="dp-title">
                  <a
                    className="dp-link"
                    href={i.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {i.title}
                  </a>
                </td>
                <td>{i.type}</td>
                <td>{i.project || "—"}</td>
                <td>{i.assignee ?? "—"}</td>
                <td className="dp-num">{i.childCount || "—"}</td>
                <td className="dp-num">
                  {(i.parentId ?? i.relatedTo) === undefined ? (
                    "—"
                  ) : (
                    <>
                      {i.via && (
                        <span className="dp-muted">{t.via[i.via]} </span>
                      )}
                      <a
                        className="dp-link"
                        href={i.url.replace(
                          /\d+$/,
                          String(i.parentId ?? i.relatedTo),
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {i.parentId ?? i.relatedTo}
                      </a>
                    </>
                  )}
                </td>
                <td className="dp-num">{date(i.created)}</td>
                <td className="dp-num">{date(i.closed)}</td>
                <td className="dp-num dp-strong">{fmt(i.leadDays)}</td>
                <td className="dp-num">{fmt(i.cycleDays)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button
          className="dp-button"
          onClick={() => setLimit((l) => l + PAGE_SIZE)}
        >
          {t.showMore}
        </button>
      )}
    </section>
  );
}

function OpenParentTable({
  parents,
  t,
}: {
  parents: OpenParent[];
  t: Strings;
}) {
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  if (parents.length === 0) return null;
  const date = (ms: number) => new Date(ms).toLocaleDateString(t.locale);
  return (
    <section>
      <h3 className="dp-h">{t.openParentsTitle(parents.length)}</h3>
      <div className="dp-muted">{t.openParentsHint}</div>
      <div className="dp-scroll">
        <table className="dp-table">
          <thead>
            <tr>
              <th className="dp-num">{t.col.id}</th>
              <th>{t.col.title}</th>
              <th>{t.col.type}</th>
              <th>{t.state}</th>
              <th>{t.col.assignee}</th>
              <th className="dp-num">{t.closedChildren}</th>
              <th className="dp-num">{t.col.created}</th>
              <th className="dp-num">{t.age}</th>
            </tr>
          </thead>
          <tbody>
            {parents.slice(0, limit).map((p) => (
              <tr key={p.id}>
                <td className="dp-num">{p.id}</td>
                <td className="dp-title">
                  <a
                    className="dp-link"
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {p.title}
                  </a>
                </td>
                <td>{p.type}</td>
                <td>{p.state}</td>
                <td>{p.assignee ?? "—"}</td>
                <td className="dp-num">{p.closedChildren}</td>
                <td className="dp-num">{date(p.created)}</td>
                <td className="dp-num dp-strong">
                  {formatDays(p.ageDays, t.units, t.locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {parents.length > limit && (
        <button
          className="dp-button"
          onClick={() => setLimit((l) => l + PAGE_SIZE)}
        >
          {t.showMore}
        </button>
      )}
    </section>
  );
}

function App({
  source,
  mock,
  t,
}: {
  source: DataSource;
  mock: boolean;
  t: Strings;
}) {
  const [from, setFrom] = React.useState(() =>
    toDateInput(Date.now() - DEFAULT_DAYS * DAY_MS),
  );
  const [to, setTo] = React.useState(() => toDateInput(Date.now()));
  const [data, setData] = React.useState<PulseData>();
  const [report, setReport] = React.useState<ReportData>();
  const [reportError, setReportError] = React.useState<string>();
  const [error, setError] = React.useState<string>();
  const [loading, setLoading] = React.useState(true);
  const [type, setType] = React.useState("");
  /** İptal durumundaki kayıtlar sayılara, sürelere ve listeye girmesin. */
  const [noCancelled, setNoCancelled] = React.useState(false);
  /** Listede gösterilen grup; boşsa aralıkta kapanan tüm kayıtlar. */
  const [flow, setFlow] = React.useState<Flow | "">("");
  const [reload, setReload] = React.useState(0);
  const first = React.useRef(true);

  React.useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        // Aralıkta açılan / kapanan sayıları ayrı okunur; okunamazsa sayfanın geri kalanı yine gösterilir.
        source.loadReport({ from, to, related: true }).then(
          (r) => {
            if (cancelled) return;
            setReport(r);
            setReportError(undefined);
          },
          (e) => {
            if (cancelled) return;
            setReport(undefined);
            setReportError(e instanceof Error ? e.message : String(e));
          },
        );
        source
          // Related ve Tested By bağlantıları her zaman izlenir.
          .load({ from, to, related: true })
          .then(
            (d) => {
              if (cancelled) return;
              setData(d);
              setError(undefined);
            },
            (e) =>
              !cancelled &&
              setError(e instanceof Error ? e.message : String(e)),
          )
          .then(() => !cancelled && setLoading(false));
      },
      first.current ? 0 : OPTION_DELAY_MS,
    );
    first.current = false;
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, from, to, reload]);

  const keep = (i: ListItem) => !noCancelled || !isCancelled(i);
  const all = React.useMemo(() => (data?.items ?? []).filter(keep), [data, noCancelled]);
  // Yalnızca açık kaydı olan tipler de süzgeçte yer alır.
  const types = React.useMemo(
    () =>
      [
        ...new Set([
          ...all.map((i) => i.type),
          ...(report?.rows ?? []).map((r) => r.type),
        ]),
      ]
        .filter(Boolean)
        .sort(),
    [all, report],
  );
  const typed = <T extends ListItem>(list: T[]) =>
    type && types.includes(type) ? list.filter((i) => i.type === type) : list;
  const closedAll = React.useMemo(() => typed(all), [all, type, types]);
  const flowItems = React.useMemo(
    () => typed((report?.items ?? []).filter(keep)),
    [report, type, types, noCancelled],
  );
  const shown = flow && report ? flow : "";
  const items: ListItem[] = React.useMemo(
    () => (shown ? flowItems.filter((i) => i.flow === shown) : closedAll),
    [shown, flowItems, closedAll],
  );
  // Süre istatistikleri yalnızca kapanmış kayıtlardan hesaplanır.
  const closed = React.useMemo(
    () =>
      items.filter(
        (i): i is Item => i.closed !== undefined && i.leadDays !== undefined,
      ),
    [items],
  );
  // Açık parent'ların child'ları tür süzgecinden geçmiş listeden sayılır; child'ı kalmayan gösterilmez.
  const openParents = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const i of closedAll)
      if (i.parentId) counts.set(i.parentId, (counts.get(i.parentId) ?? 0) + 1);
    return (data?.openParents ?? [])
      .map((p) => ({ ...p, closedChildren: counts.get(p.id) ?? 0 }))
      .filter((p) => p.closedChildren > 0);
  }, [data, closedAll]);
  const showOpen = !shown && openParents.length > 0;
  const flowCount = (f: Flow) => flowItems.filter((i) => i.flow === f).length;
  const lead = leadStats(closed);
  const cycle = cycleStats(closed);
  const fmt = (d?: number) => formatDays(d, t.units, t.locale);

  return (
    <Page className="dp-page">
      <Header
        title={t.title}
        titleSize={TitleSize.Large}
        description={t.subtitle(data?.project)}
      />
      <div className="dp-content">
        {mock && (
          <MessageCard severity={MessageCardSeverity.Info}>
            {t.mock}
          </MessageCard>
        )}
        <div className="dp-toolbar">
          <label className="dp-field">
            <span className="dp-muted">{t.from}</span>
            <input
              className="dp-input"
              type="date"
              value={from}
              max={to}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
          </label>
          <label className="dp-field">
            <span className="dp-muted">{t.to}</span>
            <input
              className="dp-input"
              type="date"
              value={to}
              min={from}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </label>
          <label className="dp-field">
            <span className="dp-muted">{t.col.type}</span>
            <select
              className="dp-input"
              value={types.includes(type) ? type : ""}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">{t.allTypes}</option>
              {types.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="dp-field">
            <span className="dp-muted">{t.show}</span>
            <select
              className="dp-input"
              value={shown}
              disabled={!report}
              onChange={(e) => setFlow(e.target.value as Flow | "")}
            >
              <option value="">{t.closedAll}</option>
              {FLOWS.map((f) => (
                <option key={f} value={f}>
                  {t.w[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="dp-check" title={t.noCancelledHint}>
            <input type="checkbox" checked={noCancelled} onChange={(e) => setNoCancelled(e.target.checked)} />
            {t.noCancelled}
          </label>
          <button
            className="dp-button"
            disabled={loading}
            onClick={() => setReload((n) => n + 1)}
          >
            {loading ? t.loading : t.refresh}
          </button>
        </div>

        {error && (
          <MessageCard severity={MessageCardSeverity.Error}>
            {t.loadError(error)}
          </MessageCard>
        )}
        {(data?.truncated || report?.truncated) && (
          <MessageCard severity={MessageCardSeverity.Warning}>
            {t.truncated}
          </MessageCard>
        )}
        {[
          ...(data?.warnings ?? []),
          ...(report?.warnings ?? []),
          ...(reportError ? [`report: ${reportError}`] : []),
        ].map((w) => (
          <MessageCard key={w} severity={MessageCardSeverity.Warning}>
            {t.warning(w)}
          </MessageCard>
        ))}

        {data && (
          <>
            {report && (
              <section>
                <h3 className="dp-h">{t.flowTitle}</h3>
                <div className="dp-muted">{t.flowHint}</div>
                <div className="dp-cards">
                  {FLOWS.map((f) => (
                    <Card
                      key={f}
                      label={t.w[f]}
                      value={String(flowCount(f))}
                      hint={t.w[`${f}Hint` as const]}
                      active={shown === f}
                      onClick={() => setFlow(shown === f ? "" : f)}
                    />
                  ))}
                </div>
              </section>
            )}
            {!shown && data.parentsOutOfRange > 0 && (
              <div className="dp-muted">
                {t.parentsOutOfRange(data.parentsOutOfRange)}
              </div>
            )}
            {items.length === 0 ? (
              !showOpen && (
                <div className="dp-empty">{shown ? t.emptyList : t.empty}</div>
              )
            ) : (
              <>
                <h3 className="dp-h">
                  {shown ? `${t.w[shown]} (${items.length})` : t.closedTitle}
                </h3>
                {closed.length > 0 && (
                  <>
                    <div className="dp-cards">
                      <Card label={t.count} value={String(closed.length)} />
                      <Card
                        label={t.median}
                        value={fmt(lead?.median)}
                        hint={t.leadHint}
                      />
                      <Card
                        label={t.avg}
                        value={fmt(lead?.avg)}
                        hint={t.leadHint}
                      />
                      <Card
                        label={t.p85}
                        value={fmt(lead?.p85)}
                        hint={t.p85Hint}
                      />
                      <Card
                        label={t.cycle}
                        value={fmt(cycle?.median)}
                        hint={t.cycleHint}
                      />
                    </div>
                    <WeeklyChart items={closed} t={t} />
                    <GroupTable
                      items={closed}
                      t={t}
                      title={t.byTypeTitle}
                      label={t.col.type}
                      group={(i) => i.type}
                    />
                    {new Set(closed.map((i) => i.project)).size > 1 && (
                      <GroupTable
                        items={closed}
                        t={t}
                        title={t.byProjectTitle}
                        label={t.col.project}
                        group={(i) => i.project}
                      />
                    )}
                  </>
                )}
                {/* key: grup değişince arama, sıralama ve sayfa sıfırlanır. */}
                <ItemTable
                  key={shown}
                  items={items}
                  name={shown || "closed"}
                  t={t}
                />
              </>
            )}
            {showOpen && <OpenParentTable parents={openParents} t={t} />}
            <div className="dp-muted">
              {t.closedStates(data.closedStates.join(", "))}
            </div>
          </>
        )}
        {!data && loading && <div className="dp-empty">{t.loading}</div>}
      </div>
    </Page>
  );
}

function render(
  source: DataSource,
  mock: boolean,
  culture: string | undefined,
) {
  const lang = pickLang(culture);
  document.documentElement.lang = lang;
  ReactDOM.render(
    <App source={source} mock={mock} t={STRINGS[lang]} />,
    document.getElementById("root"),
  );
}

async function start() {
  // Azure DevOps dışında (npm run dev) açıldıysa örnek veriyle çalış; dil ?lang=tr|en ile seçilebilir.
  if (window.self === window.top) {
    render(
      mockSource,
      true,
      new URLSearchParams(window.location.search).get("lang") ??
        navigator.language,
    );
    return;
  }
  await SDK.init({ loaded: false, applyTheme: true });
  await SDK.ready();
  try {
    const location = await SDK.getService<ILocationService>(
      CommonServiceIds.LocationService,
    );
    const baseUrl = await location.getServiceLocation();
    // Azure DevOps Server 2022'de getPageContext() hata fırlatır; sırayla sayfa diline ve tarayıcı diline düşülür.
    const culture = firstOf([
      () => SDK.getPageContext().globalization.culture,
      () => window.parent.document.documentElement.lang,
      () => navigator.language,
    ]);
    // Proje okunamazsa tüm collection sorgulanır.
    const project = await SDK.getService<IProjectPageService>(
      CommonServiceIds.ProjectPageService,
    )
      .then((s) => s.getProject())
      .then((p) => p?.name)
      .catch(() => undefined);
    render(
      createRestSource(baseUrl, () => SDK.getAccessToken(), project),
      false,
      culture,
    );
    await SDK.notifyLoadSucceeded();
  } catch (e) {
    await SDK.notifyLoadFailed(e instanceof Error ? e : String(e));
  }
}

start();
