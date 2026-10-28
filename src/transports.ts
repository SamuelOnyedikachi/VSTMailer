import nodemailer from 'nodemailer';
import { loadConfig, type Config } from './config.js';
import { TransportRejected, UnknownDelivery, type Transport, type Envelope } from './worker-service.js';
export function createTransport(config: Config = loadConfig()): Transport {
    if (config.transport === 'smtp-local') {
        if (config.mode !== 'local')
            throw new Error('Local SMTP is prohibited in production');
        const mailer = nodemailer.createTransport({ host: process.env.SMTP_HOST || '127.0.0.1', port: Number(process.env.SMTP_PORT || 1025), secure: false, ignoreTLS: true, connectionTimeout: 5000, socketTimeout: 15000 });
        return { send: async (m) => {
                try {
                    const result = await mailer.sendMail(smtpMessage(m, config));
                    return { id: result.messageId, state: 'delivered_local' };
                }
                catch (e) {
                    if ((e as {
                        code?: string;
                    }).code === 'ECONNECTION')
                        throw new TransportRejected('Local SMTP inbox unavailable; start npm run dev:inbox.');
                    throw new UnknownDelivery('SMTP acceptance could not be confirmed.');
                }
            } };
    }
    return { send: async (m) => {
            // Postal's documented API uses X-Server-API-Key and returns per-recipient IDs.
            let response: Response;
            try {
                response = await fetch(`${config.postalUrl.replace(/\/$/, '')}/api/v1/send/message`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': config.postalKey }, body: JSON.stringify({ to: [m.to], from: m.from, sender: m.from, subject: m.subject, plain_body: m.text, html_body: m.html, reply_to: m.replyTo, headers: mailHeaders(m, config), tag: m.id }), signal: AbortSignal.timeout(20000) });
            }
            catch {
                throw new UnknownDelivery('Postal handoff timed out or lost its connection. Reconcile before resubmission.');
            }
            let result: any;
            try {
                result = await response.json();
            }
            catch {
                throw new UnknownDelivery('Postal returned an unreadable acceptance response.');
            }
            if (result.status === 'error')
                throw new TransportRejected(`Postal rejected submission: ${String(result.data?.code || 'request rejected')}`);
            const id = result.data?.messages?.[m.to]?.id;
            if (!response.ok || result.status !== 'success' || !id)
                throw new UnknownDelivery('Postal acceptance could not be confirmed.');
            return { id: String(id), state: 'transport_queued' };
        } };
}
export function mailHeaders(m: Envelope, config: Config) { return { 'X-VSTMailer-Message-ID': m.id, ...(m.kind === 'marketing' ? { 'List-Unsubscribe': `<${config.appUrl}/api/unsubscribe/${m.unsubscribeToken}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {}) }; }
function smtpMessage(m: Envelope, config: Config) { const unsubscribe = `${config.appUrl}/unsubscribe/${m.unsubscribeToken}`; return { from: m.from, to: m.to, replyTo: m.replyTo, subject: m.subject, messageId: `<${m.id}@${config.hostedDomain}>`, text: m.text + (m.kind === 'marketing' ? `\n\nUnsubscribe: ${unsubscribe}` : ''), html: m.html ? m.html + (m.kind === 'marketing' ? `<p><a href="${unsubscribe}">Unsubscribe</a></p>` : '') : undefined, headers: mailHeaders(m, config) }; }
