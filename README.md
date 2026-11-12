# Delivery Pulse

A delivery speed dashboard for Azure DevOps Server 2022: it measures the **time from a work item's creation to its closure** (lead time), calculated separately for parents and children.

[Türkçe](README.tr.md)

## What it shows

A **Delivery Pulse** page under Boards lists the work items of the current project that were closed in the selected date range (last 90 days by default) in a single list. Each row shows its number of children (Children column) and the item it hangs under (Parent column), so parents, children and standalone items are told apart by those two columns.

### Parents in one project, children in others

When the page is opened from the project that holds the parents, **children whose parent is in this project are read from whichever project they live in** and listed with their project name (plus a "By project" breakdown). Lower levels are followed too (children of children, up to 5 levels). Items linked with a Related or Tested By link (e.g. test cases) are followed like children, and the Parent column shows the link type. Each child is judged closed by its own project's closed states. Parents whose children have closed but which are still open themselves are listed under "Parents still open".

When the page is opened from a child project, it shows the items closed in that project; their parents are read even if they live elsewhere.

Above the list, three counters for the selected range: items opened and closed in it, items opened in it and still open, and items opened earlier and closed in it (the type filter applies). Clicking a counter, or picking it in the "Show" menu, lists only those items below, and the statistics and CSV export follow the selection; items still open have no closing date or lead time.

For the list: number closed, median / average / 85th percentile lead time, median cycle time, a weekly median chart, a breakdown by type and a sortable item list.

## CSV export

The **Export CSV** button above the item list downloads every row that passes the search and sort, not just the first 100 shown. The Turkish interface uses `;` as separator and `,` as decimal mark (what a Turkish Excel expects); the English interface uses `,` and `.`.

## Dashboard widget

**Delivery Pulse – Summary** appears under **Add a widget** on a dashboard. For the selected date range it finds the work item types itself and shows one row per type, with a total on top:

| Column | Meaning |
| --- | --- |
| **Opened and closed** | Opened in the range and closed in the range |
| **Still open** | Opened in the range and not closed by the end of it |
| **Opened earlier, closed** | Opened before the range and closed in the range |
| **Average lead time** | Creation to closure, for items opened and closed in the range |

The widget can be 2–4 columns wide and 2–6 rows tall; about 9 work item types fit at two rows, the rest scroll inside the widget.

An item closed after the range ended counts as open at the end of the range, so every item opened in the range is in one of the first two columns. Items opened before the range and still open are not part of the report.

With "Exclude cancelled" on (page toolbar, widget settings), items in the İptal state are left out of the counts, times and lists.

Clicking a number in the widget lists those items inside it (ID, title, created, closed; the title opens the work item); "Back" returns to the table.

Settings: date range (last 30 / 90 / 180 / 365 days, or a custom from–to), work item type ("All" by default; pick one or more from the list and the total follows the selection). Related and Tested By links are always followed. The scope matches the page: the items of the widget's project and everything below them, in whichever project.

## How times are calculated

- **Lead time** = closed − `System.CreatedDate`
- **Cycle time** = closed − `Microsoft.VSTS.Common.ActivatedDate` (skipped when the field is empty)
- **Closed** = `Microsoft.VSTS.Common.ClosedDate`, falling back to `Microsoft.VSTS.Common.StateChangeDate`
- **Closed states** = the states in the "Completed" category of the project's work item types (listed at the bottom of the page). If they cannot be read: `Closed`, `Done`, `Completed`, `Tamamlandı`. The `İptal` (cancelled) state always counts as closed, whatever its category: a cancelled item's process has ended too.
- Times are calendar days; weekends and holidays are not subtracted.
- A single server query returns at most 20000 rows. When a query reaches that, the date range is split in half and each half is queried again (down to single days), so wide ranges are still read completely. At most 50000 work items are read per load; the page warns only when that is exceeded or a single day still hits the query limit.

## Development

```bash
npm install
npm run dev        # http://localhost:3002/hub/hub.html — sample data (?lang=tr|en)
                   # widget: /summary-widget/summary-widget.html, settings panel: /summary-config/summary-config.html
npm test
npm run package    # creates the .vsix under out/
```

Upload the `.vsix` via Collection Settings → Extensions → Browse local extensions → Manage extensions → Upload extension. Bump `version` in `vss-extension.json` and `package.json` before each upload.

Scope: `vso.work` only (read work items).

## To verify on a real server

Cross-project reading has only been run against sample data. Still to check on a server:

- CSV download: the extension frame allows file downloads (a file is saved when the button is pressed).
- Widget: it shows in the catalog, the settings panel opens, and settings persist after Save.
- The collection-level `WorkItemLinks` query (parent in this project, child anywhere) works and returns in reasonable time.
- A lower level is only reached through items whose state changed in the selected range: if the item in between never changed state in the range, the items below it are not found.
- With the option on, the link types in the response are named `System.LinkTypes.Related` and `Microsoft.VSTS.Common.TestedBy-Forward`.
- Children in projects the user cannot see are skipped silently, so counts may be incomplete.

- `ProjectPageService.getProject()` returns the project name (otherwise the whole collection is queried).
- `{project}/_apis/wit/workitemtypes` returns each state's `category`, and localized state names are picked up.
- Custom work item types have `StateChangeDate` and `System.Parent`.
- The `WorkItemLinks` query stays within limits on large projects (if it fails, a warning is shown and child counts are derived only from children closed in the range).

## License

MIT
