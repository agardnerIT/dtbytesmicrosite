# Observability Improvement Plan

## Goal

Capture four things via Dynatrace business events:

1. **Which mode** the user chose (text / video / both)
2. **If / when** a user changes their mode
3. **Which items** were shown to a user
4. **Which items** the user skipped (proxy for engagement)

The RUM agent is already loaded ([index.html:8](index.html#L8)).

---

## The events

Four business events, all via `dynatrace.sendBizEvent`.

| Event | Fires when | Payload |
|---|---|---|
| `com.dynatrace.dtbytes.mode.chosen` | User picks a mode in the initial modal | `{ mode }` |
| `com.dynatrace.dtbytes.mode.changed` | User switches via header toggle | `{ mode, previousMode }` |
| `com.dynatrace.dtbytes.item.shown` | An item is rendered to the user | `{ kind, id, mode }` |
| `com.dynatrace.dtbytes.item.skipped` | User clicks "Show me another" with an item on screen | `{ kind, id, mode }` |

`kind` is `'video'` or `'text'`; `id` is `videoId` or `snippetId`.

`item.shown` ⋈ `item.skipped` gives skip rate per item — the headline engagement metric.

---

## Where to change

### `mode.chosen`
- Modal callback at [app.js:422](app.js#L422) — fire here instead of the current generic `mode.selected`.

### `mode.changed`
- Header toggle handler at [app.js:490](app.js#L490) — fire here. Include the previous mode (already known in `applyMode`).

### `item.shown`
- Inside the `setTimeout` of `showVideoSegment()` at [app.js:235-240](app.js#L235-L240).
- Inside the `setTimeout` of `showTextSnippet()` at [app.js:280-287](app.js#L280-L287).
- Fire when the content actually commits to the DOM, not at `showItem()` call time, so we don't over-count rapid skips.

### `item.skipped`
- In `next()` at [app.js:304-308](app.js#L304-L308), fire *before* advancing the index, using `items[index]` (the outgoing item).
- Skip the fire on the very first "next" press if no item is on screen yet (shouldn't happen given the flow, but cheap guard).

### Cleanup
- Remove the existing `com.dynatrace.dtbytes.mode.selected` event ([app.js:385-389](app.js#L385-L389)) — replaced by the two above.
