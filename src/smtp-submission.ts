import {loadConfig} from './config.js';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { digest,secret } from './auth.js';
import { enforceSource } from './security.js';
import { acceptMail } from './mail.js';
import { AppError } from './errors.js';
export async function createSmtpCredential(pool:pg.Pool,org:string,name:string,expiresAt?:string){
 if(expiresAt&&new Date(expiresAt).getTime()<=Date.now())throw new AppError(400,'Expiry must be in the future.');
 const id=randomUUID(),username=`vst_${secret().slice(0,24)}`,password=`vst_smtp_${secret()}`;
 await pool.query('INSERT INTO smtp_credentials(id,org_id,name,username,secret_hash,prefix,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,org,name,username,digest(password),password.slice(0,14),expiresAt||null]);return {id,name,username,password};
}
export function makeSubmissionServer(pool:pg.Pool,tls?:{key:Buffer;cert:Buffer}){
 const production=loadConfig().mode==='production';if(production&&!tls)throw new Error('Production SMTP submission requires a TLS certificate and key.');
 const smtpError=(message:string,code:number)=>Object.assign(new Error(message),{responseCode:code});
 return new SMTPServer({name:process.env.SMTP_PUBLIC_HOST||'localhost',size:6*1024*1024,authOptional:false,allowInsecureAuth:!production,...tls,disabledCommands:tls?[]:['STARTTLS'],
  onAuth(auth,session,done){(async()=>{const key=(await pool.query("SELECT k.id,k.org_id FROM smtp_credentials k JOIN organizations o ON o.id=k.org_id WHERE k.username=$1 AND k.secret_hash=$2 AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>now()) AND o.status='active'",[auth.username,digest(auth.password||'')])).rows[0];if(!key)throw smtpError('Invalid SMTP credentials.',535);await enforceSource(pool,key.org_id,'smtp',session.remoteAddress);await pool.query('UPDATE smtp_credentials SET last_used_at=now() WHERE id=$1',[key.id]);return {user:{orgId:key.org_id,credentialId:key.id}};})().then(r=>done(null,r)).catch(()=>done(smtpError('SMTP authentication failed or source address is not authorized.',535)));},
  onMailFrom(address,session,done){const user=session.user as any;pool.query("SELECT id FROM identities WHERE org_id=$1 AND lower(email)=$2 AND status='active'",[user.orgId,address.address.toLowerCase()]).then(r=>done(r.rowCount?undefined:smtpError('Use an active sender from this workspace.',550))).catch(()=>done(smtpError('Sender verification unavailable.',451)));},
  onRcptTo(_address,session,done){done(session.envelope.rcptTo.length>=100?smtpError('Maximum 100 recipients per submission.',452):undefined);},
  onData(stream,session,done){(async()=>{
   const chunks:Buffer[]=[];let size=0;for await(const chunk of stream){size+=chunk.length;if(size<=6*1024*1024)chunks.push(Buffer.from(chunk));}if(size>6*1024*1024)throw new AppError(413,'Message exceeds 6 MiB.');
   const user=session.user as any;
   if(!(await pool.query('SELECT id FROM smtp_credentials WHERE id=$1 AND org_id=$2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())',[user.credentialId,user.orgId])).rowCount)throw new AppError(403,'SMTP credential is no longer active.');
   await enforceSource(pool,user.orgId,'smtp',session.remoteAddress);
   const mail=await simpleParser(Buffer.concat(chunks)),from=mail.from?.value;
   if(!session.envelope.mailFrom||from?.length!==1||from[0].address?.toLowerCase()!==session.envelope.mailFrom.address.toLowerCase())throw new AppError(400,'The From header must match the envelope sender.');
   if(mail.attachments.length)throw new AppError(400,'Attachments are not yet supported.');
   const identity=(await pool.query("SELECT id FROM identities WHERE org_id=$1 AND lower(email)=$2 AND status='active'",[user.orgId,from[0].address.toLowerCase()])).rows[0];if(!identity)throw new AppError(403,'Sender is not active.');
   const category=mail.headers.get('x-vstmailer-category');if(category&&category!=='marketing'&&category!=='transactional')throw new AppError(400,'Invalid mail category.');
   const result=await acceptMail(pool,user.orgId,{identityId:identity.id,to:session.envelope.rcptTo.map(r=>r.address),subject:mail.subject||'',text:mail.text||'',html:mail.html||'',kind:category==='marketing'?'marketing':'transactional'},`smtp:${digest(mail.messageId||secret())}`);
   return `Queued ${result.ids.length} recipient(s); ${result.suppressed.length} suppressed.`;
  })().then(r=>done(null,r)).catch(e=>done(smtpError(e instanceof AppError?e.message:'Temporary submission failure.',e instanceof AppError?(e.statusCode===402?452:e.statusCode<500?550:451):451)));}
 });
}
