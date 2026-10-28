import { SMTPServer } from 'smtp-server';
import type pg from 'pg';
import { simpleParser } from 'mailparser';
import { randomUUID } from 'node:crypto';
export function createLocalInbox(pool: pg.Pool) { return new SMTPServer({ secure: false, authOptional: true, disabledCommands: ['AUTH', 'STARTTLS'], size: 6 * 1024 * 1024, onData(stream, session, callback) { simpleParser(stream).then(async (mail) => { if (stream.sizeExceeded)
        throw new Error('Message exceeds the test inbox size limit'); const to = session.envelope.rcptTo.map(r => r.address).join(', '); await pool.query('INSERT INTO local_inbox(id,recipient,sender,subject,text_body,html) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), to, session.envelope.mailFrom ? session.envelope.mailFrom.address : '', mail.subject || '', mail.text || '', mail.html || '']); callback(); }).catch(callback); } }); }
