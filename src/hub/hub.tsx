import "azure-devops-ui/Core/override.css";
import "./hub.css";

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, ILocationService, IProjectPageService } from "azure-devops-extension-api/Common/CommonServices";
import { Header, TitleSize } from "azure-devops-ui/Header";
import { MessageCard, MessageCardSeverity } from "azure-devops-ui/MessageCard";
import { Page } from "azure-devops-ui/Page";

import { createRestSource } from "./api";
import { firstOf, pickLang, Strings, STRINGS } from "./i18n";
import {
  byType,
  cycleStats,
  DataSource,
  DAY_MS,
  formatDays,
  hasRole,
  Item,
  leadStats,
  matches,
  PulseData,
  Role,
  ROLES,
  toDateInput,
  weekly,
} from "./logic";
import { mockSource } from "./mock";

/** Sayfa açılışında tarih aralığı: son bu kadar gün. */
const DEFAULT_DAYS = 90;
/** Tarih değiştikten sonra yüklemeden önce beklenen süre. */
const OPTION_DELAY_MS = 500;
const PAGE_SIZE = 100;

type SortKey = "id" | "title" | "type" | "assignee" | "created" | "closed" | "lead" | "cycle" | "children";

const SORTERS: Record<SortKey, (i: Item) => string | number> = {
  id: (i) => i.id,
  title: (i) => i.title.toLocaleLowerCase("tr"),
  type: (i) => i.type,
  assignee: (i) => (i.assignee ?? "").toLocaleLowerCase("tr"),
  created: (i) => i.created,
  closed: (i) => i.closed,
  lead: (i) => i.leadDays,
  cycle: (i) => i.cycleDays ?? -1,
  children: (i) => i.childCount,
};

function Card(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="dp-card" title={props.hint}>
      <div className="dp-card-value">{props.value}</div>
      <div className="dp-card-label">{props.label}</div>
      {props.hint && <div className="dp-muted">{props.hint}</div>}
    </div>
  );
}

function WeeklyChart({ items, t }: { items: Item[]; t: Strings }) {
  const weeks = weekly(items);
  if (weeks.length === 0) return null;
  const max = Math.max(...weeks.map((w) => w.median), 0.01);
  const date = (ms: number) => new Date(ms).toLocaleDateString(t.locale, { day: "numeric", month: "short" });
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
            <div className="dp-week-value">{formatDays(w.median, t.units, t.locale)}</div>
            <div className="dp-bar" style={{ height: `${Math.max(2, (w.median / max) * 120)}px` }} />
            <div className="dp-week-label">{date(w.start)}</div>
            <div className="dp-muted">{w.count}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TypeTable({ items, t }: { items: Item[]; t: Strings }) {
  const fmt = (d: number) => formatDays(d, t.units, t.locale);
  return (
    <section>
      <h3 className="dp-h">{t.byTypeTitle}</h3>
      <table className="dp-table dp-table-narrow">
        <thead>
          <tr>
            <th>{t.col.type}</th>
            <th className="dp-num">{t.count}</th>
            <th className="dp-num">{t.avg}</th>
            <th className="dp-num">{t.median}</th>
            <th className="dp-num">{t.p85}</th>
          </tr>
        </thead>
        <tbody>
          {byType(items).map((r) => (
            <tr key={r.type}>
              <td>{r.type}</td>
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

function ItemTable({ items, role, t }: { items: Item[]; role: Role; t: Strings }) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({ key: "lead", desc: true });
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const rows = React.useMemo(() => {
    const get = SORTERS[sort.key];
    return items
      .filter((i) => matches(query, i.id, i.title, i.assignee))
      .sort((a, b) => {
        const x = get(a);
        const y = get(b);
        return (x < y ? -1 : x > y ? 1 : 0) * (sort.desc ? -1 : 1);
      });
  }, [items, query, sort]);
  const date = (ms: number) => new Date(ms).toLocaleDateString(t.locale);
  const fmt = (d?: number) => formatDays(d, t.units, t.locale);
  const head = (key: SortKey, label: string, num = false) => (
    <th className={num ? "dp-num" : undefined} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined}>
      <button
        className="dp-sort"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : num }))}
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
        <span className="dp-muted">{t.shown(Math.min(limit, rows.length), rows.length)}</span>
      </div>
      <div className="dp-scroll">
        <table className="dp-table">
          <thead>
            <tr>
              {head("id", t.col.id, true)}
              {head("title", t.col.title)}
              {head("type", t.col.type)}
              {head("assignee", t.col.assignee)}
              {role === "parent" && head("children", t.col.children, true)}
              {role === "child" && <th className="dp-num">{t.col.parent}</th>}
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
                  <a className="dp-link" href={i.url} target="_blank" rel="noopener noreferrer">
                    {i.title}
                  </a>
                </td>
                <td>{i.type}</td>
                <td>{i.assignee ?? "—"}</td>
                {role === "parent" && <td className="dp-num">{i.childCount}</td>}
                {role === "child" && (
                  <td className="dp-num">
                    <a className="dp-link" href={i.url.replace(/\d+$/, String(i.parentId))} target="_blank" rel="noopener noreferrer">
                      {i.parentId}
                    </a>
                  </td>
                )}
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
        <button className="dp-button" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          {t.showMore}
        </button>
      )}
    </section>
  );
}

function App({ source, mock, t }: { source: DataSource; mock: boolean; t: Strings }) {
  const [from, setFrom] = React.useState(() => toDateInput(Date.now() - DEFAULT_DAYS * DAY_MS));
  const [to, setTo] = React.useState(() => toDateInput(Date.now()));
  const [data, setData] = React.useState<PulseData>();
  const [error, setError] = React.useState<string>();
  const [loading, setLoading] = React.useState(true);
  const [role, setRole] = React.useState<Role>("parent");
  const [type, setType] = React.useState("");
  const [reload, setReload] = React.useState(0);
  const first = React.useRef(true);

  React.useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        source
          .load({ from, to })
          .then(
            (d) => {
              if (cancelled) return;
              setData(d);
              setError(undefined);
            },
            (e) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
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

  const all = data?.items ?? [];
  const types = React.useMemo(() => [...new Set(all.map((i) => i.type))].sort(), [all]);
  const typed = React.useMemo(() => (type && types.includes(type) ? all.filter((i) => i.type === type) : all), [all, type, types]);
  const groups = React.useMemo(
    () => Object.fromEntries(ROLES.map((r) => [r, typed.filter((i) => hasRole(i, r))])) as Record<Role, Item[]>,
    [typed],
  );
  const items = groups[role];
  const lead = leadStats(items);
  const cycle = cycleStats(items);
  const fmt = (d?: number) => formatDays(d, t.units, t.locale);

  return (
    <Page className="dp-page">
      <Header title={t.title} titleSize={TitleSize.Large} description={t.subtitle(data?.project)} />
      <div className="dp-content">
        {mock && <MessageCard severity={MessageCardSeverity.Info}>{t.mock}</MessageCard>}
        <div className="dp-toolbar">
          <label className="dp-field">
            <span className="dp-muted">{t.from}</span>
            <input className="dp-input" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </label>
          <label className="dp-field">
            <span className="dp-muted">{t.to}</span>
            <input className="dp-input" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </label>
          <label className="dp-field">
            <span className="dp-muted">{t.col.type}</span>
            <select className="dp-input" value={types.includes(type) ? type : ""} onChange={(e) => setType(e.target.value)}>
              <option value="">{t.allTypes}</option>
              {types.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <button className="dp-button" disabled={loading} onClick={() => setReload((n) => n + 1)}>
            {loading ? t.loading : t.refresh}
          </button>
        </div>

        {error && <MessageCard severity={MessageCardSeverity.Error}>{t.loadError(error)}</MessageCard>}
        {data?.truncated && <MessageCard severity={MessageCardSeverity.Warning}>{t.truncated}</MessageCard>}
        {data?.warnings.map((w) => (
          <MessageCard key={w} severity={MessageCardSeverity.Warning}>
            {t.warning(w)}
          </MessageCard>
        ))}

        {data && (
          <>
            <div className="dp-tabs" role="tablist">
              {ROLES.map((r) => {
                const s = leadStats(groups[r]);
                return (
                  <button
                    key={r}
                    role="tab"
                    aria-selected={r === role}
                    className={`dp-tab${r === role ? " dp-tab-active" : ""}`}
                    onClick={() => setRole(r)}
                  >
                    <span className="dp-tab-title">{t.roles[r]}</span>
                    <span className="dp-tab-label">
                      {groups[r].length} · {t.medianShort} {fmt(s?.median)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="dp-muted">{t.roleHints[role]}</div>

            {items.length === 0 ? (
              <div className="dp-empty">{t.empty}</div>
            ) : (
              <>
                <div className="dp-cards">
                  <Card label={t.count} value={String(items.length)} />
                  <Card label={t.median} value={fmt(lead?.median)} hint={t.leadHint} />
                  <Card label={t.avg} value={fmt(lead?.avg)} hint={t.leadHint} />
                  <Card label={t.p85} value={fmt(lead?.p85)} hint={t.p85Hint} />
                  <Card label={t.cycle} value={fmt(cycle?.median)} hint={t.cycleHint} />
                </div>
                <WeeklyChart items={items} t={t} />
                <TypeTable items={items} t={t} />
                {/* key: sekme değişince arama, sıralama ve sayfa sıfırlanır. */}
                <ItemTable key={role} items={items} role={role} t={t} />
              </>
            )}
            <div className="dp-muted">{t.closedStates(data.closedStates.join(", "))}</div>
          </>
        )}
        {!data && loading && <div className="dp-empty">{t.loading}</div>}
      </div>
    </Page>
  );
}

function render(source: DataSource, mock: boolean, culture: string | undefined) {
  const lang = pickLang(culture);
  document.documentElement.lang = lang;
  ReactDOM.render(<App source={source} mock={mock} t={STRINGS[lang]} />, document.getElementById("root"));
}

async function start() {
  // Azure DevOps dışında (npm run dev) açıldıysa örnek veriyle çalış; dil ?lang=tr|en ile seçilebilir.
  if (window.self === window.top) {
    render(mockSource, true, new URLSearchParams(window.location.search).get("lang") ?? navigator.language);
    return;
  }
  await SDK.init({ loaded: false, applyTheme: true });
  await SDK.ready();
  try {
    const location = await SDK.getService<ILocationService>(CommonServiceIds.LocationService);
    const baseUrl = await location.getServiceLocation();
    // Azure DevOps Server 2022'de getPageContext() hata fırlatır; sırayla sayfa diline ve tarayıcı diline düşülür.
    const culture = firstOf([
      () => SDK.getPageContext().globalization.culture,
      () => window.parent.document.documentElement.lang,
      () => navigator.language,
    ]);
    // Proje okunamazsa tüm collection sorgulanır.
    const project = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService)
      .then((s) => s.getProject())
      .then((p) => p?.name)
      .catch(() => undefined);
    render(createRestSource(baseUrl, () => SDK.getAccessToken(), project), false, culture);
    await SDK.notifyLoadSucceeded();
  } catch (e) {
    await SDK.notifyLoadFailed(e instanceof Error ? e : String(e));
  }
}

start();
