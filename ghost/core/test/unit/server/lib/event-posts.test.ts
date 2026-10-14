import { validateEventPost } from '../../../../core/server/lib/event-posts';
const details = {
  post_kind: 'event',
  event_start_at: '2026-12-01T22:00:00.000Z',
  event_end_at: '2026-12-02T00:00:00.000Z',
  event_timezone: 'Australia/Sydney',
  event_status: 'confirmed',
};
describe('Event post validation', () => {
  it('allows a future event in a published announcement', () =>
    expect(() => validateEventPost(details, 'post', 'published')).not.toThrow());
  it('allows incomplete drafts but refuses publication and scheduling', () => {
    expect(() => validateEventPost({ post_kind: 'event' }, 'post', 'draft')).not.toThrow();
    for (const status of ['published', 'scheduled']) {
      expect(() => validateEventPost({ post_kind: 'event' }, 'post', status)).toThrow(
        /start, finish and timezone/,
      );
    }
  });
  it('refuses equal or reversed dates', () => {
    for (const end of [details.event_start_at, '2026-11-30T00:00:00Z']) {
      expect(() => validateEventPost({ ...details, event_end_at: end }, 'post', 'draft')).toThrow(
        /later than/,
      );
    }
  });
  it('refuses an unknown timezone and invalid dates', () => {
    expect(() =>
      validateEventPost({ ...details, event_timezone: 'Invalid/Zone' }, 'post', 'draft'),
    ).toThrow(/timezone/);
    expect(() =>
      validateEventPost({ ...details, event_start_at: '2026-02-30T00:00:00Z' }, 'post', 'draft'),
    ).toThrow(/valid dates/);
  });
  it('refuses unsafe booking schemes and page events', () => {
    expect(() =>
      validateEventPost({ ...details, event_booking_url: 'javascript:alert(1)' }, 'post', 'draft'),
    ).toThrow(/booking URL/);
    expect(() => validateEventPost(details, 'page', 'draft')).toThrow(/Only posts/);
  });
  it('leaves ordinary posts untouched and refuses orphan event details', () => {
    expect(() => validateEventPost({}, 'post', 'published')).not.toThrow();
    expect(() => validateEventPost({ event_timezone: 'Etc/UTC' }, 'post', 'draft')).toThrow(
      /require an event/,
    );
  });
  it('requires an explicit offset and a status on published events', () => {
    expect(() =>
      validateEventPost({ ...details, event_start_at: '2026-12-02T09:00:00' }, 'post', 'draft'),
    ).toThrow(/explicit timezone offset/);
    expect(() =>
      validateEventPost({ ...details, event_status: null }, 'post', 'published'),
    ).toThrow(/event status/);
  });
  it('uses calendar days across 23-hour and 25-hour daylight-saving days', () => {
    for (const [start, end] of [
      ['2026-10-03T14:00:00Z', '2026-10-04T13:00:00Z'],
      ['2027-04-03T13:00:00Z', '2027-04-04T14:00:00Z'],
    ]) {
      expect(() =>
        validateEventPost(
          { ...details, event_all_day: true, event_start_at: start, event_end_at: end },
          'post',
          'published',
        ),
      ).not.toThrow();
    }
    expect(() =>
      validateEventPost({ ...details, event_all_day: true }, 'post', 'published'),
    ).toThrow(/local midnight/);
    expect(() => validateEventPost({ ...details, event_all_day: 'yes' }, 'post', 'draft')).toThrow(
      /true or false/,
    );
  });
});
