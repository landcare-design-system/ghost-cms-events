import type { PostAuthorInput, PostTagInput } from '@tryghost/admin-x-framework/api/posts';
import type { EventPostFields } from '@tryghost/admin-x-framework/api/content-types';
import type { LocalRevision, LocalRevisionTag } from '@/editor/local-revisions';

// Core refuses a longer title or custom excerpt, counted in characters.
const MAX_TITLE_LENGTH = 255;
const MAX_EXCERPT_LENGTH = 300;

/** The draft a restore creates from a local copy. */
export interface RestoredPost extends EventPostFields {
  type: 'post' | 'page';
  title: string;
  slug: string;
  lexical: string | null;
  status: 'draft';
  /** Left out when there is nobody to credit, so the server credits the current user. */
  authors?: PostAuthorInput[];
  tags: PostTagInput[];
  custom_excerpt?: string;
  feature_image?: string;
  feature_image_alt?: string;
  feature_image_caption?: string;
}

export interface RestoredPostOptions {
  /** Authors and Contributors may only create posts they are the first author of. */
  soleAuthorId?: string;
}

function tagInput({ id, name, slug }: LocalRevisionTag): PostTagInput[] {
  const known = {
    ...(typeof name === 'string' && name ? { name } : {}),
    ...(typeof slug === 'string' && slug ? { slug } : {}),
  };
  if (typeof id === 'string' && id) {
    return [{ id, ...known }];
  }
  if (known.name) {
    return [{ ...known, name: known.name }];
  }
  return known.slug ? [{ slug: known.slug }] : [];
}

function listOf<T extends object>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return (value as unknown[]).filter(
    (item): item is T => item !== null && typeof item === 'object',
  );
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function clipped(value: string, length: number): string {
  return Array.from(value).slice(0, length).join('');
}

function restoredTitle(title: unknown): string {
  return clipped(
    `(Restored) ${typeof title === 'string' ? title : ''}`.trimEnd(),
    MAX_TITLE_LENGTH,
  );
}

/** A copy becomes a new draft, marked as restored; the post it was taken from is left alone. */
export function restoredPost(
  revision: LocalRevision,
  { soleAuthorId }: RestoredPostOptions = {},
): RestoredPost {
  const authors = soleAuthorId
    ? [{ id: soleAuthorId }]
    : listOf<{ id?: unknown }>(revision.authors).flatMap(({ id }) =>
        typeof id === 'string' && id ? [{ id }] : [],
      );
  const excerpt = text(revision.custom_excerpt);
  const optional = {
    custom_excerpt: excerpt === undefined ? undefined : clipped(excerpt, MAX_EXCERPT_LENGTH),
    feature_image: text(revision.feature_image),
    feature_image_alt: text(revision.feature_image_alt),
    feature_image_caption: text(revision.feature_image_caption),
    ...(revision.type !== 'page' && revision.post_kind === 'event'
      ? {
          event_all_day:
            typeof revision.event_all_day === 'boolean' ? revision.event_all_day : null,
          post_kind: 'event',
          event_start_at: text(revision.event_start_at),
          event_end_at: text(revision.event_end_at),
          event_timezone: text(revision.event_timezone),
          event_status: ['confirmed', 'cancelled', 'postponed'].includes(
            revision.event_status ?? '',
          )
            ? revision.event_status
            : undefined,
          event_location: text(revision.event_location),
          event_booking_url: text(revision.event_booking_url),
          event_booking_label: text(revision.event_booking_label),
        }
      : {}),
  };

  return {
    type: revision.type === 'page' ? 'page' : 'post',
    title: restoredTitle(revision.title),
    slug: text(revision.slug) ?? 'untitled',
    lexical: text(revision.lexical) ?? null,
    status: 'draft',
    ...(authors.length > 0 ? { authors } : {}),
    tags: listOf<LocalRevisionTag>(revision.tags).flatMap(tagInput),
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
  };
}
