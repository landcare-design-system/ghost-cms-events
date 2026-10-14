# Ghost CMS + Events: experimental core prototype

Status: working local proof of concept, not an upstream-approved feature or a production release.

## Base and isolation

- Official upstream: `https://github.com/TryGhost/Ghost.git`.
- Base: `9fd9295584c9a7491693303a487701911f231943`, fetched 3 October 2026; matched upstream `main` at verification.
- Source version: `6.68.0-rc.0`; latest stable tag at verification: `v6.67.0`.
- Branch: `codex/event-posts-prototype`.
- Local preview: `http://127.0.0.1:2370/`; Admin: `http://127.0.0.1:2370/ghost/`.
- Public experimental fork: <https://github.com/landcare-design-system/ghost-cms-events>, forked from `TryGhost/Ghost`.
- Event implementation branch: `codex/event-posts-prototype`. This is not an upstream submission or an official Ghost release.
- The preview uses a separate MySQL database, `ghost_events_prototype`, and content directory. Its synthetic owner credentials are outside the source checkout. The existing theme test instance on port 2368 and the Banksia Coast demo are independent.

## Working behavior

An event remains an ordinary Ghost post with `posts.type = post`. Nullable structured metadata in the existing `posts_meta` relation identifies an event and holds its practical details:

| Field                 | Meaning                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `event_all_day`       | true for calendar-day events; false/null for timed events            |
| `post_kind`           | `event`, or null for ordinary posts                                  |
| `event_start_at`      | UTC start instant                                                    |
| `event_end_at`        | UTC finish instant, later than start                                 |
| `event_timezone`      | IANA timezone for entering and displaying local times                |
| `event_status`        | confirmed, cancelled or postponed                                    |
| `event_location`      | venue or online location text                                        |
| `event_booking_url`   | optional HTTP/HTTPS booking link                                     |
| `event_booking_label` | optional button text, up to 100 characters; theme supplies a default |

Publication, scheduling, newsletters, membership access and existing post URLs retain their existing meaning. An announcement can be published well before the event happens. Event metadata cannot be attached to pages. Incomplete event drafts can be saved; publication or scheduling requires valid dates, timezone and event status.

The prototype adds event settings to Ghost's current React editor, enabled in this local runtime through the existing `editorReact` Labs flag. It follows Shade controls and the editor's settings/save machinery. A saved response containing `post_kind` detects backend support; an older backend omitting the field hides the controls. A new post must first be saved before these controls appear. This does not add event controls to the legacy Ember editor.

Datetime inputs interpret wall times in the event timezone and store UTC instants. Nonexistent and ambiguous daylight saving times are rejected. Changing the timezone displays the existing instants in the new timezone; it does not silently reschedule them. Copying a post and restoring a local browser backup preserve event metadata in a new draft. All-day events use date-only inputs and an inclusive “Last day” in Admin. Storage uses local midnight at the start and the following local midnight after the last day, converted to UTC. Calendar-day arithmetic accommodates 23-hour and 25-hour days; a finish is exclusive for filtering. Timed-to-all-day conversion rounds to the enclosing calendar days and retains an already-midnight finish. All-day timezone changes preserve the selected calendar dates and atomically recalculate their midnight boundaries in the new zone. Invalid IANA zones are rejected before saving. Both timed and all-day events may span multiple days. The demonstration theme renders start and finish dates on cards and detail pages. All-day finishes display the inclusive last day through a small optional `exclusive_end=true` extension to the existing `date` helper; ordinary date formatting is unchanged. One-day all-day events display a single date. Listing queries retain the stored exclusive finish, so a multi-day event remains underway throughout its last day.

## Calendar download and timezone selection

The frontend serves `GET /events/:id/calendar.ics` for published public event posts on public sites. Themes can link to `{{@site.url}}/events/{{id}}/calendar.ics` without an API key. The route precedes static theme assets so `.ics` is not mistaken for a theme asset. It reads through Ghost's public-post API and additionally refuses member/paid posts and private sites. Drafts, ordinary posts, malformed IDs and invalid date ranges return 404.

The download is an RFC 5545 single-event calendar: stable post-based UID, update timestamps, title, venue, excerpt, public post URL, optional booking URL and event status. Timed events export UTC instants. All-day events export local calendar dates with an exclusive finish, including multi-day events across daylight saving. Text is escaped and UTF-8 lines are folded with CRLF endings. Downloads are uncached so a fresh download reflects edits. This is a calendar import, not a subscription; an imported entry does not automatically receive later changes. Private/member calendar exports, recurrence, reminders and feeds are outside this first version.

New events default to Ghost's configured site timezone and persist that value. Existing events keep their saved timezone. Admin reuses the Shade searchable timezone control and Ghost's named timezone list, ordered by UTC offset. Labels such as `(UTC+11:00) Australia/Sydney` show the offset at the event start date, rather than today's offset. Storing the named IANA zone preserves daylight-saving rules across a multi-day event. Timed timezone changes retain the instant; all-day timezone changes retain the selected dates.

## Revision history

Server-side post revisions now carry a nullable JSON `event_details` snapshot. Event-only changes participate in Ghost's existing revision policy. The React history preview displays event dates, timezone, status, location and booking URL. Restoring a version writes the snapshot together with the content through the normal save/validation path and leaves the post URL unchanged. A snapshot with null event fields explicitly restores an ordinary post. A pre-feature revision with no snapshot leaves the current event metadata unchanged. Failed restoration rolls back the staged event fields with the content.

The snapshot is one additional nullable column on `post_revisions`; no new post table or publishing lifecycle is introduced. The added all-day flag is one nullable column on `posts_meta`. Both additions have reversible migrations.

## Listings and filtering

No HTML card, publication-date substitution or browser-side sorting is used. Existing Ghost query mechanisms filter the metadata and order the database results before pagination.

- Upcoming or underway: event kind, confirmed status, finish later than the current UTC instant; start ascending, then ID ascending for a stable tie break.
- Past: event kind, finish at or before the current UTC instant; start descending, then ID descending.
- Cancelled and postponed: a separate list, excluded from confirmed upcoming events. The example past list includes historical events of any status.

The Content API accepts the ordinary Ghost NQL format, with a quoted explicit UTC timestamp, for example:

```text
filter=post_kind:event+event_status:confirmed+event_end_at:>'2026-10-03T08:00:00.000Z'
order=event_start_at asc,id asc
```

Replace the timestamp at request time; the literal word `now` is not supported. The example theme uses the existing `date` and `concat` helpers to construct a current UTC filter during server rendering. It displays dates using each event's timezone. Its lists are capped at 20 posts per section as a demonstration; the API's proper pagination is covered separately by tests.

Ordinary public posts retain their existing Content API response shape. Event posts expose structured event fields. Admin responses expose nullable fields to allow capability detection. The prototype also fixes two underlying assumptions exposed by the new fields: sanitising date values in a one-to-one relation, and qualifying default selected post columns when metadata ordering adds a join.

## Review evidence

Verified on 3 October 2026:

- Core type check and Admin build pass. All 10 date-helper checks pass, including inclusive final-day rendering; 18 date-helper/event-validation checks passed in the multi-day milestone.
- Eight event validation tests, the schema integrity check and 19 revision-policy tests pass (28 Core checks).
- Five real Admin/Content API tests pass, now including all-day boundaries and event-only revision snapshots/restoration: creation, read, partial edits, refusal of invalid edits without changing saved dates, copying to draft, chronological ordering before pagination, and past/cancelled filtering.
- All 34 existing Content API post tests pass without snapshot rewrites.
- 59 focused existing model and input serializer checks pass, including a new one-to-one date sanitising regression test.
- 232 focused editor unit checks pass, including local event recovery, history snapshot parsing, event restoration and preservation when restoring a pre-feature version.
- Seven event editor browser checks pass, including UTC conversion, older-backend feature detection, nonexistent/ambiguous times all-day dates across daylight saving calendar-date preservation during timezone changes and an inclusive three-day range across daylight saving. Existing settings-save browser checks passed in the preceding timed-event milestone.
- MySQL migration suite: four tests pass, including initialization, rollback, forward migration and idempotency. A direct isolated SQLite migration exercise also passes repeated upgrade, repeated rollback and re-upgrade while retaining existing post and revision identities; pre-feature revisions have null snapshots. The current database suite runner itself targets MySQL.
- Earlier timed-event milestone full Core unit run: 9,294 passed and four gift-preview image tests timed out under load. Both affected files passed when rerun separately (14 tests). The full monorepo check is tracked in the 4 October milestone below.
- GScan finds no errors in the demonstration theme, with one informational warning about default card assets.
- Real local browser review confirms chronology on the public page, all-day date-only controls, visible event details in history and successful restoration of a changed venue. The seven synthetic event examples use the isolated preview at port 2370.

## Before an upstream-ready change

1. Agree the intended product scope with Ghost. This prototype is evidence of feasibility, not a promise of adoption.
2. Review the all-day timezone/date choices and theme date-helper extension with Ghost. Decide treatment of postponed events without replacement dates.
3. Improve creation and conversion: show controls before a first save through explicit backend capabilities, and let an already published ordinary post collect a complete event payload before conversion. Review the implemented timezone picker, validation feedback, accessibility and translations.
4. Decide whether to ship in the React editor only, or support the legacy editor too.
5. Review revision retention and legacy-editor compatibility. React restoration, local browser recovery and duplication are covered; the legacy editor does not restore event snapshots.
6. Verify import/export and webhook round trips, mixed Admin/Core versions, ordinary-post Admin snapshots, access control and larger datasets. Run the full repository checks and release packaging.
7. Check event boundary behavior with caches and external CDNs: a cached listing must expire promptly when an event finishes without relying on a post edit.
8. Test deployment/update behavior from the latest stable Ghost release. This prototype was based on current `main`, not retrofitted onto stable `v6.67.0`.
9. Review the public-only calendar endpoint, calendar-client interoperability and event structured data if included in the agreed scope. Booking integrations can continue using Ghost's existing links/cards; this prototype does not implement ticketing, recurrence, registration, RSVP or an Eventbrite SDK.

The portable demonstration theme is in `examples/event-posts-theme`. It is independent of the LDS theme and its bundled CSS.

## 4 October 2026 calendar/timezone milestone

- Eight calendar serialization/HTTP tests and eight event editor browser acceptance tests pass, covering site-default persistence, offset changes by season, searchable selection, all-day conversion and DST validation.
- Core type check, Admin production build and targeted ESLint pass.
- Live theme browser download succeeds: DuneCare exports 11 October 09:00–12:00 Sydney as 10 October 22:00–11 October 01:00 UTC, with venue and booking link. Creek Health Field Day exports 3–5 October as date start 3 October and exclusive date finish 6 October.
- Live Admin shows `(UTC+11:00) Australia/Sydney` and filters timezone choices by search. The LDS trial renders Add to calendar beside the event details; full trial GScan passes.
- These checks establish a local proof of concept, not upstream approval or production readiness.

- The full monorepo check passed formatting and lint. Its first test run exposed a stale exact-key assertion in the Admin framework post contract; it now includes all nine event keys, and the framework type check and 16 contract tests pass. Two untouched Comments UI relative-date tests assume UTC and fail in the local Sydney timezone; their full helper file passes under `TZ=UTC` (53 tests). The remaining platform-wide test processes were stopped after these confirmed failures; there is no complete aggregate pass. A clean full run with a UTC test environment is still required before upstream submission.

## 14 October 2026 publication review

This branch is published for evaluation as **Ghost CMS + Events**. It is not
approved for a production upgrade. The upstream base remains the October 3
commit above; latest stable Ghost at this review is v6.70.0, 531 upstream
commits after that base. A stable-version port and upgrade/rollback rehearsal
remain required.

Fresh focused checks pass: 46 Core event/calendar/date/revision/schema tests,
five database-backed event API tests, 89 editor history/recovery/save tests
and eight event settings browser acceptance tests. Theme compatibility also
passes in the separate LDS theme repository.

The full UTC monorepo check passed formatting and lint, but its test phase
failed in three targets: ghost, admin and koenig-lexical. The Core run recorded
9,296 passing tests and 13 five-second timeouts across ten files. These broad
failures remain a release blocker; passing focused tests is not a substitute
for a clean full run. Some successful Nx tasks reused cached results.

Pre-publication Gitleaks 8.30.1 found no secrets in all 56 locally modified/new
Core files. The publication excludes two unrelated translation-formatting
files and includes 54 event/prototype source files. Runtime databases, owner
credentials and content remain outside this source tree. Inherited upstream
history was not rescanned. The existing MIT licence and Ghost attribution
remain intact.
