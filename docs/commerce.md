# Commercial billing decisions

Confirmed by the owner: **Nigeria-registered business; USD customer billing**. This overrides any earlier undecided currency placeholders. Keep USD amounts as integer cents. No exchange-rate conversion is implied.

The three current tiers represent development allowances, not approved commercial prices: Launch 10,000, Growth 100,000, Scale 1,000,000 recipient emails per billing cycle. Prices and larger custom tiers remain owner decisions. Local plan changes never initiate a payment and do not exist in production.

Paystack is a candidate because it documents USD collection and USD settlement for Nigerian businesses. Its current support guidance requires a Zenith Bank USD domiciliary payout account. Account approval and the exact USD recurring-payment capability must be confirmed with the merchant account before activation. Sources checked 27 October 2026:

* https://support.paystack.com/en/articles/2130690
* https://paystack.com/docs/payments/subscriptions/

Do not create merchant plans, request credentials, charge cards or claim checkout readiness from this document. The next billing implementation must verify webhook signatures against raw bytes, independently verify transactions, bind them to server-side checkout/subscription records, enforce USD and exact amounts, deduplicate references, and protect entitlement changes from duplicate/out-of-order lifecycle events. Failed renewals must not grant a new allowance. All of that needs sandbox evidence before live activation.
