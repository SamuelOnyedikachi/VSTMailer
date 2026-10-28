'use client';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { post } from '../lib/api';
import { Brand, Field } from './ui';
export function Auth({ local, onLogin }: {
    local: boolean;
    onLogin: () => void;
}) {
    const [signup, setSignup] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [show, setShow] = useState(false);
    async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); setBusy(true); setError(''); setMessage(''); try {
        const r = await post(signup ? '/auth/register' : '/auth/login', data);
        if (signup) {
            setMessage(r.message);
            setSignup(false);
        }
        else
            onLogin();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <main className="auth-layout"><section className="auth-brand"><Brand /><div className="auth-statement"><h1>Your email.<br />Your infrastructure.<br /><span>Your possibilities.</span></h1><p>Meet VSTMailer. A clearer way to send, manage, and understand your email.</p><div className="brand-art"><img src="/velion-brand.png" alt="Velion Smart Technologies — smarter solutions, a brighter tomorrow"/></div><div className="auth-proof"><ShieldCheck size={18}/><span>Built for control. Designed for clarity.</span></div></div><footer>VST · Velion Smart Technologies</footer></section><section className="auth-form"><div className="auth-form-inner"><div className="auth-heading"><h2>{signup ? 'Create your workspace' : 'Welcome to VSTMailer'}</h2><p>{signup ? 'Bring your domain, or start with a hosted sending address.' : 'Your next great email starts here.'}</p></div>{local && <div className="notice"><span className="environment-dot"/>Local development · emails stay in the test inbox.</div>}<form onSubmit={submit}>{signup && <><Field label="Your name" name="name" required autoComplete="name"/><Field label="Organization" name="organization" required autoComplete="organization"/></>}<Field label="Email address" name="email" type="email" required autoComplete="email" placeholder="you@company.com"/><div className="password-field"><Field label="Password" name="password" type={show ? 'text' : 'password'} required minLength={signup ? 12 : 1} maxLength={128} autoComplete={signup ? 'new-password' : 'current-password'} hint={signup ? 'At least 12 characters.' : undefined}/><button type="button" className="password-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status"><Check size={16}/>{message}</p>}<button className="button primary full" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create workspace' : 'Sign in'}<ArrowRight size={17}/></button></form><p className="auth-switch">{signup ? 'Already have an account?' : 'New to VSTMailer?'} <button className="text-button" onClick={() => { setSignup(!signup); setError(''); }}>{signup ? 'Sign in' : 'Create a workspace'}</button></p>{local && <div className="local-entry"><div><strong>Take a look around</strong><p>Explore a local workspace. No external email or payments.</p></div><button className="button secondary full" disabled={busy} onClick={async () => { setBusy(true); setError(''); try {
        await post('/auth/demo');
        onLogin();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}>Open local workspace<ArrowUpRight size={17}/></button><a href="/inbox">Open local test inbox</a></div>}</div></section></main>;
}
