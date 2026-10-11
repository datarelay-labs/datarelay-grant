import { describe, expect, it } from 'vitest';
import { createAuditReadGate, verifyAuditChainIdentity } from '../../src/audit_read_guard';

describe('B5 audit explorer latest-only read-only projection', () => {
  it('allows the first exact filter snapshot, but invalidates it on a new search', () => {
    const gate = createAuditReadGate();
    const initial = gate.beginList();
    expect(gate.listCurrent(initial)).toBe(true);
    gate.invalidateList();
    expect(gate.listCurrent(initial)).toBe(false);
    const next = gate.beginList();
    expect(gate.listCurrent(next)).toBe(true);
  });

  it('refuses an older list response after a newer page request starts', () => {
    const gate = createAuditReadGate();
    const pageOne = gate.beginList();
    const pageTwo = gate.beginList();
    expect(gate.listCurrent(pageOne)).toBe(false);
    expect(gate.listCurrent(pageTwo)).toBe(true);
  });

  it('ignores a stale request evidence chain after selecting another request', () => {
    const gate = createAuditReadGate();
    const first = gate.beginChain();
    const second = gate.beginChain();
    expect(gate.chainCurrent(first)).toBe(false);
    expect(gate.chainCurrent(second)).toBe(true);
  });

  it('invalidates the open request chain and current page on filter reset', () => {
    const gate = createAuditReadGate();
    const list = gate.beginList();
    const chain = gate.beginChain();
    gate.invalidateAll();
    expect(gate.listCurrent(list)).toBe(false);
    expect(gate.chainCurrent(chain)).toBe(false);
    expect(gate.listCurrent(gate.beginList())).toBe(true);
  });

  it('makes no HTTP request or audit write on its own', () => {
    const gate = createAuditReadGate();
    const read = gate.beginList();
    const inspect = gate.beginChain();
    expect(gate.listCurrent(read)).toBe(true);
    expect(gate.chainCurrent(inspect)).toBe(true);
  });

  it('rejects unrelated request evidence even when GET succeeds', () => {
    expect(() => verifyAuditChainIdentity('req-one', { request: { id: 'req-two' } }))
      .toThrow('AUDIT_CHAIN_REQUEST_MISMATCH');
  });

  it('accepts the exact requested request identity and never changes its evidence', () => {
    const chain = { request: { id: 'req-one' }, total_events: 400 };
    expect(verifyAuditChainIdentity('req-one', chain)).toBe(chain);
  });

  it('rejects malformed missing request identity', () => {
    expect(() => verifyAuditChainIdentity('req-one', {} as { request: { id: string } }))
      .toThrow('AUDIT_CHAIN_REQUEST_MISMATCH');
  });
});
