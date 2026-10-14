import { useId, useState } from 'react';
import { DateTime, IANAZone } from 'luxon';
import {
  FieldError,
  Input,
  Combobox,
  ComboboxContent,
  ComboboxTrigger,
  ComboboxValue,
  MultiSelectCombobox,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tryghost/shade/components';
import { Inline, Stack, Text } from '@tryghost/shade/primitives';
import {
  settingsEventToggle,
  settingsEventAllDay,
  settingsEventStart,
  settingsEventFinish,
  settingsEventTimezone,
  settingsEventLocation,
  settingsEventBooking,
} from '@tryghost/test-data/selectors/editor';
import { timezoneDataWithGMTOffset } from '@tryghost/timezone-data';
import { useSiteTimezone } from '@/editor/use-editor-settings';
import type { EditorSettingsPort } from './editor-settings-port';
import { SettingsSection } from './settings-section';

function EventTime({
  label,
  testId,
  value,
  zone,
  onCommit,
  allDay = false,
  isEnd = false,
}: {
  allDay?: boolean;
  isEnd?: boolean;
  label: string;
  testId: string;
  value: string | null | undefined;
  zone: string;
  onCommit: (value: string | null) => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const format = allDay ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm";
  const local = value ? DateTime.fromISO(value, { zone }) : null;
  const formatted = local
    ? (allDay && isEnd ? local.minus({ days: 1 }) : local).toFormat(format)
    : '';
  return (
    <Stack gap="xs">
      <Label htmlFor={id}>{label}</Label>
      <Input
        key={formatted + zone + allDay}
        aria-describedby={error ? id + '-error' : undefined}
        aria-invalid={!!error}
        data-testid={testId}
        defaultValue={formatted}
        id={id}
        type={allDay ? 'date' : 'datetime-local'}
        onBlur={(event) => {
          const text = event.target.value;
          if (!text) {
            setError(null);
            onCommit(null);
            return;
          }
          const date = DateTime.fromISO(text, { zone });
          if (!date.isValid || date.toFormat(format) !== text) {
            setError('This time does not exist in the event timezone.');
            return;
          }
          if (date.getPossibleOffsets().length > 1) {
            setError('This time occurs twice when clocks change. Choose an unambiguous time.');
            return;
          }
          setError(null);
          onCommit(
            (allDay && isEnd ? date.plus({ days: 1 }).startOf('day') : date).toUTC().toISO(),
          );
        }}
      />
      {error ? <FieldError id={id + '-error'}>{error}</FieldError> : null}
    </Stack>
  );
}

export function EventDetailsSection({ session }: { session: EditorSettingsPort }) {
  const id = useId();
  const fields = session.settings;
  const siteTimezone = useSiteTimezone();
  const zone = fields.event_timezone || siteTimezone;
  const enabled = fields.post_kind === 'event';
  const [zoneOpen, setZoneOpen] = useState(false);
  const reference = fields.event_start_at
    ? DateTime.fromISO(fields.event_start_at)
    : DateTime.now();
  const zoneNames = new Set(timezoneDataWithGMTOffset().map((option) => option.name));
  zoneNames.add(zone);
  zoneNames.add(siteTimezone);
  const zoneOptions = [...zoneNames]
    .filter((name) => IANAZone.isValidZone(name))
    .map((name) => {
      const local = reference.setZone(name);
      return { value: name, label: `(UTC${local.toFormat('ZZ')}) ${name.replaceAll('_', ' ')}` };
    })
    .sort(
      (a, b) =>
        reference.setZone(a.value).offset - reference.setZone(b.value).offset ||
        a.value.localeCompare(b.value),
    );
  const changeZone = (nextZone: string) => {
    const calendarBoundary = (value: string | null | undefined) => {
      const day = value ? DateTime.fromISO(value, { zone }).toISODate() : null;
      return day ? DateTime.fromISO(day, { zone: nextZone }).startOf('day').toUTC().toISO() : null;
    };
    session.editSettings({
      event_timezone: nextZone,
      ...(fields.event_all_day
        ? {
            event_start_at: calendarBoundary(fields.event_start_at),
            event_end_at: calendarBoundary(fields.event_end_at),
          }
        : {}),
    });
  };
  return (
    <SettingsSection>
      <Stack gap="md">
        <Inline align="center" justify="between">
          <Label htmlFor={id}>Event post</Label>
          <Switch
            checked={enabled}
            data-testid={settingsEventToggle}
            id={id}
            onCheckedChange={(checked) =>
              session.editSettings(
                checked
                  ? {
                      post_kind: 'event',
                      event_all_day: false,
                      event_timezone: zone,
                      event_status: 'confirmed',
                    }
                  : {
                      post_kind: null,
                      event_all_day: null,
                      event_start_at: null,
                      event_end_at: null,
                      event_timezone: null,
                      event_status: null,
                      event_location: null,
                      event_booking_url: null,
                      event_booking_label: null,
                    },
              )
            }
          />
        </Inline>
        {enabled ? (
          <>
            <Text size="sm" tone="secondary">
              Event dates are separate from publication. Times use the event timezone.
            </Text>
            <Label htmlFor={id + '-zone'}>Event timezone</Label>
            <Combobox open={zoneOpen} onOpenChange={setZoneOpen}>
              <ComboboxTrigger
                aria-label="Event timezone"
                data-testid={settingsEventTimezone}
                id={id + '-zone'}
              >
                <ComboboxValue>
                  {zoneOptions.find((option) => option.value === zone)?.label}
                </ComboboxValue>
              </ComboboxTrigger>
              <ComboboxContent>
                <MultiSelectCombobox
                  i18n={{ searchPlaceholder: 'Search timezones...' }}
                  isMultiSelect={false}
                  options={zoneOptions}
                  values={[zone]}
                  autoCloseOnSelect
                  onChange={(values) => {
                    if (values[0]) {
                      changeZone(values[0]);
                    }
                  }}
                  onClose={() => setZoneOpen(false)}
                />
              </ComboboxContent>
            </Combobox>
            <Text size="sm" tone="secondary">
              New events default to the site timezone. Offsets shown apply to the event start date.
            </Text>
            <Inline align="center" justify="between">
              <Label htmlFor={id + '-all-day'}>All day</Label>
              <Switch
                checked={fields.event_all_day === true}
                data-testid={settingsEventAllDay}
                id={id + '-all-day'}
                onCheckedChange={(checked) => {
                  const start = fields.event_start_at
                    ? DateTime.fromISO(fields.event_start_at, { zone })
                    : null;
                  const end = fields.event_end_at
                    ? DateTime.fromISO(fields.event_end_at, { zone })
                    : null;
                  session.editSettings({
                    event_all_day: checked,
                    ...(checked
                      ? {
                          event_start_at: start?.startOf('day').toUTC().toISO() ?? null,
                          event_end_at: end
                            ? (end.equals(end.startOf('day'))
                                ? end
                                : end.startOf('day').plus({ days: 1 })
                              )
                                .toUTC()
                                .toISO()
                            : null,
                        }
                      : {}),
                  });
                }}
              />
            </Inline>
            <EventTime
              allDay={fields.event_all_day === true}
              label="Event start"
              testId={settingsEventStart}
              value={fields.event_start_at}
              zone={zone}
              onCommit={(start) => session.editSettings({ event_start_at: start })}
            />
            <EventTime
              allDay={fields.event_all_day === true}
              label={fields.event_all_day ? 'Last day' : 'Event finish'}
              testId={settingsEventFinish}
              value={fields.event_end_at}
              zone={zone}
              isEnd
              onCommit={(finish) => session.editSettings({ event_end_at: finish })}
            />
            {fields.event_all_day ? (
              <Text size="sm" tone="secondary">
                For an event spanning several days, choose its final day above. All selected days
                are included.
              </Text>
            ) : null}
            <Label htmlFor={id + '-location'}>Where</Label>
            <Input
              data-testid={settingsEventLocation}
              id={id + '-location'}
              maxLength={500}
              value={fields.event_location ?? ''}
              onBlur={session.commitSettings}
              onChange={(event) =>
                session.stageSettings({ event_location: event.target.value || null })
              }
            />
            <Label htmlFor={id + '-booking'}>Booking URL</Label>
            <Input
              data-testid={settingsEventBooking}
              id={id + '-booking'}
              maxLength={2000}
              type="url"
              value={fields.event_booking_url ?? ''}
              onBlur={session.commitSettings}
              onChange={(event) =>
                session.stageSettings({ event_booking_url: event.target.value || null })
              }
            />
            <Label htmlFor={id + '-booking-label'}>Booking button label</Label>
            <Input
              id={id + '-booking-label'}
              maxLength={100}
              placeholder="Book or register"
              value={fields.event_booking_label ?? ''}
              onBlur={session.commitSettings}
              onChange={(event) =>
                session.stageSettings({
                  event_booking_label: event.target.value.trim() ? event.target.value : null,
                })
              }
            />
            <Label htmlFor={id + '-status'}>Event status</Label>
            <Select
              value={fields.event_status ?? 'confirmed'}
              onValueChange={(status) =>
                session.editSettings({
                  event_status: status as 'confirmed' | 'cancelled' | 'postponed',
                })
              }
            >
              <SelectTrigger id={id + '-status'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="postponed">Postponed</SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : null}
      </Stack>
    </SettingsSection>
  );
}
