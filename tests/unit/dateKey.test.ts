import { describe, expect, it } from 'vitest';
import {
  addDaysKey,
  daysBetweenKeys,
  isFuture,
  isValidDateKey,
  todayKey,
} from '@/lib/utils/dateKey';

describe('dateKey', () => {
  describe('isValidDateKey', () => {
    it('accepts canonical YYYY-MM-DD', () => {
      expect(isValidDateKey('2026-05-17')).toBe(true);
      expect(isValidDateKey('1999-01-01')).toBe(true);
    });

    it('rejects malformed strings', () => {
      expect(isValidDateKey('2026-5-17')).toBe(false);
      expect(isValidDateKey('2026/05/17')).toBe(false);
      expect(isValidDateKey('2026-05-17T00:00:00Z')).toBe(false);
      expect(isValidDateKey('')).toBe(false);
      expect(isValidDateKey('not-a-date')).toBe(false);
    });
  });

  describe('isFuture', () => {
    it('treats a date strictly after today as future', () => {
      const now = new Date('2026-05-17T12:00:00Z');
      expect(isFuture('2026-05-18', now)).toBe(true);
      expect(isFuture('2099-01-01', now)).toBe(true);
    });

    it('treats today and past as non-future', () => {
      const now = new Date('2026-05-17T12:00:00Z');
      expect(isFuture(todayKey(now), now)).toBe(false);
      expect(isFuture('2026-05-16', now)).toBe(false);
      expect(isFuture('1999-01-01', now)).toBe(false);
    });

    it('returns false for malformed input (defers to isValidDateKey)', () => {
      expect(isFuture('not-a-date')).toBe(false);
    });
  });

  describe('addDaysKey', () => {
    it('adds positive days across month boundary', () => {
      expect(addDaysKey('2026-01-30', 3)).toBe('2026-02-02');
    });

    it('subtracts with negative days across year boundary', () => {
      expect(addDaysKey('2026-01-02', -5)).toBe('2025-12-28');
    });

    it('handles leap-year February correctly', () => {
      expect(addDaysKey('2024-02-28', 1)).toBe('2024-02-29');
      expect(addDaysKey('2024-02-29', 1)).toBe('2024-03-01');
    });

    it('throws on malformed input', () => {
      expect(() => addDaysKey('bad', 1)).toThrow();
    });
  });

  describe('daysBetweenKeys', () => {
    it('counts forward days as positive', () => {
      expect(daysBetweenKeys('2026-05-01', '2026-05-10')).toBe(9);
    });

    it('counts backward days as negative', () => {
      expect(daysBetweenKeys('2026-05-10', '2026-05-01')).toBe(-9);
    });

    it('returns 0 for the same date', () => {
      expect(daysBetweenKeys('2026-05-17', '2026-05-17')).toBe(0);
    });
  });
});
