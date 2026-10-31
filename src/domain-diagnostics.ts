import {Resolver} from 'node:dns/promises';
type Domain={name:string;verification_token:string;dkim_selector:string|null;dkim_value:string|null};
export async function diagnoseDomain(domain:Domain,lookup?:(name:string)=>Promise<string[][]>){
 const resolver=new Resolver({timeout:1500,tries:1});const read=lookup||((name:string)=>resolver.resolveTxt(name));
 async function check(name:string,match:(s:string)=>boolean){try{const records=(await read(name)).map(parts=>parts.join(''));return {host:name,status:records.some(match)?'present':'missing'};}catch(e){const code=(e as any).code;return {host:name,status:['ENODATA','ENOTFOUND'].includes(code)?'missing':'lookup_failed'};}}
 const [ownership,spf,dmarc,dkim]=await Promise.all([check(`_vstmailer.${domain.name}`,v=>v===`vstmailer-verification=${domain.verification_token}`),check(domain.name,v=>/^v=spf1(?:\s|$)/i.test(v)),check(`_dmarc.${domain.name}`,v=>/^v=DMARC1\s*;/i.test(v)),domain.dkim_selector&&domain.dkim_value?check(`${domain.dkim_selector}._domainkey.${domain.name}`,v=>v===domain.dkim_value):Promise.resolve({host:null,status:'not_provisioned'})]);
 return {ownership,spf,dmarc,dkim,checkedAt:new Date().toISOString(),note:'TXT presence is a DNS diagnostic, not proof of alignment, sending authorization or inbox placement.'};
}
