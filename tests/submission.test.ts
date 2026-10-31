import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {pool,reset,account} from './helpers.js';
import {register,verifyEmail} from '../src/auth.js';
import {makeSubmissionServer,createSmtpCredential} from '../src/smtp-submission.js';
beforeEach(reset);after(()=>pool.end());
test('authenticated SMTP shares durable quota, rejects foreign senders and revoked credentials',async()=>{
 const a=await register(pool,account());await verifyEmail(pool,a.verificationToken);const from=(await pool.query('SELECT email FROM identities WHERE org_id=$1',[a.orgId])).rows[0].email;
 const key=await createSmtpCredential(pool,a.orgId,'App');const server=makeSubmissionServer(pool);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.server.address() as any).port;
 const client=nodemailer.createTransport({host:'127.0.0.1',port,secure:false,ignoreTLS:true,auth:{user:key.username,pass:key.password}});
 try{const message={from,to:'reader@example.com',subject:'SMTP quota',text:'Body',messageId:'<retry@vst.test>'};await client.sendMail(message);await client.sendMail(message);assert.equal((await pool.query('SELECT reserved FROM cycles WHERE org_id=$1',[a.orgId])).rows[0].reserved,1);await assert.rejects(()=>client.sendMail({...message,from:'someone@gmail.com'}));await pool.query('UPDATE smtp_credentials SET revoked_at=now() WHERE id=$1',[key.id]);await assert.rejects(()=>client.sendMail({...message,messageId:'<revoked@vst.test>'}));}finally{client.close();await new Promise<void>(r=>server.close(r));}
});
