import * as React from "react";

import { Strings } from "../hub/i18n";
import { DataSource, toDateInput } from "../hub/logic";
import { PERIODS, resolveRange, selectedTypes, startConfig, SUMMARY_DEFAULTS, SummarySettings } from "./shared";

interface FormProps {
  value: SummarySettings;
  onChange: (value: SummarySettings) => void;
  t: Strings;
  source: DataSource;
}

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

/** Kart tipi seçimi: "Tümü" ya da seçilen aralıkta görülen tiplerden bir ya da birkaçı. */
function Types({ value, onChange, t, source }: FormProps) {
  const range = resolveRange(value, Date.now());
  const [names, setNames] = React.useState<string[]>();
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (!range) return;
    let cancelled = false;
    setNames(undefined);
    setFailed(false);
    source.loadReport({ ...range, related: value.related }).then(
      (d) => !cancelled && setNames(d.rows.map((r) => r.type).filter(Boolean)),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [source, range?.from, range?.to, value.related]);

  const selected = selectedTypes(value);
  // Seçili ama bu aralıkta hiç görülmeyen tipler de listede kalır ki kaldırılabilsinler.
  const options = [...(names ?? []), ...selected.filter((s) => !(names ?? []).some((n) => same(n, s)))].sort((a, b) =>
    a.localeCompare(b, t.locale),
  );
  return (
    <fieldset className="dpc-types">
      <legend>{t.w.cfgTypes}</legend>
      <label className="dpc-check">
        <input type="checkbox" checked={selected.length === 0} onChange={() => onChange({ ...value, types: [] })} />
        {t.w.allTypes}
      </label>
      {failed ? (
        <label className="dpc-field">
          <input
            type="text"
            aria-label={t.w.cfgTypes}
            value={selected.join(", ")}
            onChange={(e) => onChange({ ...value, types: e.target.value.split(",").map((s) => s.trimStart()) })}
          />
          <span className="dpc-hint">{t.w.typesError}</span>
        </label>
      ) : !names && range ? (
        <span className="dpc-hint">{t.loading}</span>
      ) : (
        <div className="dpc-types-list">
          {options.map((name) => {
            const on = selected.some((s) => same(s, name));
            return (
              <label className="dpc-check" key={name}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    onChange({ ...value, types: on ? selected.filter((s) => !same(s, name)) : [...selected, name] })
                  }
                />
                {name}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function Form(props: FormProps) {
  const { value, onChange, t } = props;
  return (
    <div className="dpc">
      <label className="dpc-field">
        <span>{t.w.cfgPeriod}</span>
        <select
          value={String(value.period)}
          onChange={(e) => {
            const period = e.target.value === "custom" ? "custom" : Number(e.target.value);
            // Özel aralığa ilk geçişte o an görünen aralık doldurulur.
            const shown = resolveRange(value, Date.now());
            onChange({
              ...value,
              period,
              from: value.from || shown?.from || toDateInput(Date.now()),
              to: value.to || shown?.to || toDateInput(Date.now()),
            });
          }}
        >
          {PERIODS.map((d) => (
            <option key={d} value={d}>
              {t.w.lastDays(d)}
            </option>
          ))}
          <option value="custom">{t.w.custom}</option>
        </select>
      </label>
      {value.period === "custom" && (
        <div className="dpc-row">
          <label className="dpc-field">
            <span>{t.w.from}</span>
            <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          </label>
          <label className="dpc-field">
            <span>{t.w.to}</span>
            <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
          </label>
        </div>
      )}
      <Types {...props} />
      <label className="dpc-check" title={t.relatedHint}>
        <input type="checkbox" checked={value.related} onChange={(e) => onChange({ ...value, related: e.target.checked })} />
        {t.related}
      </label>
    </div>
  );
}

startConfig<SummarySettings>("summary-widget-config", SUMMARY_DEFAULTS, (value) => !!resolveRange(value, Date.now()), Form);
