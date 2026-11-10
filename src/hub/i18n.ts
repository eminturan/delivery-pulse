import { Role, Via } from "./logic";

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
  related: string;
  relatedHint: string;
  via: Record<Via, string>;
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
  byProjectTitle: string;
  itemsTitle: string;
  search: string;
  allTypes: string;
  empty: string;
  shown: (shown: number, total: number) => string;
  showMore: string;
  exportCsv: string;
  csv: { separator: string; decimal: string; link: string; leadDays: string; cycleDays: string };
  col: {
    id: string;
    title: string;
    type: string;
    project: string;
    assignee: string;
    created: string;
    closed: string;
    lead: string;
    cycle: string;
    children: string;
    parent: string;
  };
  closedStates: (names: string) => string;
  openCount: (n: number) => string;
  openParentsTitle: (n: number) => string;
  openParentsHint: string;
  parentsOutOfRange: (n: number) => string;
  state: string;
  age: string;
  closedChildren: string;
  /** Dashboard rapor widget'ı. */
  w: {
    lastDays: (n: number) => string;
    custom: string;
    from: string;
    to: string;
    type: string;
    total: string;
    openedClosed: string;
    openedClosedHint: string;
    stillOpen: string;
    stillOpenHint: string;
    closedOlder: string;
    closedOlderHint: string;
    median: string;
    medianHint: string;
    noData: string;
    truncated: string;
    invalidRange: string;
    cfgPeriod: string;
    cfgTypes: string;
    allTypes: string;
    typesError: string;
  };
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
  related: "Related ve Tested By bağlantılarını da izle",
  relatedHint:
    "Açıkken Related ya da Tested By bağlantısıyla bağlı kayıtlar (örn. test kartları) da child gibi sayılır; Parent sütununda bağlantı türüyle gösterilir.",
  via: { related: "Related", tested: "Tested By" },
  loading: "Yükleniyor…",
  loadError: (d) => `Veriler okunamadı: ${d}`,
  truncated: "Sunucu sınırı nedeniyle liste kesildi; sonuçlar eksik olabilir. Tarih aralığını daraltın.",
  warning: (d) => `Bir sorgu başarısız oldu, sonuçlar yaklaşık olabilir (${d}).`,
  roles: { parent: "Parent'lar", child: "Child'lar", standalone: "Bağımsız" },
  roleHints: {
    parent: "En az bir child'ı olan work item'lar. Süre parent'ın kendi açılış–kapanış süresidir.",
    child: "Bu projedeki kayıtların altındaki tüm seviyeler (child, child'ın child'ı; hangi projede olursa olsun) ve bu projede kapanan, bir parent'a bağlı kayıtlar. Hem parent'ı hem child'ı olan kayıtlar iki listede de yer alır.",
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
  byProjectTitle: "Projeye göre",
  itemsTitle: "Work item'lar",
  search: "Ara: id, başlık, kişi, proje",
  allTypes: "Tüm türler",
  empty: "Bu aralıkta kapanan kayıt yok.",
  shown: (s, t) => `${s} / ${t} kayıt`,
  showMore: "Daha fazla göster",
  exportCsv: "CSV indir",
  csv: { separator: ";", decimal: ",", link: "Bağlantı", leadDays: "Lead time (gün)", cycleDays: "Cycle time (gün)" },
  col: {
    id: "ID",
    title: "Başlık",
    type: "Tür",
    project: "Proje",
    assignee: "Atanan",
    created: "Açılış",
    closed: "Kapanış",
    lead: "Lead time",
    cycle: "Cycle time",
    children: "Child",
    parent: "Parent",
  },
  closedStates: (n) => `Kapalı sayılan durumlar: ${n}`,
  openCount: (n) => `${n} açık`,
  openParentsTitle: (n) => `Hâlâ açık parent'lar (${n})`,
  openParentsHint:
    "Child'ları bu aralıkta kapanmış ama kendisi kapalı sayılan bir durumda olmayan parent'lar. Kapanmadıkları için lead time'ları yoktur ve yukarıdaki istatistiklere girmezler.",
  parentsOutOfRange: (n) => `${n} parent seçilen tarih aralığının dışında kapandığı için listede değil.`,
  state: "Durum",
  age: "Yaş",
  closedChildren: "Kapanan child",
  w: {
    lastDays: (n) => `son ${n} gün`,
    custom: "Özel aralık",
    from: "Başlangıç",
    to: "Bitiş",
    type: "Kart tipi",
    total: "Toplam",
    openedClosed: "Açılıp kapanan",
    openedClosedHint: "Aralıkta açılıp aralıkta kapanan",
    stillOpen: "Hâlâ açık",
    stillOpenHint: "Aralıkta açılan ve aralık sonunda kapanmamış olan",
    closedOlder: "Önceden açılıp kapanan",
    closedOlderHint: "Aralıktan önce açılıp aralıkta kapanan",
    median: "Medyan lead time",
    medianHint: "Aralıkta kapananların açılıştan kapanışa süresi",
    noData: "Bu aralıkta açılan ya da kapanan kayıt yok.",
    truncated: "Sunucu sınırı nedeniyle sayılar eksik olabilir; aralığı daraltın.",
    invalidRange: "Ayarlardan geçerli bir tarih aralığı seçin.",
    cfgPeriod: "Tarih aralığı",
    cfgTypes: "Kart tipi",
    allTypes: "Tümü (All)",
    typesError: "Kart tipleri okunamadı. Tipleri virgülle ayırarak yazın; boş bırakılırsa hepsi sayılır.",
  },
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
  related: "Follow Related and Tested By links",
  relatedHint: "When on, items linked with a Related or Tested By link (e.g. test cases) are counted like children; the Parent column shows the link type.",
  via: { related: "Related", tested: "Tested By" },
  loading: "Loading…",
  loadError: (d) => `Could not load data: ${d}`,
  truncated: "The list was cut off by the server limit; results may be incomplete. Narrow the date range.",
  warning: (d) => `A query failed, results may be approximate (${d}).`,
  roles: { parent: "Parents", child: "Children", standalone: "Standalone" },
  roleHints: {
    parent: "Work items with at least one child. The time is the parent's own creation-to-closure time.",
    child: "Every level below this project's items (children, their children; wherever they live), plus items closed in this project that have a parent. Items that have both a parent and children appear in both lists.",
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
  byProjectTitle: "By project",
  itemsTitle: "Work items",
  search: "Search: id, title, person, project",
  allTypes: "All types",
  empty: "No items closed in this range.",
  shown: (s, t) => `${s} of ${t} items`,
  showMore: "Show more",
  exportCsv: "Export CSV",
  csv: { separator: ",", decimal: ".", link: "Link", leadDays: "Lead time (days)", cycleDays: "Cycle time (days)" },
  col: {
    id: "ID",
    title: "Title",
    type: "Type",
    project: "Project",
    assignee: "Assigned to",
    created: "Created",
    closed: "Closed",
    lead: "Lead time",
    cycle: "Cycle time",
    children: "Children",
    parent: "Parent",
  },
  closedStates: (n) => `States counted as closed: ${n}`,
  openCount: (n) => `${n} open`,
  openParentsTitle: (n) => `Parents still open (${n})`,
  openParentsHint:
    "Parents whose children closed in this range but which are not in a closed state themselves. They have no lead time yet and are not part of the statistics above.",
  parentsOutOfRange: (n) => `${n} parent(s) closed outside the selected date range and are not listed.`,
  state: "State",
  age: "Age",
  closedChildren: "Closed children",
  w: {
    lastDays: (n) => `last ${n} days`,
    custom: "Custom range",
    from: "From",
    to: "To",
    type: "Work item type",
    total: "Total",
    openedClosed: "Opened and closed",
    openedClosedHint: "Opened in the range and closed in the range",
    stillOpen: "Still open",
    stillOpenHint: "Opened in the range and not closed by the end of it",
    closedOlder: "Opened earlier, closed",
    closedOlderHint: "Opened before the range and closed in the range",
    median: "Median lead time",
    medianHint: "Creation to closure, for items closed in the range",
    noData: "No items opened or closed in this range.",
    truncated: "Counts may be incomplete because of the server limit; narrow the range.",
    invalidRange: "Pick a valid date range in the settings.",
    cfgPeriod: "Date range",
    cfgTypes: "Work item type",
    allTypes: "All",
    typesError: "Could not read the work item types. Type them separated by commas; leave empty for all.",
  },
};

export const STRINGS: Record<Lang, Strings> = { tr, en };
