import { MARKDOWN_EMPTY_VALUE } from 'src/config';
import type { ModelItem } from 'src/types';

/** Max length for Skrót (badge body + form). */
export const DESCRIPTION_SUMMARY_MAX = 500;

export const isMarkdownDescriptionEmpty = (
  value?: string | null
): boolean => {
  const text = value?.trim();
  return !text || text === MARKDOWN_EMPTY_VALUE;
};

export const clampDescriptionSummary = (value: string): string => {
  return value.slice(0, DESCRIPTION_SUMMARY_MAX);
};

export const getDescriptionTitle = (
  item: Pick<ModelItem, 'descriptionTitle'>
): string => {
  return item.descriptionTitle?.trim() ?? '';
};

export const getDescriptionSummary = (
  item: Pick<ModelItem, 'descriptionSummary'>
): string => {
  return clampDescriptionSummary(item.descriptionSummary?.trim() ?? '');
};

/** Plakietka: title and/or short text. */
export const hasNodeDescriptionBadge = (
  item: Pick<ModelItem, 'descriptionTitle' | 'descriptionSummary'>
): boolean => {
  return Boolean(getDescriptionTitle(item) || getDescriptionSummary(item));
};

/** Full notes editor content. */
export const hasNodeDescriptionNotes = (
  item: Pick<ModelItem, 'description'>
): boolean => {
  return !isMarkdownDescriptionEmpty(item.description);
};

/** Any of title / short / notes — e.g. IPAM (i) affordance. */
export const hasNodeDescription = (
  item: Pick<
    ModelItem,
    'description' | 'descriptionTitle' | 'descriptionSummary'
  >
): boolean => {
  return hasNodeDescriptionBadge(item) || hasNodeDescriptionNotes(item);
};
