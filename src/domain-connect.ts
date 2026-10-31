import {Resolver} from 'node:dns/promises';
import {AppError} from './errors.js';
export function connectionUrl(input:{discovery:string;domain:string;token:string;selector:string;key:string;state:string},env:NodeJS.ProcessEnv=process.env){
 const registry=JSON.parse(env.DOMAIN_CONNECT_PROVIDERS||'{}');const provider=registry[input.discovery];
 if(!provider)throw new AppError(409,'This DNS provider is not connected to VST automatic setup yet. Choose Configure manually.');
 if(provider.requiresSigning)throw new AppError(503,'This DNS provider requires signed requests; its VST signing integration must be commissioned before automatic setup. Use manual configuration.');
 const base=new URL(provider.applyUrl);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new AppError(503,'Automatic DNS provider configuration is invalid.');
 if(!provider.providerId||!provider.serviceId)throw new AppError(503,'VST DNS template has not been configured.');
 const redirect=new URL('/api/domains/setup/callback',env.APP_URL||'http://localhost:3000');
 redirect.searchParams.set('state',input.state);
 if(redirect.protocol!=='https:')throw new AppError(503,'Automatic setup requires a public HTTPS VST callback and an onboarded DNS template.');
 const url=new URL(`${base.toString().replace(/\/$/,'')}/v2/domainTemplates/providers/${encodeURIComponent(provider.providerId)}/services/${encodeURIComponent(provider.serviceId)}/apply`);
 url.search=new URLSearchParams({domain:input.domain,redirect_uri:redirect.toString(),state:input.state,ownershipToken:input.token,dkimSelector:input.selector,dkimValue:input.key}).toString();return url.toString();
}
export async function discoverProvider(name:string){const resolver=new Resolver({timeout:1500,tries:1});try{const records=await resolver.resolveTxt(`_domainconnect.${name}`);const host=records.map(r=>r.join('')).find(v=>/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i.test(v));if(host)return host.toLowerCase();}catch{}throw new AppError(409,'Automatic DNS setup could not discover a supported provider. Configure manually, or retry after checking DNS.');}
