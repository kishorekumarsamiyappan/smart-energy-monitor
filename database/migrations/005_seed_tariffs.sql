-- ==============================================================================
-- 005_seed_tariffs.sql
-- Seeds indicative 2026 TNEB/TNPDCL Domestic LT-IA tariff & separate subsidy rule.
-- Marked is_indicative = TRUE and official_verified = FALSE until verified
-- against official TNERC/TNPDCL tariff & subsidy orders.
-- ==============================================================================

INSERT INTO firmware_versions (version, hardware_target, release_notes, is_mandatory)
VALUES ('1.2.0', 'ESP32-S3-ADS131M02-REV2', 'Simultaneous 4kSPS RMS/Power + NVS lifetime kWh persistence + NimBLE provisioning', FALSE)
ON CONFLICT (version) DO NOTHING;

INSERT INTO tariff_versions (
  id,
  version_code,
  category,
  effective_from,
  effective_to,
  status,
  is_indicative,
  official_verified,
  source_reference
)
VALUES (
  '00000000-0000-4000-8000-000000002026',
  'TNEB-LT1A-2026-IND',
  'LT-IA',
  '2026-07-01',
  NULL,
  'active',
  TRUE,
  FALSE,
  'Indicative 2026 TNEB/TNPDCL LT-IA Domestic Bi-Monthly Schedule (Verify official TNERC order before official billing)'
)
ON CONFLICT (version_code) DO NOTHING;

INSERT INTO subsidy_rules (
  tariff_version_id,
  name,
  free_units_upto_500,
  free_units_above_500,
  eligibility_required,
  notes
)
VALUES (
  '00000000-0000-4000-8000-000000002026',
  'TN Domestic Bi-Monthly Free Unit Subsidy (Indicative)',
  200,
  100,
  TRUE,
  'Eligible domestic consumption <= 500 units receives first 200 units free; > 500 units receives first 100 units free. Stored separately from base slabs.'
)
ON CONFLICT (tariff_version_id) DO NOTHING;

DELETE FROM tariff_slabs WHERE tariff_version_id = '00000000-0000-4000-8000-000000002026';

INSERT INTO tariff_slabs (tariff_version_id, slab_order, branch, from_unit, to_unit, rate_per_unit_inr, fixed_charge_inr, description) VALUES
  -- Base non-subsidized slabs
  ('00000000-0000-4000-8000-000000002026', 1, 'BASE_NON_SUBSIDY', 0, 400, 4.7000, 0, 'Base 1 - 400 units'),
  ('00000000-0000-4000-8000-000000002026', 2, 'BASE_NON_SUBSIDY', 400, 500, 6.3000, 0, 'Base 401 - 500 units'),
  ('00000000-0000-4000-8000-000000002026', 3, 'BASE_NON_SUBSIDY', 500, 600, 8.4000, 0, 'Base 501 - 600 units'),
  ('00000000-0000-4000-8000-000000002026', 4, 'BASE_NON_SUBSIDY', 600, 800, 9.4500, 0, 'Base 601 - 800 units'),
  ('00000000-0000-4000-8000-000000002026', 5, 'BASE_NON_SUBSIDY', 800, 1000, 10.5000, 0, 'Base 801 - 1000 units'),
  ('00000000-0000-4000-8000-000000002026', 6, 'BASE_NON_SUBSIDY', 1000, NULL, 11.5500, 0, 'Base Above 1000 units'),

  -- Branch <= 500 units
  ('00000000-0000-4000-8000-000000002026', 1, 'UPTO_500', 0, 200, 4.7000, 0, '1 - 200 units'),
  ('00000000-0000-4000-8000-000000002026', 2, 'UPTO_500', 200, 400, 4.7000, 0, '201 - 400 units'),
  ('00000000-0000-4000-8000-000000002026', 3, 'UPTO_500', 400, 500, 6.3000, 0, '401 - 500 units'),

  -- Branch > 500 units
  ('00000000-0000-4000-8000-000000002026', 1, 'ABOVE_500', 0, 100, 4.7000, 0, '1 - 100 units'),
  ('00000000-0000-4000-8000-000000002026', 2, 'ABOVE_500', 100, 400, 4.7000, 0, '101 - 400 units'),
  ('00000000-0000-4000-8000-000000002026', 3, 'ABOVE_500', 400, 500, 6.3000, 0, '401 - 500 units'),
  ('00000000-0000-4000-8000-000000002026', 4, 'ABOVE_500', 500, 600, 8.4000, 0, '501 - 600 units'),
  ('00000000-0000-4000-8000-000000002026', 5, 'ABOVE_500', 600, 800, 9.4500, 0, '601 - 800 units'),
  ('00000000-0000-4000-8000-000000002026', 6, 'ABOVE_500', 800, 1000, 10.5000, 0, '801 - 1000 units'),
  ('00000000-0000-4000-8000-000000002026', 7, 'ABOVE_500', 1000, NULL, 11.5500, 0, 'Above 1000 units');
