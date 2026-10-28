import type pg from 'pg';
export type Provider='google'|'github'|'gitlab';
export async function beginOAuth(pool:pg.Pool,provider:Provider,linkUserId:string|null=null,env:NodeJS.ProcessEnv=process.env):Promise<{state:string;url:string}>{throw new Error('OAuth authorization not implemented');}
export async function finishOAuth(pool:pg.Pool,input:{provider:Provider;state:string;cookieState:string;code:string;currentUserId?:string},fetcher:typeof fetch=fetch,env:NodeJS.ProcessEnv=process.env):Promise<{token:string|null;created:boolean;linked:boolean}>{throw new Error('OAuth callback not implemented');}
