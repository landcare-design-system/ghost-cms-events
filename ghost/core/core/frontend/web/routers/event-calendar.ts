import { DateTime } from 'luxon';
import type { RequestHandler } from 'express';

export interface CalendarEvent {
  id: string;
  uuid?: string;
  title: string;
  url?: string;
  excerpt?: string;
  updated_at?: string;
  published_at?: string;
  visibility?: string;
  post_kind?: string | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
  event_timezone?: string | null;
  event_all_day?: boolean | null;
  event_status?: string | null;
  event_location?: string | null;
  event_booking_url?: string | null;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

// RFC 5545 folds at 75 octets, without splitting a UTF-8 character.
function fold(line: string): string {
  const parts: string[] = [];
  let part = '';
  for (const character of line) {
    if (Buffer.byteLength(part + character, 'utf8') > 75) {
      parts.push(part);
      part = ' ';
    }
    part += character;
  }
  parts.push(part);
  return parts.join('\r\n');
}

function webUrl(value?: string | null): string | null {
  if (!value || /[\r\n]/.test(value)) {
    return null;
  }
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function serializeEventCalendar(post: CalendarEvent): string | null {
  if (post.post_kind !== 'event' || !post.event_start_at || !post.event_end_at) {
    return null;
  }
  const start = DateTime.fromISO(post.event_start_at, { zone: 'UTC' });
  const end = DateTime.fromISO(post.event_end_at, { zone: 'UTC' });
  const stamp = DateTime.fromISO(post.updated_at || post.published_at || '', { zone: 'UTC' });
  if (!start.isValid || !end.isValid || !stamp.isValid || end <= start) {
    return null;
  }
  const format = "yyyyMMdd'T'HHmmss'Z'";
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ghost//Event posts//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeText(post.uuid || post.id)}@ghost`,
    `DTSTAMP:${stamp.toUTC().toFormat(format)}`,
    `LAST-MODIFIED:${stamp.toUTC().toFormat(format)}`,
    `SUMMARY:${escapeText(post.title)}`,
  ];
  if (post.event_all_day) {
    const localStart = start.setZone(post.event_timezone || 'Etc/UTC');
    const localEnd = end.setZone(post.event_timezone || 'Etc/UTC');
    if (
      !localStart.isValid ||
      !localEnd.isValid ||
      localEnd.toISODate()! <= localStart.toISODate()!
    ) {
      return null;
    }
    // All-day finish is the exclusive next local midnight already stored by the editor.
    lines.push(
      `DTSTART;VALUE=DATE:${localStart.toFormat('yyyyMMdd')}`,
      `DTEND;VALUE=DATE:${localEnd.toFormat('yyyyMMdd')}`,
    );
  } else {
    lines.push(
      `DTSTART:${start.toUTC().toFormat(format)}`,
      `DTEND:${end.toUTC().toFormat(format)}`,
    );
  }
  if (post.event_location) {
    lines.push(`LOCATION:${escapeText(post.event_location)}`);
  }
  const pageUrl = webUrl(post.url);
  const bookingUrl = webUrl(post.event_booking_url);
  const description = [
    post.excerpt,
    post.event_status === 'postponed'
      ? 'This event has been postponed. Check the event page for updates.'
      : null,
    pageUrl,
    bookingUrl ? `Booking: ${bookingUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
  if (description) {
    lines.push(`DESCRIPTION:${escapeText(description)}`);
  }
  if (pageUrl) {
    lines.push(`URL:${pageUrl}`);
  }
  lines.push(
    `STATUS:${post.event_status === 'cancelled' ? 'CANCELLED' : post.event_status === 'postponed' ? 'TENTATIVE' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function createEventCalendarHandler({
  api,
  settingsCache,
}: {
  api: {
    postsPublic: {
      read: (options: Record<string, unknown>) => Promise<{ posts?: CalendarEvent[] }>;
    };
  };
  settingsCache: { get: (key: string) => unknown };
}): RequestHandler {
  return async (req, res, next) => {
    // This first version exports only public posts on public sites.
    if (settingsCache.get('is_private') || !/^[a-f0-9]{24}$/.test(String(req.params.id))) {
      res.status(404).end();
      return;
    }
    try {
      const result = await api.postsPublic.read({ id: req.params.id, context: { member: null } });
      const post = result.posts?.[0];
      const calendar = post?.visibility === 'public' ? serializeEventCalendar(post) : null;
      if (!calendar) {
        res.status(404).end();
        return;
      }
      res.set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="event-${post!.id}.ics"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.send(calendar);
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        res.status(404).end();
        return;
      }
      next(error);
    }
  };
}
