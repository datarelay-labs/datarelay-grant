import { useState, useId, type ReactNode, type FormEvent } from 'react';
import { Alert, Button, StatusBadge } from '@datarelay-labs/foundation';
import { errorText } from './api';
import { formatDisplayEpoch } from './display_timezone';
export function useTask() {
 const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
 async function run(task: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await task(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
 return { busy, error, notice, setNotice, run, feedback: <>{error && <Alert tone="critical" title="Unable to complete">{error}</Alert>}{notice && <Alert tone="success">{notice}</Alert>}</> };
}
export function Form({ children, busy, disabled = false, onSubmit, label }: { children: ReactNode; busy: boolean; disabled?: boolean; onSubmit: () => void; label: string }) {
 return <form className="grant-form" onSubmit={(e: FormEvent) => { e.preventDefault(); if (!busy && !disabled) onSubmit(); }}><fieldset disabled={busy || disabled}>{children}</fieldset><Button type="submit" disabled={busy || disabled}>{busy ? 'Working…' : label}</Button></form>;
}
export function Select({ label, value, onChange, children, required = true }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; required?: boolean }) {
 const id = useId();
 return <div className="grant-field"><label htmlFor={id}>{label}</label><select id={id} required={required} value={value} onChange={e => onChange(e.target.value)}>{children}</select></div>;
}
export function TextArea({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
 const id = useId();
 return <div className="grant-field"><label htmlFor={id}>{label}</label><textarea id={id} maxLength={12000} required={required} rows={4} value={value} onChange={e => onChange(e.target.value)} /></div>;
}
export function State({ value }: { value: string }) {
 const tone = ['APPROVED', 'DELIVERED', 'REPORTED_SUCCEEDED'].includes(value) ? 'success' : ['DENIED', 'FAILED', 'REPORTED_FAILED'].includes(value) ? 'critical' : ['HELD', 'EXPIRED', 'UNKNOWN'].includes(value) ? 'warning' : 'neutral';
 return <StatusBadge tone={tone}>{value.replaceAll('_', ' ')}</StatusBadge>;
}
export function when(value: number | null | undefined): string { return value ? formatDisplayEpoch(value) : '—'; }
