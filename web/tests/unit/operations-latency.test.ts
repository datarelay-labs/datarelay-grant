import { describe, expect, it } from 'vitest';
import { approvalLatencyPresentation } from '../../src/operations';

describe('G7 latency samples and median read-only presentation', () => {
  it('renders mean, median and number of final decisions without masking outliers', () => {
    const info = approvalLatencyPresentation({
      approval_latency_seconds: 1005,
      approval_latency_median_seconds: 180,
      approval_latency_sample_count: 4,
    });
    expect(info.primary).toContain('16.8 min avg');
    expect(info.detail).toContain('3.0 min median');
    expect(info.detail).toContain('4 final decisions');
  });

  it('distinguishes empty records from loading state', () => {
    expect(approvalLatencyPresentation(null).primary).toBe('—');
    expect(approvalLatencyPresentation({
      approval_latency_seconds: null,
      approval_latency_median_seconds: null,
      approval_latency_sample_count: 0,
    }).primary).toBe('No decisions');
  });

  it('shows unavailable on old or invalid server median rather than inventing a value', () => {
    const older = approvalLatencyPresentation({ approval_latency_seconds: 120 });
    expect(older.primary).toContain('2.0 min avg');
    expect(older.detail).toContain('Median unavailable');
    expect(older.detail).not.toContain('0 final decisions');
    const corrupt = approvalLatencyPresentation({
      approval_latency_seconds: Number.NaN,
      approval_latency_median_seconds: -1,
      approval_latency_sample_count: 2,
    });
    expect(corrupt.primary).toContain('Unavailable');
  });
});
