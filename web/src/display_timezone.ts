import { api } from './api';

export type DisplayTimezoneProjection = {
  override: string | null;
  default: string;
  effective: string;
  storage_timezone: 'UTC';
};

export type AdminDisplayTimezoneProjection = {
  default: string;
  storage_timezone: 'UTC';
};

let activeDisplayTimezone = 'UTC';

export function setDisplayTimezone(timezone: string): void {
  // The backend is authoritative. Keep the formatter fail-closed if stale or
  // corrupted local state ever supplies an invalid Intl timezone.
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format(new Date(0));
    activeDisplayTimezone = timezone;
  } catch {
    activeDisplayTimezone = 'UTC';
  }
}

export function getDisplayTimezone(): string {
  return activeDisplayTimezone;
}

export function formatDisplayDate(date: Date): string {
  return date.toLocaleString(undefined, { timeZone: activeDisplayTimezone });
}

export function formatDisplayEpoch(seconds: number): string {
  return formatDisplayDate(new Date(seconds * 1000));
}

export function formatDisplayIso(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatDisplayDate(date) : value;
}

export async function readDisplayTimezone(): Promise<DisplayTimezoneProjection> {
  return api<DisplayTimezoneProjection>('/auth/display-timezone');
}
