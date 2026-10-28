'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { post } from '../../../lib/api';
import { Brand } from '../../../components/ui';
export default function Unsubscribe() { const params = useParams(); const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false); return <main className="standalone-small panel"><Brand /><h1>Unsubscribe from marketing emails</h1><p>This stops marketing messages from this sender. You don’t need to sign in.</p>{error && <p className="form-error" role="alert">{error}</p>}{message ? <p className="form-success" role="status">{message}</p> : <button className="button primary" disabled={busy} onClick={async () => { setBusy(true); try {
    const r = await post(`/unsubscribe/${params.token}`);
    setMessage(r.message);
}
catch (e) {
    setError((e as Error).message);
}
finally {
    setBusy(false);
} }}>{busy ? 'Saving…' : 'Unsubscribe'}</button>}</main>; }
