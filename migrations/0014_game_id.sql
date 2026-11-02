-- The game ID of the game a payment is for (sent by the game website, also a Razorpay order note), so the game's own record, this ledger and Razorpay match by game ID.
-- Nullable: older rows, bare pack purchases and the Rs 1 tests have none. Apply BEFORE the games are released (a game that sends no game ID is unaffected).
ALTER TABLE pay_order ADD COLUMN game_id TEXT;
ALTER TABLE payment ADD COLUMN game_id TEXT;
CREATE INDEX IF NOT EXISTS payment_game ON payment (game_id);
