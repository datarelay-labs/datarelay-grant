import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  NotificationDeliveryHealth,
  notificationDeliveryQuery,
  deliveryPageLabel,
} from '../../src/notifications';

describe('G2 delivery health filters and bounded paging', () => {
  it('encodes state, event and request without broadening a logged-in admin query', () => {
    const path = notificationDeliveryQuery({
      state: 'FAILED', event: 'reminder', requestId: 'req&space a',
    }, 100);
    expect(path).toContain('/notification-deliveries?');
    const params = new URLSearchParams(path.split('?')[1]);
    expect(params.get('state')).toBe('FAILED');
    expect(params.get('event_type')).toBe('reminder');
    expect(params.get('request_id')).toBe('req&space a');
    expect(params.get('limit')).toBe('50');
    expect(params.get('offset')).toBe('100');
    expect(notificationDeliveryQuery({
      state: 'ALL', event: 'ALL', requestId: '',
    }, 0)).not.toContain('state=');
  });

  it('refuses unsupported state, event and unbounded offsets', () => {
    const base = { state: 'ALL' as const, event: 'ALL' as const, requestId: '' };
    expect(() => notificationDeliveryQuery({ ...base, state: 'ATTACK' as 'ALL' }, 0))
      .toThrow('INVALID_DELIVERY_HEALTH_FILTER');
    expect(() => notificationDeliveryQuery({ ...base, event: 'custom' as 'ALL' }, 0))
      .toThrow('INVALID_DELIVERY_HEALTH_FILTER');
    expect(() => notificationDeliveryQuery(base, -1))
      .toThrow('INVALID_DELIVERY_HEALTH_FILTER');
    expect(() => notificationDeliveryQuery({ ...base, requestId: 'a'.repeat(101) }, 0))
      .toThrow('INVALID_DELIVERY_HEALTH_FILTER');
  });

  it('renders honest paged status without any implicit send or receipt confirmation', () => {
    expect(deliveryPageLabel(null)).toContain('Delivery page unavailable');
    expect(deliveryPageLabel({
      deliveries: [{ id: 'fixture' }], total: 251,
      limit: 50, offset: 200, has_more: true,
    })).toContain('201–201 of 251 matching deliveries');
    const html = renderToStaticMarkup(createElement(NotificationDeliveryHealth));
    expect(html).toContain('Filter delivery health');
    expect(html).toContain('Apply filters');
    expect(html).toContain('Previous page');
    expect(html).toContain('Next page');
    expect(html).toContain('Receipt is not independently confirmed');
    expect(html).not.toContain('Schedule resend');
  });
});
