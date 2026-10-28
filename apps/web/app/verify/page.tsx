'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Brand } from '../../components/ui';
import { post } from '../../lib/api';
function Verify() { const params = useSearchParams(); const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false); return <main className="standalone-small panel"><Brand /><h1>Verify your email</h1><p>Confirm this address to start using your VSTMailer workspace.</p>{error && <p role="alert" className="form-error">{error}</p>}{message ? <><p className="form-success">{message}</p><a className="button primary" href="/">Continue to sign in</a></> : <button className="button primary" disabled={busy} onClick={async () => { setBusy(true); try {
    const r = await post('/auth/verify', { token: params.get('token') });
    setMessage(r.message);
}
catch (e) {
    setError((e as Error).message);
}
finally {
    setBusy(false);
} }}>{busy ? 'Verifying…' : 'Verify email'}</button>}</main>; }
export default function Page() { return <Suspense><Verify /></Suspense>; }
