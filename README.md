# Delivery Pulse

A delivery speed dashboard for Azure DevOps Server 2022: it measures the **time from a work item's creation to its closure** (lead time), calculated separately for parents and children.

[Türkçe](README.tr.md)

## What it shows

A **Delivery Pulse** page under Boards lists the work items of the current project that were closed in the selected date range (last 90 days by default), in three groups:

| Group | Contents |
| --- | --- |
| **Parents** | Items with at least one child. The time is the parent's own creation-to-closure time. |
| **Children** | Items linked to a parent. |
| **Standalone** | Items with neither a parent nor children. |

An item that has both a parent and children (e.g. a Feature under an Epic) is counted in both groups.

For each group: number closed, median / average / 85th percentile lead time, median cycle time, a weekly median chart, a breakdown by type and a sortable item list.

## How times are calculated

- **Lead time** = closed − `System.CreatedDate`
- **Cycle time** = closed − `Microsoft.VSTS.Common.ActivatedDate` (skipped when the field is empty)
- **Closed** = `Microsoft.VSTS.Common.ClosedDate`, falling back to `Microsoft.VSTS.Common.StateChangeDate`
- **Closed states** = the states in the "Completed" category of the project's work item types (listed at the bottom of the page). If they cannot be read: `Closed`, `Done`, `Completed`, `Tamamlandı`. The Removed category does not count as delivery.
- Times are calendar days; weekends and holidays are not subtracted.
- At most 2000 work items are read per load; the page warns when the limit is hit.

## Development

```bash
npm install
npm run dev        # http://localhost:3002/hub/hub.html — sample data (?lang=tr|en)
npm test
npm run package    # creates the .vsix under out/
```

Upload the `.vsix` via Collection Settings → Extensions → Browse local extensions → Manage extensions → Upload extension. Bump `version` in `vss-extension.json` and `package.json` before each upload.

Scope: `vso.work` only (read work items).

## To verify on a real server

0.1.0 has only been run against sample data. Still to check on a server:

- `ProjectPageService.getProject()` returns the project name (otherwise the whole collection is queried).
- `{project}/_apis/wit/workitemtypes` returns each state's `category`, and localized state names are picked up.
- Custom work item types have `StateChangeDate` and `System.Parent`.
- The `WorkItemLinks` query stays within limits on large projects (if it fails, a warning is shown and child counts are derived only from children closed in the range).

## License

MIT
