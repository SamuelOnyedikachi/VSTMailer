'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api, date, type Row } from '../../lib/api';
import { Brand, Empty } from '../../components/ui';
export default function Inbox() { const [items, setItems] = useState<Row[]>([]), [error, setError] = useState(''); async function load() { try {
    const r = await api('/local/inbox');
    setItems(r.items);
    setError('');
}
catch (e) {
    setError((e as Error).message);
} } useEffect(() => { void load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []); return <main className="standalone"><div className="standalone-header"><Brand /><a className="button secondary" href="/"><ArrowLeft size={15}/>Back to workspace</a></div><div className="page-heading"><div><h1>Local test inbox</h1><p>Captured SMTP messages. Nothing here was delivered externally.</p></div><button className="button secondary" onClick={load}><RefreshCw size={15}/>Refresh</button></div><div className="environment-banner">Local-only tool. It contains test messages and verification links from this computer.</div>{error && <p className="form-error" role="alert">{error}</p>}{!items.length ? <section className="panel"><Empty title="Ready for your first message" description="Send an email or create an account. Captured messages will appear here."/></section> : items.map(m => <article className="panel inbox-message" key={m.id}><h2>{m.subject}</h2><p>To: {m.recipient}</p><p>From: {m.sender} · {date(m.created_at)}</p><pre>{m.text_body.split(/(https?:\/\/[^\s]+)/g).map((part: string, i: number) => /^https?:\/\//.test(part) ? <a key={i} href={part} rel="noreferrer">{part}</a> : part)}</pre></article>)}</main>; }
