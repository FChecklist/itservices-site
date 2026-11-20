# Refunds and disputes for Moneypenny credit payments (procedure, 20 Nov 2026)

Why this exists: a Razorpay refund or dispute is NOT sent to Moneypenny. Credits already given and a game already paid stay until a person acts.

## Before the push (credits not yet given)
IT Services checks `payment.refunded_minor` and the `dispute` table right before telling Moneypenny. A refunded or disputed payment is never pushed: its `credit_outbox` row goes `dead` with `last_error = refunded_or_disputed`, and the scheduler run answers HTTP 503 `credit_push_dead` (the owner's failure notice). Nothing else to do except confirm the refund was intended.

## After the push (credits given, game maybe paid)
1. Find the payment in the Razorpay dashboard; note its payment id (`pay_...`).
2. In Moneypenny find the order: `purchase_order.payment_ref = <pay id>`, and its game: `game_pay.game_ref`.
3. Decide with the owner: (a) refund the customer AND take the credits back, or (b) refund only the money.
4. For (a): if the credits are unspent, use Moneypenny's existing admin refund route (`POST /v1/refund`, type `purchase`, payment id). If the game was already paid from them, the credits are spent: the game must be dealt with by a person (cancel it in the game, then refund the order with `type: order`).
5. A lost dispute (chargeback) is recorded with `POST /v1/refund` type `chargeback`; credits from a reversed payment are never restored on release.
6. Write down: payment id, game ref, who decided, date.

## Dead pushes (a customer paid, the credits did not arrive)
The run returns 503 `credit_push_dead` while any row is dead. Look at `credit_outbox.last_error`:
- `payer_mismatch`, `amount mismatch`, `refunded_or_disputed`: a person decides (see above).
- 401/403 are retried automatically (clock skew, key not yet set): fix the key or clock.
After the cause is fixed: `POST /api/pay/credit-outbox-run?requeue=1` (header `x-reconcile-key`). A refunded or disputed payment goes dead again by design.
