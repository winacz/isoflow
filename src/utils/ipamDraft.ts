import type { ModelItem } from 'src/types';

/** Max committed IPAM batches kept for rollback. */
export const IPAM_CHANGELOG_LIMIT = 10;

/** IPAM-editable fields snapshotted for draft / rollback. */
export type IpamFieldSnapshot = {
  ip?: string;
  dhcp?: boolean;
  poweredByPoe?: boolean;
  ports?: ModelItem['ports'];
  svis?: ModelItem['svis'];
};

export type IpamChangelogEntry = {
  id: string;
  at: number;
  summary: string;
  lines: string[];
  /** Committed model fields before this batch (newest-first undo). */
  before: Record<string, IpamFieldSnapshot>;
  /** Project VLAN names before this batch (when names changed). */
  vlanNamesBefore?: Record<string, string>;
};

const cloneJson = <T,>(value: T): T => {
  return JSON.parse(JSON.stringify(value)) as T;
};

export const snapshotIpamFields = (item: ModelItem): IpamFieldSnapshot => {
  return {
    ip: item.ip,
    dhcp: item.dhcp,
    poweredByPoe: item.poweredByPoe,
    ports: item.ports ? cloneJson(item.ports) : undefined,
    svis: item.svis ? cloneJson(item.svis) : undefined
  };
};

export const mergeIpamDraft = (
  item: ModelItem,
  draft?: IpamFieldSnapshot
): ModelItem => {
  if (!draft) return item;
  return {
    ...item,
    ip: draft.ip,
    dhcp: draft.dhcp,
    poweredByPoe: draft.poweredByPoe,
    ports: draft.ports,
    svis: draft.svis
  };
};

export const snapshotToModelPatch = (
  snapshot: IpamFieldSnapshot
): Partial<ModelItem> => {
  return {
    ip: snapshot.ip,
    dhcp: snapshot.dhcp,
    poweredByPoe: snapshot.poweredByPoe,
    ports: snapshot.ports,
    svis: snapshot.svis
  };
};

export const formatIpamChangelogTime = (at: number): string => {
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      dateStyle: 'short',
      timeStyle: 'medium'
    }).format(new Date(at));
  } catch {
    return new Date(at).toLocaleString();
  }
};
