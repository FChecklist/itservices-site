-- Corporate Bingo and the three games still to come register with the central ledger. Safe to repeat.
INSERT OR IGNORE INTO site(host,name,webhook_url) VALUES('corporate-bingo.pages.dev','Corporate Bingo','https://corporate-bingo.pages.dev/api/payments/webhook');
INSERT OR IGNORE INTO site(host,name,webhook_url) VALUES('corporate-tic-tac-toe.pages.dev','Corporate Tic Tac Toe',NULL);
INSERT OR IGNORE INTO site(host,name,webhook_url) VALUES('corporate-snakes-and-ladders.pages.dev','Corporate Snakes and Ladders',NULL);
INSERT OR IGNORE INTO site(host,name,webhook_url) VALUES('corporate-luck-by-chance.pages.dev','Corporate Luck by Chance',NULL);
INSERT OR IGNORE INTO plan_catalog(site,stream,plan,name,currency,amount_minor,notes) VALUES
('corporate-bingo.pages.dev','sales','bingo_pack_100','Bingo game up to 100 participants','INR',239900,'US$34 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_250','Bingo game up to 250 participants','INR',349900,'US$51 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_500','Bingo game up to 500 participants','INR',469900,'US$67 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_750','Bingo game up to 750 participants','INR',589900,'US$84 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_1000','Bingo game up to 1000 participants','INR',709900,'US$101 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_2500','Bingo game up to 2500 participants','INR',1179900,'US$169 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_5000','Bingo game up to 5000 participants','INR',1769900,'US$253 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_10000','Bingo game up to 10000 participants','INR',2949900,'US$421 abroad');
