import { Role } from "./logic";

export type Lang = "tr" | "en";

/** Azure DevOps kullanıcı dili (örn. "tr-TR") → desteklenen dil. Türkçe dışındaki her dil İngilizce görür. */
export function pickLang(culture: string | undefined | null): Lang {
  return (culture ?? "").toLowerCase().startsWith("tr") ? "tr" : "en";
}

/** Kaynakları sırayla dener; hata fırlatanı ya da boş döneni atlar (Server 2022'de getPageContext() hata fırlatır). */
export function firstOf(sources: Array<() => string | undefined | null>): string | undefined {
  for (const read of sources) {
    try {
      const value = read();
      if (value) return value;
    } catch {
      // bu kaynak kullanılamıyor, sıradakine geç
    }
  }
  return undefined;
}

export interface Strings {
  locale: string;
  units: { day: string; hour: string };
  title: string;
  subtitle: (project: string | undefined) => string;
  mock: string;
  from: string;
  to: string;
  refresh: string;
  loading: string;
  loadError: (detail: string) => string;
  truncated: string;
  warning: (detail: string) => string;
  roles: Record<Role, string>;
  roleHints: Record<Role, string>;
  medianShort: string;
  count: string;
  avg: string;
  median: string;
  p85: string;
  p85Hint: string;
  cycle: string;
  cycleHint: string;
  leadHint: string;
  weeklyTitle: string;
  weeklyHint: string;
  byTypeTitle: string;
  itemsTitle: string;
  search: string;
  allTypes: string;
  empty: string;
  shown: (shown: number, total: number) => string;
  showMore: string;
  col: {
    id: string;
    title: string;
    type: string;
    assignee: string;
    created: string;
    closed: string;
    lead: string;
    cycle: string;
    children: string;
    parent: string;
  };
  closedStates: (names: string) => string;
}

const tr: Strings = {
  locale: "tr-TR",
  units: { day: "gün", hour: "sa" },
  title: "Delivery Pulse",
  subtitle: (p) => (p ? `${p} — work item teslim süreleri` : "Tüm projeler — work item teslim süreleri"),
  mock: "Örnek veri gösteriliyor (Azure DevOps dışında açıldı).",
  from: "Kapanış başlangıcı",
  to: "Kapanış bitişi",
  refresh: "Yenile",
  loading: "Yükleniyor…",
  loadError: (d) => `Veriler okunamadı: ${d}`,
  truncated: "Sunucu sınırı nedeniyle liste kesildi; sonuçlar eksik olabilir. Tarih aralığını daraltın.",
  warning: (d) => `Bir sorgu başarısız oldu, sonuçlar yaklaşık olabilir (${d}).`,
  roles: { parent: "Parent'lar", child: "Child'lar", standalone: "Bağımsız" },
  roleHints: {
    parent: "En az bir child'ı olan work item'lar. Süre parent'ın kendi açılış–kapanış süresidir.",
    child: "Bir parent'a bağlı work item'lar. Hem parent'ı hem child'ı olan kayıtlar iki listede de yer alır.",
    standalone: "Parent'ı da child'ı da olmayan work item'lar.",
  },
  medianShort: "medyan",
  count: "Kapanan",
  avg: "Ortalama lead time",
  median: "Medyan lead time",
  p85: "85. yüzdelik",
  p85Hint: "İşlerin %85'i bu sürede ya da daha kısa sürede kapandı",
  cycle: "Medyan cycle time",
  cycleHint: "İlk aktifleşmeden kapanışa",
  leadHint: "Açılıştan kapanışa",
  weeklyTitle: "Haftalık medyan lead time",
  weeklyHint: "Kapanış haftasına göre; çubuk yüksekliği medyan süre, alttaki sayı kapanan iş adedi",
  byTypeTitle: "Türe göre",
  itemsTitle: "Work item'lar",
  search: "Ara: id, başlık, kişi",
  allTypes: "Tüm türler",
  empty: "Bu aralıkta kapanan kayıt yok.",
  shown: (s, t) => `${s} / ${t} kayıt`,
  showMore: "Daha fazla göster",
  col: {
    id: "ID",
    title: "Başlık",
    type: "Tür",
    assignee: "Atanan",
    created: "Açılış",
    closed: "Kapanış",
    lead: "Lead time",
    cycle: "Cycle time",
    children: "Child",
    parent: "Parent",
  },
  closedStates: (n) => `Kapalı sayılan durumlar: ${n}`,
};

const en: Strings = {
  locale: "en-US",
  units: { day: "d", hour: "h" },
  title: "Delivery Pulse",
  subtitle: (p) => (p ? `${p} — work item delivery times` : "All projects — work item delivery times"),
  mock: "Showing sample data (opened outside Azure DevOps).",
  from: "Closed from",
  to: "Closed to",
  refresh: "Refresh",
  loading: "Loading…",
  loadError: (d) => `Could not load data: ${d}`,
  truncated: "The list was cut off by the server limit; results may be incomplete. Narrow the date range.",
  warning: (d) => `A query failed, results may be approximate (${d}).`,
  roles: { parent: "Parents", child: "Children", standalone: "Standalone" },
  roleHints: {
    parent: "Work items with at least one child. The time is the parent's own creation-to-closure time.",
    child: "Work items linked to a parent. Items that have both a parent and children appear in both lists.",
    standalone: "Work items with neither a parent nor children.",
  },
  medianShort: "median",
  count: "Closed",
  avg: "Average lead time",
  median: "Median lead time",
  p85: "85th percentile",
  p85Hint: "85% of items closed within this time",
  cycle: "Median cycle time",
  cycleHint: "First activation to closure",
  leadHint: "Creation to closure",
  weeklyTitle: "Weekly median lead time",
  weeklyHint: "By closing week; bar height is the median time, the number below is items closed",
  byTypeTitle: "By type",
  itemsTitle: "Work items",
  search: "Search: id, title, person",
  allTypes: "All types",
  empty: "No items closed in this range.",
  shown: (s, t) => `${s} of ${t} items`,
  showMore: "Show more",
  col: {
    id: "ID",
    title: "Title",
    type: "Type",
    assignee: "Assigned to",
    created: "Created",
    closed: "Closed",
    lead: "Lead time",
    cycle: "Cycle time",
    children: "Children",
    parent: "Parent",
  },
  closedStates: (n) => `States counted as closed: ${n}`,
};

export const STRINGS: Record<Lang, Strings> = { tr, en };
