/**
 * Compatibility stub — layoutEngine removed with restore to 75f221e.
 */
import { Coords, ViewItem } from 'src/types';

export const arrangeNodesWithinSelection = (_args: {
  selectedItems: ViewItem[];
  allItems?: ViewItem[];
  modelItems?: { id: string; icon?: string }[];
  connectors?: unknown[];
}): Record<string, Coords> => {
  return {};
};
