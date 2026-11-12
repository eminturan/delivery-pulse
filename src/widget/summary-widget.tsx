import * as React from "react";
import { WidgetSettings } from "azure-devops-extension-api/Dashboard";

import { dayStart, Flow, FLOWS, formatDays, isCancelled, ReportData, ReportRow, summarize } from "../hub/logic";
import { Frame, parseSettings, resolveRange, selectedTypes, startWidget, SUMMARY_DEFAULTS, useEnv } from "./shared";

/** Kayıt listesinde tek seferde gösterilen en fazla satır. */
const LIST_LIMIT = 500;

/** Kart tipine göre rapor: seçilen aralıkta açılan ve kapanan kayıt sayıları. */
function Summary({ settings }: { settings?: WidgetSettings }) {
  const env = useEnv();
  const cfg = parseSettings(settings, SUMMARY_DEFAULTS);
  const range = resolveRange(cfg, Date.now());
  const types = selectedTypes(cfg);
  const typeKey = types.join("|");
  const [data, setData] = React.useState<ReportData>();
  const [error, setError] = React.useState<string>();
  /** Tıklanan sayı: hangi tip (boşsa toplam) ve hangi grup. Doluyken tablo yerine o kayıtlar listelenir. */
  const [pick, setPick] = React.useState<{ type?: string; flow: Flow }>();

  React.useEffect(() => {
    if (!env || !range) return;
    let cancelled = false;
    setData(undefined);
    setPick(undefined);
    env.source.loadReport({ ...range, related: true, types }).then(
      (d) => {
        if (cancelled) return;
        // İptal edilenler hariç tutulacaksa sayılar kalan kayıtlardan yeniden hesaplanır.
        const items = cfg.noCancelled ? d.items.filter((i) => !isCancelled(i)) : d.items;
        setData(cfg.noCancelled ? { ...d, ...summarize(items), items } : d);
        setError(undefined);
      },
      (e) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [env, range?.from, range?.to, typeKey, !!cfg.noCancelled]);

  const title = settings?.name || "Delivery Pulse";
  if (!env) return <Frame title={title} />;
  const { t } = env;
  if (!range) return <Frame title={title} message={t.w.invalidRange} />;
  const date = (d: string) => new Date(dayStart(d)).toLocaleDateString(t.locale);
  const sub = [
    `${date(range.from)} – ${date(range.to)}`,
    cfg.period === "custom" ? "" : t.w.lastDays(Number(cfg.period)),
    types.join(", "),
    cfg.noCancelled ? t.noCancelled : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (error) return <Frame title={title} sub={sub} message={t.loadError(error)} error />;
  if (!data) return <Frame title={title} sub={sub} message={t.loading} />;
  if (data.rows.length === 0) return <Frame title={title} sub={sub} message={t.w.noData} />;

  if (pick) {
    const items = data.items
      .filter((i) => i.flow === pick.flow && (pick.type === undefined || i.type === pick.type))
      .sort((a, b) => b.created - a.created);
    const day = (ms?: number) => (ms === undefined ? "—" : new Date(ms).toLocaleDateString(t.locale));
    return (
      <Frame title={title} sub={sub}>
        <div className="dpw-bar">
          <button className="dpw-back" onClick={() => setPick(undefined)}>
            {t.w.back}
          </button>
          <span className="dpw-picked" title={t.w[`${pick.flow}Hint` as const]}>
            {[pick.type ?? t.w.total, t.w[pick.flow]].join(" · ")} ({items.length})
          </span>
        </div>
        <div className="dpw-scroll">
          <table className="dpw-table dpw-list">
            <thead>
              <tr>
                <th scope="col">{t.col.id}</th>
                <th scope="col">{t.col.title}</th>
                <th scope="col">{t.col.created}</th>
                <th scope="col" className="dpw-extra">
                  {t.col.closed}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, LIST_LIMIT).map((i) => (
                <tr key={i.id}>
                  <th scope="row">{i.id}</th>
                  <td className="dpw-name" title={`${i.title} — ${i.type}, ${i.state}, ${i.project}`}>
                    <a href={i.url} target="_blank" rel="noopener noreferrer">
                      {i.title}
                    </a>
                  </td>
                  <td>{day(i.created)}</td>
                  <td className="dpw-extra">{day(i.closed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length > LIST_LIMIT && <div className="dpw-sub">{t.shown(LIST_LIMIT, items.length)}</div>}
      </Frame>
    );
  }

  const row = (r: ReportRow, label: string, total = false) => (
    <tr key={label} className={total ? "dpw-total" : undefined}>
      <th scope="row" title={label}>
        {label}
      </th>
      {FLOWS.map((f) => (
        <td key={f}>
          {r[f] > 0 ? (
            <button className="dpw-count" title={t.w.showItems} onClick={() => setPick({ type: total ? undefined : r.type, flow: f })}>
              {r[f]}
            </button>
          ) : (
            0
          )}
        </td>
      ))}
      <td className="dpw-extra">{formatDays(r.avg, t.units, t.locale)}</td>
    </tr>
  );
  return (
    <Frame title={title} sub={sub}>
      <div className="dpw-scroll">
        <table className="dpw-table">
          <thead>
            <tr>
              <th scope="col">{t.w.type}</th>
              <th scope="col" title={t.w.openedClosedHint}>
                {t.w.openedClosed}
              </th>
              <th scope="col" title={t.w.stillOpenHint}>
                {t.w.stillOpen}
              </th>
              <th scope="col" title={t.w.closedOlderHint}>
                {t.w.closedOlder}
              </th>
              <th scope="col" className="dpw-extra" title={t.w.avgHint}>
                {t.w.avg}
              </th>
            </tr>
          </thead>
          <tbody>
            {row(data.total, t.w.total, true)}
            {data.rows.map((r) => row(r, r.type || "—"))}
          </tbody>
        </table>
      </div>
      {data.truncated && <div className="dpw-sub dpw-error">{t.w.truncated}</div>}
      {data.warnings.length > 0 && (
        <div className="dpw-sub dpw-error" title={data.warnings.join("\n")}>
          {t.warning(data.warnings[0])}
        </div>
      )}
    </Frame>
  );
}

startWidget("summary-widget", (settings) => <Summary settings={settings} />);
