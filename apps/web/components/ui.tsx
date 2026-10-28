'use client';
import { ArrowUpRight, Check, Copy, Mail, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { date, type Row } from '../lib/api';
export function Brand() { return <div className="brand"><span className="brand-mark" role="img" aria-label="Velion Smart Technologies logo"/><span>VST<span className="brand-mailer">Mailer</span></span></div>; }
export function Status({ value }: {
    value: string;
}) { const label: Record<string, string> = { delivered_local: 'Test inbox', delivered_to_server: 'Delivered to server', transport_queued: 'Delivery queued', submission_unknown: 'Needs review', ownership_verified: 'Provisioning pending' }; return <span className={`status status-${value}`}><span aria-hidden="true"/>{label[value] || value.replaceAll('_', ' ')}</span>; }
export function Empty({ title, description, action }: {
    title: string;
    description: string;
    action?: React.ReactNode;
}) { return <div className="empty"><span className="empty-icon"><Mail size={24}/></span><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function Field({ label, name, type = 'text', required = false, defaultValue = '', hint, children, ...props }: {
    label: string;
    name: string;
    type?: string;
    required?: boolean;
    defaultValue?: string;
    hint?: string;
    children?: React.ReactNode;
    [key: string]: any;
}) { return <div className="field"><label htmlFor={name}>{label}{required && <span className="required"> *</span>}</label>{children || <input id={name} name={name} type={type} required={required} defaultValue={defaultValue} {...props}/>}{hint && <small>{hint}</small>}</div>; }
export function CopyText({ value, label = 'Copy' }: {
    value: string;
    label?: string;
}) { const [state, setState] = useState(''); return <button className="copy-button" type="button" aria-label={label} onClick={async () => { try {
    await navigator.clipboard.writeText(value);
    setState('Copied');
}
catch {
    setState('Select and copy manually');
} }}>{state === 'Copied' ? <Check size={14}/> : <Copy size={14}/>} {state || label}</button>; }
export function MessageTable({ items, onOpen }: {
    items: Row[];
    onOpen: (id: string) => void;
}) { if (!items.length)
    return <Empty title="Your first email starts here" description="Send a message to see its delivery progress, recipient, and activity."/>; return <div className="table-wrap" tabIndex={0} role="region" aria-label="Email messages"><table><thead><tr><th scope="col">Subject / recipient</th><th scope="col">Status</th><th scope="col">Sent</th><th scope="col"><span className="sr-only">Details</span></th></tr></thead><tbody>{items.map(m => <tr key={m.id}><td><button className="table-link" onClick={() => onOpen(m.id)}>{m.subject}</button><small>{m.recipient}</small></td><td><Status value={m.status}/></td><td className="subtle nowrap">{date(m.created_at)}</td><td><button className="icon-button" aria-label={`View ${m.subject}`} onClick={() => onOpen(m.id)}><ArrowUpRight size={16}/></button></td></tr>)}</tbody></table></div>; }
export function Refresh({ onClick }: {
    onClick: () => void;
}) { return <button className="button secondary" onClick={onClick}><RefreshCw size={15}/>Refresh</button>; }
