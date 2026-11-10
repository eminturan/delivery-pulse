import "./widget.css";

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, ILocationService, IProjectPageService } from "azure-devops-extension-api/Common/CommonServices";
import {
  ConfigurationEvent,
  IWidgetConfigurationContext,
  WidgetConfigurationSave,
  WidgetSettings,
  WidgetStatusHelper,
} from "azure-devops-extension-api/Dashboard";

import { createRestSource } from "../hub/api";
import { firstOf, pickLang, Strings, STRINGS } from "../hub/i18n";
import { DataSource, DAY_MS, dayStart, toDateInput } from "../hub/logic";
import { mockSource } from "../hub/mock";

/** vss-extension.json içindeki publisher ve extension id'si; widget tam id ile de kaydedilir. */
const EXTENSION = "turanemin.delivery-pulse";

/** Azure DevOps dışında (npm run dev) açıldıysa örnek veri ve varsayılan ayarlarla çalışılır. */
export const inHost = window.self !== window.top;

export const PERIODS = [30, 90, 180, 365];

export interface SummarySettings {
  /** Bugünden geriye gün sayısı ya da "custom" (from–to). */
  period: number | "custom";
  from: string;
  to: string;
  related: boolean;
  /** Sayılacak kart tipleri; boşsa hepsi. */
  types: string[];
}
export const SUMMARY_DEFAULTS: SummarySettings = { period: 90, from: "", to: "", related: true, types: [] };

/** Seçili kart tipleri. Eski sürümlerde ayar virgülle ayrılmış metindi; o da okunur. */
export function selectedTypes(cfg: { types?: unknown }): string[] {
  const list = Array.isArray(cfg.types) ? cfg.types : typeof cfg.types === "string" ? cfg.types.split(",") : [];
  return list.map((s) => String(s).trim()).filter(Boolean);
}

/** Ayarlardan tarih aralığı (YYYY-AA-GG); özel aralık eksik ya da tersse undefined. */
export function resolveRange(cfg: SummarySettings, now: number): { from: string; to: string } | undefined {
  if (cfg.period !== "custom") {
    const days = Number(cfg.period) > 0 ? Number(cfg.period) : 90;
    return { from: toDateInput(now - days * DAY_MS), to: toDateInput(now) };
  }
  const from = dayStart(cfg.from);
  const to = dayStart(cfg.to);
  return Number.isNaN(from) || Number.isNaN(to) || from > to ? undefined : { from: cfg.from, to: cfg.to };
}

export interface Env {
  source: DataSource;
  t: Strings;
}

let env: Promise<Env> | undefined;

/** Veri kaynağı ve dil; sayfa başına bir kez kurulur. */
export function connect(): Promise<Env> {
  return (env ??= (async () => {
    if (!inHost) {
      const lang = new URLSearchParams(window.location.search).get("lang") ?? navigator.language;
      return { source: mockSource, t: STRINGS[pickLang(lang)] };
    }
    await SDK.ready();
    const location = await SDK.getService<ILocationService>(CommonServiceIds.LocationService);
    const baseUrl = await location.getServiceLocation();
    // Azure DevOps Server 2022'de getPageContext() hata fırlatır; sırayla sayfa diline ve tarayıcı diline düşülür.
    const culture = firstOf([
      () => SDK.getPageContext().globalization.culture,
      () => window.parent.document.documentElement.lang,
      () => navigator.language,
    ]);
    const project = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService)
      .then((s) => s.getProject())
      .then((p) => p?.name)
      .catch(() => undefined);
    return { source: createRestSource(baseUrl, () => SDK.getAccessToken(), project), t: STRINGS[pickLang(culture)] };
  })());
}

export function useEnv(): Env | undefined {
  const [value, setValue] = React.useState<Env>();
  React.useEffect(() => {
    connect().then(setValue, () => undefined);
  }, []);
  return value;
}

export function parseSettings<T>(settings: WidgetSettings | undefined, defaults: T): T {
  try {
    return { ...defaults, ...JSON.parse(settings?.customSettings?.data || "{}") };
  } catch {
    return defaults;
  }
}

const root = () => document.getElementById("root");
/** Host nesneyi kısa ya da tam contribution id'siyle isteyebilir; ikisi de kaydedilir. */
const register = (id: string, instance: object) => {
  SDK.register(id, instance);
  SDK.register(`${EXTENSION}.${id}`, instance);
};

/** @param view Widget ayarlarından (dashboard dışında undefined) görünümü üretir. */
export function startWidget(id: string, view: (settings?: WidgetSettings) => React.ReactElement) {
  const show = (settings?: WidgetSettings) => ReactDOM.render(view(settings), root());
  if (!inHost) {
    show();
    return;
  }
  const load = (settings: WidgetSettings) => {
    show(settings);
    return WidgetStatusHelper.Success();
  };
  register(id, { preload: () => WidgetStatusHelper.Success(), load, reload: load });
  SDK.init();
}

/**
 * Widget ayar paneli. Her değişiklik host'a bildirilir (önizleme güncellenir, Kaydet etkinleşir).
 * @param valid false dönerse kaydetme engellenir.
 */
export function startConfig<T>(
  id: string,
  defaults: T,
  valid: (value: T) => boolean,
  Form: React.ComponentType<{ value: T; onChange: (value: T) => void; t: Strings; source: DataSource }>,
) {
  let current = defaults;
  let context: IWidgetConfigurationContext | undefined;
  const custom = () => ({ data: JSON.stringify(current) });

  function Host() {
    const ready = useEnv();
    const [value, setValue] = React.useState(current);
    // Panelin yüksekliği içeriğe uyar: kart tipi listesi sonradan yüklenip uzadığında da.
    React.useEffect(() => {
      const form = root()?.firstElementChild;
      if (!inHost || !ready || !form) return;
      const fit = () => SDK.resize(undefined, Math.ceil(form.getBoundingClientRect().height) + 16);
      fit();
      const observer = new ResizeObserver(fit);
      observer.observe(form);
      return () => observer.disconnect();
    }, [ready]);
    if (!ready) return null;
    return (
      <Form
        value={value}
        t={ready.t}
        source={ready.source}
        onChange={(next) => {
          current = next;
          setValue(next);
          context?.notify(ConfigurationEvent.ConfigurationChange, ConfigurationEvent.Args(custom()));
        }}
      />
    );
  }

  if (!inHost) {
    ReactDOM.render(<Host />, root());
    return;
  }
  register(id, {
    load: (settings: WidgetSettings, ctx: IWidgetConfigurationContext) => {
      current = parseSettings(settings, defaults);
      context = ctx;
      ReactDOM.render(<Host />, root());
      return WidgetStatusHelper.Success();
    },
    onSave: () => (valid(current) ? WidgetConfigurationSave.Valid(custom()) : WidgetConfigurationSave.Invalid()),
  });
  SDK.init();
}

/** Widget çerçevesi: başlık, alt başlık ve içerik ya da durum mesajı. */
export function Frame(props: { title: string; sub?: string; message?: string; error?: boolean; children?: React.ReactNode }) {
  return (
    <div className="dpw">
      <div className="dpw-head">
        <div className="dpw-title">{props.title}</div>
        {props.sub && <div className="dpw-sub">{props.sub}</div>}
      </div>
      {props.message ? <div className={`dpw-msg${props.error ? " dpw-error" : ""}`}>{props.message}</div> : props.children}
    </div>
  );
}
