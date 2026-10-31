# Customer code, sender setup and founder administration

Customers may render any purpose-specific HTML/text in their own backend and send it through POST /emails with an owned active identityId, recipients, subject, html/text and a stable Idempotency-Key header. VST-stored templates are optional. Each organization's credentials, sender identities, quotas and content remain isolated. Never embed API keys in frontend code. Render React Email, MJML or other templates in the customer's project before submitting the resulting HTML; arbitrary source code is not executed on VSTMailer.

Saved templates can be edited within their own workspace. An edit changes future uses, never queued message snapshots.

For an existing mailbox such as support@safecorps.com hosted at HostAfrica: add the full sender address in Senders & domains, publish the ownership TXT record, verify ownership and commission VST/Postal DKIM signing. Keep existing mailbox MX records. No hosting password is required. DNS record presence does not activate a sender; the founder must confirm signing and delivery provisioning before activation. This integration sends through VST infrastructure; receiving mail remains with the mailbox host.

Contacts record your audience and marketing consent. Campaigns snapshot opted-in recipients and send marketing messages in durable batches, subject to quota and suppressions. Application transactional messages do not require importing contacts or creating campaigns.

Founder administration uses a verified browser account matching server-side FOUNDER_ADMIN_EMAIL. The variable is unset by default; neither the local demo nor customer API keys receive founder privileges. Set it only after confirming the owner's account. The admin UI shows platform counts, workspace usage, sender provisioning and an audit history; workspace activation requires a provisioning confirmation. Suspension pauses new acceptance/dispatch, but cannot recall mail already handed to Postal. No customer message bodies or API secrets are exposed by the overview.

## Application example

```js
// Your backend renders the template; no VST template record is necessary.
const html = renderReceipt(order); // Your existing project function
const response = await fetch(`${process.env.VST_URL}/api/emails`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.VST_API_KEY}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': `receipt-${order.id}`,
  },
  body: JSON.stringify({
    identityId: process.env.VST_SENDER_ID,
    to: [order.customerEmail],
    subject: `Receipt ${order.id}`,
    html,
    text: `Thank you for order ${order.id}`,
    kind: 'transactional',
    tags: ['receipt'],
  }),
});
if (!response.ok) throw new Error(await response.text());
```

Escape untrusted values when rendering HTML. Reuse an idempotency key only for the same payload. Each recipient consumes subscription allowance; API acceptance is not an inbox-delivery guarantee. Custom sender replies return to that sender's existing mailbox; hosted send-only identities use the verified account Reply-To.
