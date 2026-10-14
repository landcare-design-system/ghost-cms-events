import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createEventCalendarHandler,
  serializeEventCalendar,
  type CalendarEvent,
} from '../../../../../core/frontend/web/routers/event-calendar';

const event: CalendarEvent = {
  id: '6ac0c9fedc42292f64dd4499',
  uuid: 'stable-event-uuid',
  title: 'Creek Health Field Day',
  visibility: 'public',
  post_kind: 'event',
  event_timezone: 'Australia/Sydney',
  event_start_at: '2026-10-02T14:00:00.000Z',
  event_end_at: '2026-10-05T13:00:00.000Z',
  updated_at: '2026-10-03T09:00:00.000Z',
  event_all_day: true,
  event_status: 'confirmed',
  url: 'https://example.com/creek-health/',
  event_booking_url: 'https://example.com/register',
  event_location: 'Community hall',
};

describe('Event calendar export', () => {
  it('keeps inclusive multi-day dates across daylight saving as an exclusive DATE end', () => {
    const result = serializeEventCalendar(event)!;
    expect(result).toContain('DTSTART;VALUE=DATE:20261003\r\nDTEND;VALUE=DATE:20261006\r\n');
    expect(result).toContain('UID:stable-event-uuid@ghost\r\n');
    expect(result).toContain('LOCATION:Community hall\r\n');
    expect(result.replace(/\r\n /g, '')).toContain('Booking: https://example.com/register');
  });
  it('exports timed events as UTC instants, including across a year boundary', () => {
    const result = serializeEventCalendar({
      ...event,
      event_all_day: false,
      event_start_at: '2026-12-31T12:00:00Z',
      event_end_at: '2027-01-01T03:00:00Z',
    })!;
    expect(result).toContain('DTSTART:20261231T120000Z\r\nDTEND:20270101T030000Z\r\n');
  });
  it('escapes user text and folds UTF-8 lines without splitting characters', () => {
    const title = 'Café 🌱'.repeat(30) + ', hall; test\\more\r\nATTENDEE:evil';
    const result = serializeEventCalendar({ ...event, title })!;
    for (const line of result.split('\r\n')) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }
    expect(result.replace(/\r\n /g, '')).toContain('\\, hall\\; test\\\\more\\nATTENDEE:evil');
    expect(result).not.toContain('\r\nATTENDEE:');
    expect(result).not.toContain('�');
  });
  it('uses cancellation status and rejects invalid calendar dates', () => {
    expect(serializeEventCalendar({ ...event, event_status: 'cancelled' })).toContain(
      'STATUS:CANCELLED',
    );
    expect(serializeEventCalendar({ ...event, event_start_at: null })).toBeNull();
    expect(serializeEventCalendar({ ...event, event_end_at: event.event_start_at })).toBeNull();
    expect(serializeEventCalendar({ ...event, event_timezone: 'Invalid/Zone' })).toBeNull();
    expect(serializeEventCalendar({ ...event, post_kind: null })).toBeNull();
  });
  it('does not place unsafe booking URLs in the calendar', () => {
    expect(
      serializeEventCalendar({ ...event, event_booking_url: 'javascript:alert(1)' }),
    ).not.toContain('javascript:');
  });
  function app(post: CalendarEvent = event, isPrivate = false) {
    const read = vi.fn().mockResolvedValue({ posts: [post] });
    const server = express();
    server.get(
      '/events/:id/calendar.ics',
      createEventCalendarHandler({
        api: { postsPublic: { read } },
        settingsCache: { get: () => isPrivate },
      }),
    );
    return { server, read };
  }
  it('serves an attachment with a stable filename without a Content API key', async () => {
    const { server, read } = app();
    const response = await request(server).get(`/events/${event.id}/calendar.ics`).expect(200);
    expect(response.headers['content-type']).toContain('text/calendar');
    expect(response.headers['content-disposition']).toContain(`event-${event.id}.ics`);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(read).toHaveBeenCalledWith({ id: event.id, context: { member: null } });
  });
  it('returns 404 for nonpublic events and private sites', async () => {
    await request(app({ ...event, visibility: 'paid' }).server)
      .get(`/events/${event.id}/calendar.ics`)
      .expect(404);
    const privateApp = app(event, true);
    await request(privateApp.server).get(`/events/${event.id}/calendar.ics`).expect(404);
    expect(privateApp.read).not.toHaveBeenCalled();
  });
  it('returns 404 for unknown posts and rejects malformed identifiers', async () => {
    const { server, read } = app();
    read.mockRejectedValue({ statusCode: 404 });
    await request(server).get(`/events/${event.id}/calendar.ics`).expect(404);
    read.mockClear();
    await request(server).get('/events/invalid/calendar.ics').expect(404);
    expect(read).not.toHaveBeenCalled();
  });
});
