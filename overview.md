# Delivery Pulse

See how fast work gets delivered. Delivery Pulse measures the time from a work item's **creation to its closure** and reports it separately for **parents**, **children** and **standalone** items.

## Features

- Lead time (created → closed) and cycle time (activated → closed) for every closed work item
- Parents and children calculated separately; items with neither get their own group
- Median, average and 85th percentile per group
- Weekly median lead time chart and breakdown by work item type
- Date range and type filters, search, sortable item list, CSV export
- Dashboard widget: for a date range, items opened and closed, still open, and opened earlier but closed, by work item type
- Follows children across projects and levels; optionally Related and Tested By links
- Works with custom and localized state names: closed states are read from the project's "Completed" state category
- English and Turkish interface, follows the Azure DevOps theme

## Where to find it

Open a project → **Boards** → **Delivery Pulse**.

## Permissions

Read-only: `vso.work`.

Built for Azure DevOps Server 2022.
