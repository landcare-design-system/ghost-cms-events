import { ValidationError } from '@tryghost/errors';
import { DateTime, IANAZone } from 'luxon';

export const EVENT_FIELDS = [
  'post_kind',
  'event_all_day',
  'event_start_at',
  'event_end_at',
  'event_timezone',
  'event_status',
  'event_location',
  'event_booking_url',
  'event_booking_label',
] as const;

export type EventDetails = Partial<Record<(typeof EVENT_FIELDS)[number], unknown>>;

/** Validate the effective record, including unchanged metadata on a partial edit. */
export function validateEventPost(details: EventDetails, type: string, status: string): void {
  const fail = (message: string): never => {
    throw new ValidationError({ message });
  };
  if (details.post_kind !== 'event') {
    if (EVENT_FIELDS.slice(1).some((key) => details[key] !== null && details[key] !== undefined)) {
      fail('Event details require an event post.');
    }
    return;
  }
  if (
    details.event_all_day !== null &&
    details.event_all_day !== undefined &&
    typeof details.event_all_day !== 'boolean'
  ) {
    fail('All day must be true or false.');
  }
  if (type !== 'post') {
    fail('Only posts can be events.');
  }
  if (
    details.event_status !== null &&
    details.event_status !== undefined &&
    !['confirmed', 'cancelled', 'postponed'].includes(String(details.event_status))
  ) {
    fail('Choose a valid event status.');
  }
  if (
    details.event_timezone &&
    (typeof details.event_timezone !== 'string' || !IANAZone.isValidZone(details.event_timezone))
  ) {
    fail('Choose a valid IANA event timezone.');
  }
  const instants = ['event_start_at', 'event_end_at'].map((key) => {
    const value = details[key as keyof EventDetails];
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
      fail('Event dates must include an explicit timezone offset.');
    }
    const date =
      value instanceof Date
        ? DateTime.fromJSDate(value, { zone: 'utc' })
        : typeof value === 'string'
          ? DateTime.fromISO(value, { zone: 'utc', setZone: true })
          : null;
    if (!date?.isValid) {
      return fail('Event dates must be valid dates and times.');
    }
    if (details.event_all_day === true) {
      if (!details.event_timezone) {
        fail('Choose a timezone for an all-day event.');
      }
      const local = date.setZone(String(details.event_timezone));
      if (local.hour !== 0 || local.minute !== 0 || local.second !== 0 || local.millisecond !== 0) {
        fail('All-day event boundaries must be local midnight in the event timezone.');
      }
    }
    return date.toMillis();
  });
  if (instants[0] !== null && instants[1] !== null && instants[1] <= instants[0]) {
    fail('The event finish must be later than its start.');
  }
  if (status !== 'draft' && (!details.event_timezone || instants.some((value) => value === null))) {
    fail('Add an event start, finish and timezone before publishing or scheduling.');
  }
  if (status !== 'draft' && !details.event_status) {
    fail('Choose an event status before publishing or scheduling.');
  }
  if (
    details.event_booking_label !== null &&
    details.event_booking_label !== undefined &&
    (typeof details.event_booking_label !== 'string' || details.event_booking_label.length > 100)
  ) {
    fail('Booking button label must be text of at most 100 characters.');
  }
  if (details.event_booking_url) {
    try {
      const url = new URL(String(details.event_booking_url));
      if (!['http:', 'https:'].includes(url.protocol)) {
        fail('The booking URL must use http or https.');
      }
    } catch {
      fail('Enter a valid booking URL using http or https.');
    }
  }
}
