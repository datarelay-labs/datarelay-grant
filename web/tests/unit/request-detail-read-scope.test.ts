import { describe, expect, it } from 'vitest';
import {
  createRequestDetailReadGate, readScopedRequestDetail,
  currentRouteRequest, acceptCurrentRequestMutation,
} from '../../src/request_detail_read_scope';

type Row = { id: string; revision: number; title: string };
const a: Row = { id: 'request-a', revision: 1, title: 'Approve A' };
const b: Row = { id: 'request-b', revision: 2, title: 'Approve B' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, no) => { resolve = ok; reject = no; });
  return { promise, resolve, reject };
}

describe('P0 task-first RequestDetail exact active route and latest GET projection', () => {
  it('never renders an old request, approver seat or action after route ID changes', () => {
    expect(currentRouteRequest(a, b.id)).toBeNull();
    expect(currentRouteRequest(a, a.id)).toBe(a);
    expect(currentRouteRequest(null, b.id)).toBeNull();
  });

  it('does not start a superseded route read or implicitly select an old request', async () => {
    const gate = createRequestDetailReadGate();
    gate.selectRequest(a.id);
    gate.selectRequest(b.id);
    let calls = 0;
    const accepted = await readScopedRequestDetail(gate, a.id,
      async () => { calls++; return a; }, () => { throw Error('stale projected'); });
    expect(accepted).toBe(false);
    expect(calls).toBe(0);
    expect(gate.isActive(b.id)).toBe(true);
  });

  it('does not let an old A response overwrite newly selected B', async () => {
    const gate = createRequestDetailReadGate();
    gate.selectRequest(a.id);
    const slowA = deferred<Row>();
    const projected: string[] = [];
    const older = readScopedRequestDetail(gate, a.id,
      () => slowA.promise, row => { projected.push(row.id); });
    gate.selectRequest(b.id);
    expect(await readScopedRequestDetail(gate, b.id, async () => b,
      row => { projected.push(row.id); })).toBe(true);
    slowA.resolve(a);
    expect(await older).toBe(false);
    expect(projected).toEqual([b.id]);
  });

  it('ignores late first Refresh of the same request after the second Refresh', async () => {
    const gate = createRequestDetailReadGate();
    gate.selectRequest(a.id);
    const slow = deferred<Row>(), projected: number[] = [];
    const earlier = readScopedRequestDetail(gate, a.id, () => slow.promise,
      row => projected.push(row.revision));
    const newer = await readScopedRequestDetail(gate, a.id,
      async () => ({ ...a, revision: 3 }), row => projected.push(row.revision));
    slow.resolve(a);
    expect(newer).toBe(true);
    expect(await earlier).toBe(false);
    expect(projected).toEqual([3]);
  });

  it('rejects server GET with different request ID without showing it', async () => {
    const gate = createRequestDetailReadGate();
    gate.selectRequest(a.id);
    const projected: Row[] = [];
    await expect(readScopedRequestDetail(gate, a.id, async () => b,
      row => projected.push(row))).rejects.toThrow('REQUEST_READ_ID_MISMATCH');
    expect(projected).toEqual([]);
  });

  it('suppresses late old-route HTTP errors but surfaces errors of current selected route', async () => {
    const gate = createRequestDetailReadGate();
    gate.selectRequest(a.id);
    const slow = deferred<Row>();
    const older = readScopedRequestDetail(gate, a.id, () => slow.promise, () => undefined);
    gate.selectRequest(b.id);
    slow.reject(new Error('OLD_GET_FAILED'));
    expect(await older).toBe(false);
    await expect(readScopedRequestDetail(gate, b.id,
      async () => { throw new Error('CURRENT_GET_FAILED'); },
      () => undefined)).rejects.toThrow('CURRENT_GET_FAILED');
  });

  it('cannot overwrite a freshly recorded collaboration or routing projection with a pending GET', async () => {
    const gate = createRequestDetailReadGate();
    gate.selectRequest(a.id);
    const slow = deferred<Row>(), values: number[] = [];
    const earlier = readScopedRequestDetail(gate, a.id,
      () => slow.promise, row => values.push(row.revision));
    expect(acceptCurrentRequestMutation(gate, a.id,
      { ...a, revision: 4 }, row => values.push(row.revision))).toBe(true);
    slow.resolve(a);
    expect(await earlier).toBe(false);
    expect(values).toEqual([4]);
  });

  it('refuses a stale A mutation after B becomes active without clearing B', () => {
    const gate = createRequestDetailReadGate();
    gate.selectRequest(b.id);
    let applied = false;
    expect(acceptCurrentRequestMutation(gate, a.id, a,
      () => { applied = true; })).toBe(false);
    expect(applied).toBe(false);
    expect(gate.isActive(b.id)).toBe(true);
  });

  it('fails closed on a mismatched mutation receipt rather than projecting another request', () => {
    const gate = createRequestDetailReadGate();
    gate.selectRequest(a.id);
    expect(() => acceptCurrentRequestMutation(gate, a.id, b,
      () => undefined)).toThrow('REQUEST_READ_ID_MISMATCH');
  });

  it('only an accepted current role-scoped GET qualifies as a successful refresh', async () => {
    const gate = createRequestDetailReadGate();
    gate.selectRequest(a.id);
    const old = deferred<Row>();
    const pending = readScopedRequestDetail(gate, a.id, () => old.promise, () => undefined);
    gate.selectRequest(b.id);
    old.resolve(a);
    expect(await pending).toBe(false);
    expect(await readScopedRequestDetail(gate, b.id, async () => b,
      () => undefined)).toBe(true);
  });
});
