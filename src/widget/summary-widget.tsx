import * as React from "react";
import { WidgetSettings } from "azure-devops-extension-api/Dashboard";

import { dayStart, formatDays, ReportData, ReportRow } from "../hub/logic";
import { Frame, parseSettings, resolveRange, selectedTypes, startWidget, SUMMARY_DEFAULTS, useEnv } from "./shared";

/** Kart tipine göre rapor: seçilen aralıkta açılan ve kapanan kayıt sayıları. */
function Summary({ settings }: { settings?: WidgetSettings }) {
  const env = useEnv();
  const cfg = parseSettings(settings, SUMMARY_DEFAULTS);
  const range = resolveRange(cfg, Date.now());
  const types = selectedTypes(cfg);
  const typeKey = types.join("|");
  const [data, setData] = React.useState<ReportData>();
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (!env || !range) return;
    let cancelled = false;
    setData(undefined);
    env.source.loadReport({ ...range, related: cfg.related, types }).then(
      (d) => !cancelled && (setData(d), setError(undefined)),
      (e) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [env, range?.from, range?.to, cfg.related, typeKey]);

  const title = settings?.name || "Delivery Pulse";
  if (!env) return <Frame title={title} />;
  const { t } = env;
  if (!range) return <Frame title={title} message={t.w.invalidRange} />;
  const date = (d: string) => new Date(dayStart(d)).toLocaleDateString(t.locale);
  const sub = [
    `${date(range.from)} – ${date(range.to)}`,
    cfg.period === "custom" ? "" : t.w.lastDays(Number(cfg.period)),
    types.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  if (error) return <Frame title={title} sub={sub} message={t.loadError(error)} error />;
  if (!data) return <Frame title={title} sub={sub} message={t.loading} />;
  if (data.rows.length === 0) return <Frame title={title} sub={sub} message={t.w.noData} />;

  const row = (r: ReportRow, label: string, total = false) => (
    <tr key={label} className={total ? "dpw-total" : undefined}>
      <th scope="row" title={label}>
        {label}
      </th>
      <td>{r.openedClosed}</td>
      <td>{r.stillOpen}</td>
      <td>{r.closedOlder}</td>
      <td className="dpw-extra">{formatDays(r.median, t.units, t.locale)}</td>
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
              <th scope="col" className="dpw-extra" title={t.w.medianHint}>
                {t.w.median}
              </th>
            </tr>
          </thead>
          <tbody>
            {row(data.total, t.w.total, true)}
            {data.rows.map((r) => row(r, r.type || "—"))}
          </tbody>
        </table>
      </div>
      {(data.truncated || data.warnings.length > 0) && (
        <div className="dpw-sub dpw-error" title={data.warnings.join("\n")}>
          {t.w.truncated}
        </div>
      )}
    </Frame>
  );
}

startWidget("summary-widget", (settings) => <Summary settings={settings} />);
