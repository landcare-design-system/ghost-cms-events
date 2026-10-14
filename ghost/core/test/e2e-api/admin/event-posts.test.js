const assert = require('node:assert/strict');
const { agentProvider, fixtureManager } = require('../../utils/e2e-framework');
let admin;
let content;
const fields = {
  post_kind: 'event',
  event_start_at: '2040-12-01T22:00:00.000Z',
  event_end_at: '2040-12-02T00:00:00.000Z',
  event_timezone: 'Australia/Sydney',
  event_status: 'confirmed',
  event_location: 'Community hall',
  event_booking_url: 'https://example.org/book',
  event_booking_label: 'Reserve a place',
};
describe('Event posts through Admin and Content APIs', function () {
  beforeAll(async function () {
    content = await agentProvider.getContentAPIAgent();
    admin = await agentProvider.getAdminAPIAgent();
    await fixtureManager.init('api_keys');
    await admin.loginAsOwner();
    await content.authenticate();
  });
  async function create(overrides = {}) {
    const { body } = await admin
      .post('posts/?source=html')
      .body({ posts: [{ title: 'Event prototype', status: 'published', ...fields, ...overrides }] })
      .expectStatus(201);
    assert.equal(body.posts[0].post_kind, 'event', 'Creation must persist the event identity');
    return body.posts[0];
  }
  it('persists and exposes typed event metadata and keeps its URL when dates change', async function () {
    const post = await create();
    const { body } = await content.get(`posts/${post.id}/`).expectStatus(200);
    for (const key of Object.keys(fields)) {
      assert.equal(body.posts[0][key], fields[key]);
    }
    const { body: updated } = await admin
      .put(`posts/${post.id}/`)
      .body({ posts: [{ updated_at: post.updated_at, event_location: 'Online' }] })
      .expectStatus(200);
    assert.equal(updated.posts[0].event_start_at, fields.event_start_at);
    assert.equal(updated.posts[0].event_location, 'Online');
    assert.equal(updated.posts[0].url, post.url);
    await admin
      .put(`posts/${post.id}/`)
      .body({
        posts: [{ updated_at: updated.posts[0].updated_at, event_end_at: '2039-01-01T00:00:00Z' }],
      })
      .expectStatus(422);
    const { body: unchanged } = await admin.get(`posts/${post.id}/`).expectStatus(200);
    assert.equal(unchanged.posts[0].event_end_at, fields.event_end_at);
  });
  it('orders before pagination and separates past and cancelled events', async function () {
    const later = await create({
      title: 'Later event',
      published_at: '2020-01-01T00:00:00.000Z',
      event_start_at: '2042-01-01T00:00:00.000Z',
      event_end_at: '2042-01-02T00:00:00.000Z',
    });
    const earlier = await create({
      title: 'Earlier event',
      published_at: '2025-01-01T00:00:00.000Z',
      event_start_at: '2041-01-01T00:00:00.000Z',
      event_end_at: '2041-01-02T00:00:00.000Z',
    });
    const past = await create({
      title: 'Past event',
      event_start_at: '2000-01-01T00:00:00.000Z',
      event_end_at: '2000-01-02T00:00:00.000Z',
    });
    await create({ title: 'Cancelled event', event_status: 'cancelled' });
    const now = new Date().toISOString();
    const filter = encodeURIComponent(
      `post_kind:event+event_status:confirmed+event_start_at:>=2041-01-01+event_end_at:>'${now}'`,
    );
    const query = `posts/?filter=${filter}&order=event_start_at%20asc,id%20asc&limit=1`;
    const { body: first } = await content.get(query).expectStatus(200);
    const { body: second } = await content.get(query + '&page=2').expectStatus(200);
    assert.equal(first.posts[0].id, earlier.id);
    assert.equal(second.posts[0].id, later.id);
    assert.equal(first.meta.pagination.total, 2);
    const { body: archive } = await content
      .get(`posts/?filter=${encodeURIComponent(`post_kind:event+event_end_at:<='${now}'`)}`)
      .expectStatus(200);
    assert.ok(archive.posts.some((post) => post.id === past.id));
  });
  it('copies event details into a draft and requires dates before publication', async function () {
    const post = await create();
    const { body } = await admin.post(`posts/${post.id}/copy`).expectStatus(201);
    assert.equal(body.posts[0].status, 'draft');
    for (const key of Object.keys(fields)) {
      assert.equal(body.posts[0][key], fields[key]);
    }
    await admin
      .post('posts/')
      .body({ posts: [{ title: 'Incomplete event', post_kind: 'event', status: 'published' }] })
      .expectStatus(422);
  });
  it('persists all-day calendar boundaries and snapshots event-only revisions', async function () {
    const post = await create({
      event_all_day: true,
      event_start_at: '2026-10-03T14:00:00.000Z',
      event_end_at: '2026-10-04T13:00:00.000Z',
      html: '<p>All-day prototype</p>',
    });
    assert.equal(post.event_all_day, true);
    const { body: initial } = await admin
      .get(`posts/${post.id}/?include=post_revisions`)
      .expectStatus(200);
    const before = initial.posts[0].post_revisions;
    assert.ok(before.length);
    const original = JSON.parse(before[before.length - 1].event_details);
    assert.equal(original.event_all_day, true);
    assert.equal(original.event_end_at, '2026-10-04T13:00:00.000Z');
    const { body: edited } = await admin
      .put(`posts/${post.id}/?save_revision=true`)
      .body({
        posts: [
          {
            updated_at: post.updated_at,
            event_location: 'Changed venue',
            event_booking_label: 'Book now',
          },
        ],
      })
      .expectStatus(200);
    const { body: history } = await admin
      .get(`posts/${post.id}/?include=post_revisions`)
      .expectStatus(200);
    const revisions = history.posts[0].post_revisions;
    assert.equal(revisions.length, before.length + 1);
    assert.ok(
      revisions.some(
        (revision) => JSON.parse(revision.event_details).event_location === 'Changed venue',
      ),
    );
    const { body: restored } = await admin
      .put(`posts/${post.id}/?save_revision=true`)
      .body({ posts: [{ updated_at: edited.posts[0].updated_at, ...original }] })
      .expectStatus(200);
    assert.equal(restored.posts[0].event_location, fields.event_location);
    assert.equal(restored.posts[0].event_booking_label, fields.event_booking_label);
    assert.equal(restored.posts[0].event_all_day, true);
    assert.equal(restored.posts[0].url, post.url);
  });
  it('keeps a multi-day event underway throughout its last day and archives it at the finish boundary', async function () {
    const post = await create({
      event_all_day: true,
      event_start_at: '2026-10-02T14:00:00.000Z',
      event_end_at: '2026-10-05T13:00:00.000Z',
    });
    assert.equal(post.event_all_day, true);
    assert.equal(post.event_end_at, '2026-10-05T13:00:00.000Z');
    const at = async (operator, instant) =>
      (
        await content
          .get(
            `posts/?filter=${encodeURIComponent(`id:${post.id}+post_kind:event+event_status:confirmed+event_end_at:${operator}'${instant}'`)}`,
          )
          .expectStatus(200)
      ).body.posts;
    assert.equal((await at('>', '2026-10-05T12:59:59.999Z')).length, 1);
    assert.equal((await at('>', '2026-10-05T13:00:00.000Z')).length, 0);
    assert.equal((await at('<=', '2026-10-05T13:00:00.000Z')).length, 1);
  });
});
