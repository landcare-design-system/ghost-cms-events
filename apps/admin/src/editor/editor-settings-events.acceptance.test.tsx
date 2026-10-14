import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import {
  fakeEditorChrome,
  fakeEditorPost,
  renderAdminApp,
  settingsResponse,
  settleTransitions,
  withoutAutosave,
} from '@test-utils/acceptance';
import {
  settingsEventToggle,
  settingsEventAllDay,
  settingsEventFinish,
  settingsEventStart,
  settingsEventTimezone,
  settingsEventLocation,
} from '@tryghost/test-data/selectors/editor';
import { editorScreen } from '@/editor/editor.screen';

const FLAGS = withoutAutosave({ labs: { editorReact: true } });

async function openSettings() {
  await editorScreen.settingsToggle().click();
  await expect.element(editorScreen.settingsSidebar()).toBeVisible();
  await settleTransitions();
}

describe('Native event settings', () => {
  it('defaults a new event to the site timezone and shows the event-date offset', async () => {
    fakeEditorChrome();
    const saves = fakeEditorPost({ post_kind: null });
    await renderAdminApp('/editor/post/abc123', {
      ...FLAGS,
      boot: {
        browseSettings: {
          response: settingsResponse({ settings: { timezone: 'Australia/Sydney' } }),
        },
      },
    });
    await openSettings();
    await page.getByTestId(settingsEventToggle).click();
    await expect(saves).toHaveSavedFields({ event_timezone: 'Australia/Sydney' });
    await page.getByTestId(settingsEventStart).fill('2040-07-02T09:00');
    await page.getByTestId(settingsEventLocation).click();
    await expect.element(page.getByTestId(settingsEventTimezone)).toHaveTextContent('UTC+10:00');
    await page.getByTestId(settingsEventStart).fill('2040-12-02T09:00');
    await page.getByTestId(settingsEventLocation).click();
    await expect.element(page.getByTestId(settingsEventTimezone)).toHaveTextContent('UTC+11:00');
    await page.getByTestId(settingsEventTimezone).click();
    await page.getByPlaceholder('Search timezones...').fill('Brisbane');
    await page.getByRole('option').filter({ hasText: 'Australia/Brisbane' }).click();
    await expect(saves).toHaveSavedFields({ event_timezone: 'Australia/Brisbane' });
  });
  it('refuses an ambiguous local time when clocks go back', async () => {
    fakeEditorChrome();
    const saves = fakeEditorPost({
      post_kind: 'event',
      event_timezone: 'Australia/Sydney',
      event_status: 'confirmed',
    });
    await renderAdminApp('/editor/post/abc123', FLAGS);
    await openSettings();
    await page.getByTestId(settingsEventStart).fill('2027-04-04T02:30');
    await page.getByTestId(settingsEventLocation).click();
    await expect
      .element(
        page.getByText('This time occurs twice when clocks change. Choose an unambiguous time.'),
      )
      .toBeVisible();
    expect(saves.requests).toHaveLength(0);
  });
  it('hides the feature when an older backend omits event fields', async () => {
    fakeEditorChrome();
    fakeEditorPost();
    await renderAdminApp('/editor/post/abc123', FLAGS);
    await openSettings();
    await expect.element(page.getByTestId(settingsEventToggle)).not.toBeInTheDocument();
  });

  it('saves an event and converts the local event time to UTC', async () => {
    fakeEditorChrome();
    const saves = fakeEditorPost({ post_kind: null });
    await renderAdminApp('/editor/post/abc123', FLAGS);
    await openSettings();
    await page.getByTestId(settingsEventToggle).click();
    await expect(saves).toHaveSavedFields({ post_kind: 'event', event_status: 'confirmed' });
    await page.getByTestId(settingsEventTimezone).click();
    await page.getByRole('option').filter({ hasText: 'Australia/Sydney' }).click();
    await expect(saves).toHaveSavedFields({ event_timezone: 'Australia/Sydney' });
    await page.getByTestId(settingsEventStart).fill('2040-12-02T09:00');
    await page.getByTestId(settingsEventLocation).click();
    await expect(saves).toHaveSavedFields({ event_start_at: '2040-12-01T22:00:00.000Z' });
    await page.getByTestId(settingsEventLocation).fill('Community hall');
    await page.getByTestId(settingsEventTimezone).click();
    await expect(saves).toHaveSavedFields({ event_location: 'Community hall' });
    await page.getByTestId(settingsEventToggle).click();
    await expect(saves).toHaveSavedFields({
      post_kind: null,
      event_start_at: null,
      event_timezone: null,
      event_location: null,
    });
  });

  it('refuses a nonexistent local time at the daylight saving transition', async () => {
    fakeEditorChrome();
    const saves = fakeEditorPost({
      post_kind: 'event',
      event_timezone: 'Australia/Sydney',
      event_status: 'confirmed',
    });
    await renderAdminApp('/editor/post/abc123', FLAGS);
    await openSettings();
    await page.getByTestId(settingsEventStart).fill('2026-10-04T02:30');
    await page.getByTestId(settingsEventLocation).click();
    await expect
      .element(page.getByText('This time does not exist in the event timezone.'))
      .toBeVisible();
    expect(saves.requests).toHaveLength(0);
  });
  it('stores the last day as the next local midnight across daylight saving', async () => {
    fakeEditorChrome();
    const saves = fakeEditorPost({
      post_kind: 'event',
      event_all_day: false,
      event_timezone: 'Australia/Sydney',
      event_status: 'confirmed',
    });
    await renderAdminApp('/editor/post/abc123', FLAGS);
    await openSettings();
    await page.getByTestId(settingsEventAllDay).click();
    await expect(saves).toHaveSavedFields({ event_all_day: true });
    await page.getByTestId(settingsEventStart).fill('2026-10-04');
    await page.getByTestId(settingsEventLocation).click();
    await expect(saves).toHaveSavedFields({ event_start_at: '2026-10-03T14:00:00.000Z' });
    await page.getByTestId(settingsEventFinish).fill('2026-10-04');
    await page.getByTestId(settingsEventLocation).click();
    await expect(saves).toHaveSavedFields({ event_end_at: '2026-10-04T13:00:00.000Z' });
    await expect.element(page.getByTestId(settingsEventFinish)).toHaveValue('2026-10-04');
  });
  it('keeps all-day calendar dates when changing timezone', async () => {
    fakeEditorChrome();
    const saves = fakeEditorPost({
      post_kind: 'event',
      event_all_day: true,
      event_timezone: 'Australia/Sydney',
      event_status: 'confirmed',
      event_start_at: '2026-10-03T14:00:00.000Z',
      event_end_at: '2026-10-04T13:00:00.000Z',
    });
    await renderAdminApp('/editor/post/abc123', FLAGS);
    await openSettings();
    await page.getByTestId(settingsEventTimezone).click();
    await page.getByRole('option').filter({ hasText: 'Etc/UTC' }).click();
    await expect(saves).toHaveSavedFields({
      event_timezone: 'Etc/UTC',
      event_start_at: '2026-10-04T00:00:00.000Z',
      event_end_at: '2026-10-05T00:00:00.000Z',
    });
    await expect.element(page.getByTestId(settingsEventFinish)).toHaveValue('2026-10-04');
  });
  it('saves and displays an inclusive multi-day range across daylight saving', async () => {
    fakeEditorChrome();
    const saves = fakeEditorPost({
      post_kind: 'event',
      event_all_day: true,
      event_timezone: 'Australia/Sydney',
      event_status: 'confirmed',
    });
    await renderAdminApp('/editor/post/abc123', FLAGS);
    await openSettings();
    await page.getByTestId(settingsEventStart).fill('2026-10-03');
    await page.getByTestId(settingsEventLocation).click();
    await expect(saves).toHaveSavedFields({ event_start_at: '2026-10-02T14:00:00.000Z' });
    await page.getByTestId(settingsEventFinish).fill('2026-10-05');
    await page.getByTestId(settingsEventLocation).click();
    await expect(saves).toHaveSavedFields({ event_end_at: '2026-10-05T13:00:00.000Z' });
    await expect.element(page.getByTestId(settingsEventStart)).toHaveValue('2026-10-03');
    await expect.element(page.getByTestId(settingsEventFinish)).toHaveValue('2026-10-05');
  });
});
