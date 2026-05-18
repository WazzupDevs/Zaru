-- A4f-2a — bump default platform commission from 15% to 20% for the
-- closed-beta cohort. Existing rows are NOT touched (their 0.15 was
-- set at create time and stays); only the column default flips, so
-- newly provisioned drivers start at 20%.
--
-- Why not retro-update existing rows? The few seeded drivers in fixtures
-- + dev/test data are calibrated for 0.15 in their snapshot assertions
-- (pricing breakdown tests, integration fixtures). Flipping defaults +
-- leaving live rows alone keeps the migration safe to deploy without a
-- coordinated test-data refresh.

ALTER TABLE "driver_profiles"
    ALTER COLUMN "commission_rate" SET DEFAULT 0.20;
