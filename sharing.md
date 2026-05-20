# Sharing & subscription plan

Two virality features for the Dynatrace Bytes microsite. The site is a static
GitHub Pages app (`index.html` + `app.js` + JSON-shaped JS data) with no
backend, so designs below stay client-only where possible and call out the
exact spot a third-party hop becomes necessary.

---

## 1. Share a direct link to a piece of content

### Goal
Anyone can copy a URL that, when opened, lands the visitor on the exact video
segment or text snippet the sharer was viewing — skipping the random shuffle.

### URL scheme
Use a hash fragment so GitHub Pages serves `index.html` untouched and the app
can route client-side:

- Video: `https://dtbytes.dynatrace.com/#/v/<videoId>?t=<startSeconds>`
- Text:  `https://dtbytes.dynatrace.com/#/t/<snippetId>`

Why hash, not path: no server rewrites needed, and the existing `itemKey`
format in [app.js:37-39](app.js#L37-L39) already separates the two kinds with
`v:` / `t:` prefixes — the URL just mirrors that.

### App-side changes
All in [app.js](app.js):

1. **Parse on load.** Before `applyMode(stored)` in `init()`
   ([app.js:493-498](app.js#L493-L498)), read `location.hash`. If it matches
   `#/v/<id>` or `#/t/<id>`, remember the requested item and skip the mode
   modal (force `mode = 'both'` if no stored mode, so the deep link always
   works regardless of preference).
2. **Seed the deck.** In `buildItems()` ([app.js:441-448](app.js#L441-L448)),
   after the shuffle, if a deep-link target exists, find its index in `items`
   and swap it to position 0. Falls back gracefully if the id has been removed
   from the data files (show toast: "That clip is no longer available" then
   start at index 0).
3. **Update the hash as the user advances.** In `showItem`
   ([app.js:299-302](app.js#L299-L302)), call
   `history.replaceState(null, '', '#/v/<id>')` (or `t`) so the address bar
   always reflects what's on screen — every clip is shareable, not just the
   first one.
4. **Share button.** Add a button next to "Report an issue" in
   [index.html:42-46](index.html#L42-L46). Click handler:
   - If `navigator.share` exists (mobile), call it with `{ title, text, url }`.
   - Otherwise `navigator.clipboard.writeText(url)` and `showToast('Link
     copied — paste it anywhere.')`.
5. **Telemetry.** New bizevent `com.dynatrace.dtbytes.shared` with `{ kind,
   videoId|snippetId, method: 'native'|'clipboard' }`. Mirrors the existing
   `sendBizEvent` pattern in [app.js:63-72](app.js#L63-L72). Also fire
   `com.dynatrace.dtbytes.deeplink.opened` when a hash is parsed on load — so
   we can see share→visit conversion in Dynatrace.

### Social previews (OpenGraph)
A bare URL on Slack/LinkedIn/X is ugly. Two options:

- **Static OG tags in `index.html`** — easy, but every share looks identical.
- **Per-item OG via a tiny redirect worker** (Cloudflare Worker or Netlify
  function in front of the apex). Worker reads the path, looks up the item,
  returns an HTML stub with item-specific `og:title`, `og:image` (YouTube
  thumbnail for videos), then 302s humans to the hash URL. This is the only
  piece that needs infra beyond GitHub Pages.

Recommendation: ship static OG first (one PR, no infra), add the worker in a
follow-up once we see share volume justify it.

### Edge cases
- Hash points to an unknown id → toast + start random shuffle.
- User in `text` mode opens a `#/v/...` link → temporarily widen the deck for
  this session so the linked video plays; do **not** overwrite their stored
  mode preference.
- Share button on a 404'd item should be hidden, not just disabled.

---

## 2. Subscribe for updates

Add a dummy placeholder with text to say "coming soon" for this. We need to hint to stakeholders that this is possible but will need further discussion.

### Goal
A visitor leaves their email (or another channel) and gets pinged when new
clips/snippets are added.

### The static-site constraint
There is no backend, and we should not build one just for this. Pick a hosted
service and embed it. Shortlist:

| Option | Pros | Cons |
| --- | --- | --- |
| **Buttondown / Beehiiv / ConvertKit** | Real newsletter, RSS-to-email, double opt-in handled, free tier | Another vendor, branded footer on free tier |
| **Dynatrace marketing list (Marketo/Eloqua)** | Already a corporate channel, GDPR/CASL handled by the existing team | Slowest to set up, requires marketing buy-in |
| **RSS feed only** | Zero vendor cost, just a generated `feed.xml` | Most users don't use RSS in 2026 — would need to pair with one of the above |

Recommendation: **Buttondown (or whichever Dynatrace marketing already uses)
+ an auto-generated RSS feed**. RSS is cheap insurance and powers the email
service's "new post" trigger.

### UX
- A small "Get notified when we add new clips" link in the footer next to the
  counter. Opens a `<dialog>` (same pattern as the existing report modal in
  [app.js:312-373](app.js#L312-L373)) with:
  - One email input
  - Optional radio: "All updates" / "Video only" / "Text only" — maps to a
    list tag in the provider
  - Submit → POST to provider's form endpoint (no JS SDK needed for
    Buttondown/ConvertKit; both accept `application/x-www-form-urlencoded`)
  - Success toast: "Check your inbox to confirm." (double opt-in is on by
    default in all the providers above — important for GDPR).
- After successful subscribe, set `localStorage['dtbytes_subscribed'] = '1'`
  and hide the prompt for that browser. Re-show if they clear storage.
- Soft prompt: after the user rates ≥ 3 clips positively in one session,
  showToast suggesting "Liking these? Subscribe →" with a click target. Don't
  nag — once dismissed, don't show again for 30 days
  (`localStorage['dtbytes_sub_dismissed_at']`).

### Telemetry
- `com.dynatrace.dtbytes.subscribe.opened` — modal shown
- `com.dynatrace.dtbytes.subscribe.submitted` — `{ topics }`, no email PII
- `com.dynatrace.dtbytes.subscribe.dismissed`

### Generating the RSS feed
New file `feed.xml` at repo root, built by a tiny Node script run in CI (or by
hand for now since the data files are small). For each entry in
[data/segments.js](data/segments.js) and [data/snippets.js](data/snippets.js):

- `<title>` — first non-empty `topKeywords` joined, or excerpt's first
  sentence
- `<link>` — deep-link URL from feature 1
- `<pubDate>` — needs a `addedAt` field on each item (new — add when
  authoring; default to file mtime if missing)
- `<description>` — `excerpt` for videos, first 200 chars of the snippet
  markdown for text

`addedAt` is the only data-model change required and it's strictly additive.

### Edge cases
- User submits invalid email → inline error, no toast.
- Provider 5xx → toast "Couldn't sign you up — try again in a minute."
- Honor `prefers-reduced-motion` on the modal animation (existing modals
  already do; keep consistent).

---

## Phasing

**Phase 1 — direct links (1 PR):**
hash routing, share button, telemetry, static OG tags. No infra changes.

**Phase 2 — subscribe (1 PR + vendor signup):**
modal, provider wiring, `dtbytes_subscribed` flag, telemetry.

**Phase 3 — feed + per-item OG (1 PR + CI tweak):**
`addedAt` field, `feed.xml` generation, optional Cloudflare Worker for rich
social previews. Connect the feed to the newsletter provider's "RSS-to-email"
trigger and the loop closes — new content goes out automatically.

## Open questions
- Which email provider does Dynatrace marketing want us to route through?
  That decision blocks Phase 2.
- Are we OK with `dtbytes.dynatrace.com` as the canonical host for share
  links, or should links go through a `dyna.tc/...` style shortener for
  analytics?
- Do we need a cookie consent banner before storing the new
  `dtbytes_subscribed` / `dtbytes_sub_dismissed_at` keys? (Probably already
  covered by the existing Dynatrace RUM script, but worth confirming.)
