-- Ledger names for every website and product (owner order 2026-10-13: razorpay / IT Services / website / product). Safe to repeat.
UPDATE site SET name='Corporate Tambola' WHERE host='corporate-tambola.pages.dev';
UPDATE site SET name='Corporate Bingo' WHERE host='corporate-bingo.pages.dev';
UPDATE site SET name='Corporate Tic Tac Toe' WHERE host='corporate-tic-tac-toe.pages.dev';
UPDATE site SET name='Corporate Snakes & Ladders' WHERE host='corporate-snakes-and-ladders.pages.dev';
UPDATE site SET name='Corporate Luck by Chance' WHERE host='corporate-luck-by-chance.pages.dev';
UPDATE site SET name='Veridian DPDP' WHERE host='veridian-aios.com';
UPDATE site SET name='Rajat Startup Coach' WHERE host='rajat-agarwal-startup-coach.pages.dev';
UPDATE site SET webhook_url='https://corporate-tic-tac-toe.pages.dev/api/payments/webhook' WHERE host='corporate-tic-tac-toe.pages.dev' AND webhook_url IS NULL;
UPDATE site SET webhook_url='https://corporate-snakes-and-ladders.pages.dev/api/payments/webhook' WHERE host='corporate-snakes-and-ladders.pages.dev' AND webhook_url IS NULL;
UPDATE site SET webhook_url='https://corporate-luck-by-chance.pages.dev/api/payments/webhook' WHERE host='corporate-luck-by-chance.pages.dev' AND webhook_url IS NULL;
INSERT OR IGNORE INTO plan_catalog(site,stream,plan,name,currency,amount_minor,notes) VALUES
('corporate-bingo.pages.dev','sales','bingo_pack_100','Bingo game up to 100 participants','INR',239900,'US$34 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_250','Bingo game up to 250 participants','INR',349900,'US$51 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_500','Bingo game up to 500 participants','INR',469900,'US$67 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_750','Bingo game up to 750 participants','INR',589900,'US$84 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_1000','Bingo game up to 1000 participants','INR',709900,'US$101 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_2500','Bingo game up to 2500 participants','INR',1179900,'US$169 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_5000','Bingo game up to 5000 participants','INR',1769900,'US$253 abroad'),
('corporate-bingo.pages.dev','sales','bingo_pack_10000','Bingo game up to 10000 participants','INR',2949900,'US$421 abroad'),
('corporate-bingo.pages.dev','sales','payment_test','Payment test (buys nothing)','INR',100,'Rs 1 / US$1'),
('corporate-bingo.pages.dev','refer_and_earn','partner','Partner commission','INR',0,NULL),
('corporate-bingo.pages.dev','sales_team_commission','sales_team','Sales team commission','INR',0,NULL),
('corporate-bingo.pages.dev','sales_team_salary','sales_team','Sales team salary','INR',0,NULL),
('corporate-tic-tac-toe.pages.dev','sales','tictactoe_pack_100','Tic Tac Toe game up to 100 participants','INR',239900,'US$34 abroad'),
('corporate-tic-tac-toe.pages.dev','sales','tictactoe_pack_250','Tic Tac Toe game up to 250 participants','INR',349900,'US$51 abroad'),
('corporate-tic-tac-toe.pages.dev','sales','tictactoe_pack_500','Tic Tac Toe game up to 500 participants','INR',469900,'US$67 abroad'),
('corporate-tic-tac-toe.pages.dev','sales','tictactoe_pack_750','Tic Tac Toe game up to 750 participants','INR',589900,'US$84 abroad'),
('corporate-tic-tac-toe.pages.dev','sales','tictactoe_pack_1000','Tic Tac Toe game up to 1000 participants','INR',709900,'US$101 abroad'),
('corporate-tic-tac-toe.pages.dev','sales','tictactoe_pack_2500','Tic Tac Toe game up to 2500 participants','INR',1179900,'US$169 abroad'),
('corporate-tic-tac-toe.pages.dev','sales','tictactoe_pack_5000','Tic Tac Toe game up to 5000 participants','INR',1769900,'US$253 abroad'),
('corporate-tic-tac-toe.pages.dev','sales','tictactoe_pack_10000','Tic Tac Toe game up to 10000 participants','INR',2949900,'US$421 abroad'),
('corporate-tic-tac-toe.pages.dev','sales','payment_test','Payment test (buys nothing)','INR',100,'Rs 1 / US$1'),
('corporate-tic-tac-toe.pages.dev','refer_and_earn','partner','Partner commission','INR',0,NULL),
('corporate-tic-tac-toe.pages.dev','sales_team_commission','sales_team','Sales team commission','INR',0,NULL),
('corporate-tic-tac-toe.pages.dev','sales_team_salary','sales_team','Sales team salary','INR',0,NULL),
('corporate-snakes-and-ladders.pages.dev','sales','snakes_pack_100','Snakes and Ladders game up to 100 participants','INR',239900,'US$34 abroad'),
('corporate-snakes-and-ladders.pages.dev','sales','snakes_pack_250','Snakes and Ladders game up to 250 participants','INR',349900,'US$51 abroad'),
('corporate-snakes-and-ladders.pages.dev','sales','snakes_pack_500','Snakes and Ladders game up to 500 participants','INR',469900,'US$67 abroad'),
('corporate-snakes-and-ladders.pages.dev','sales','snakes_pack_750','Snakes and Ladders game up to 750 participants','INR',589900,'US$84 abroad'),
('corporate-snakes-and-ladders.pages.dev','sales','snakes_pack_1000','Snakes and Ladders game up to 1000 participants','INR',709900,'US$101 abroad'),
('corporate-snakes-and-ladders.pages.dev','sales','snakes_pack_2500','Snakes and Ladders game up to 2500 participants','INR',1179900,'US$169 abroad'),
('corporate-snakes-and-ladders.pages.dev','sales','snakes_pack_5000','Snakes and Ladders game up to 5000 participants','INR',1769900,'US$253 abroad'),
('corporate-snakes-and-ladders.pages.dev','sales','snakes_pack_10000','Snakes and Ladders game up to 10000 participants','INR',2949900,'US$421 abroad'),
('corporate-snakes-and-ladders.pages.dev','sales','payment_test','Payment test (buys nothing)','INR',100,'Rs 1 / US$1'),
('corporate-snakes-and-ladders.pages.dev','refer_and_earn','partner','Partner commission','INR',0,NULL),
('corporate-snakes-and-ladders.pages.dev','sales_team_commission','sales_team','Sales team commission','INR',0,NULL),
('corporate-snakes-and-ladders.pages.dev','sales_team_salary','sales_team','Sales team salary','INR',0,NULL),
('corporate-luck-by-chance.pages.dev','sales','luck_pack_100','Luck by Chance game up to 100 participants','INR',239900,'US$34 abroad'),
('corporate-luck-by-chance.pages.dev','sales','luck_pack_250','Luck by Chance game up to 250 participants','INR',349900,'US$51 abroad'),
('corporate-luck-by-chance.pages.dev','sales','luck_pack_500','Luck by Chance game up to 500 participants','INR',469900,'US$67 abroad'),
('corporate-luck-by-chance.pages.dev','sales','luck_pack_750','Luck by Chance game up to 750 participants','INR',589900,'US$84 abroad'),
('corporate-luck-by-chance.pages.dev','sales','luck_pack_1000','Luck by Chance game up to 1000 participants','INR',709900,'US$101 abroad'),
('corporate-luck-by-chance.pages.dev','sales','luck_pack_2500','Luck by Chance game up to 2500 participants','INR',1179900,'US$169 abroad'),
('corporate-luck-by-chance.pages.dev','sales','luck_pack_5000','Luck by Chance game up to 5000 participants','INR',1769900,'US$253 abroad'),
('corporate-luck-by-chance.pages.dev','sales','luck_pack_10000','Luck by Chance game up to 10000 participants','INR',2949900,'US$421 abroad'),
('corporate-luck-by-chance.pages.dev','sales','payment_test','Payment test (buys nothing)','INR',100,'Rs 1 / US$1'),
('corporate-luck-by-chance.pages.dev','refer_and_earn','partner','Partner commission','INR',0,NULL),
('corporate-luck-by-chance.pages.dev','sales_team_commission','sales_team','Sales team commission','INR',0,NULL),
('corporate-luck-by-chance.pages.dev','sales_team_salary','sales_team','Sales team salary','INR',0,NULL);
INSERT OR IGNORE INTO product_catalog(product,product_type,site,name,seller,notes) VALUES
('corporate_bingo','game_pack','corporate-bingo.pages.dev','Corporate Bingo game','IT Services by Rajat Agarwal','variation = bingo_pack_N (up to N participants)'),
('corporate_bingo','payment_test','corporate-bingo.pages.dev','Corporate Bingo payment test','IT Services by Rajat Agarwal','Rs 1 / US$ 1, buys nothing'),
('corporate_tic_tac_toe','game_pack','corporate-tic-tac-toe.pages.dev','Corporate Tic Tac Toe game','IT Services by Rajat Agarwal','variation = tictactoe_pack_N (up to N participants)'),
('corporate_tic_tac_toe','payment_test','corporate-tic-tac-toe.pages.dev','Corporate Tic Tac Toe payment test','IT Services by Rajat Agarwal','Rs 1 / US$ 1, buys nothing'),
('corporate_snakes_and_ladders','game_pack','corporate-snakes-and-ladders.pages.dev','Corporate Snakes and Ladders game','IT Services by Rajat Agarwal','variation = snakes_pack_N (up to N participants)'),
('corporate_snakes_and_ladders','payment_test','corporate-snakes-and-ladders.pages.dev','Corporate Snakes and Ladders payment test','IT Services by Rajat Agarwal','Rs 1 / US$ 1, buys nothing'),
('corporate_luck_by_chance','game_pack','corporate-luck-by-chance.pages.dev','Corporate Luck by Chance game','IT Services by Rajat Agarwal','variation = luck_pack_N (up to N participants)'),
('corporate_luck_by_chance','payment_test','corporate-luck-by-chance.pages.dev','Corporate Luck by Chance payment test','IT Services by Rajat Agarwal','Rs 1 / US$ 1, buys nothing');
