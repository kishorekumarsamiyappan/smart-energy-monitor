-- Update current sensor model default and existing records to SCT-013-000 (100A/50mA + 22Ω external burden)
ALTER TABLE calibration_records
  ALTER COLUMN current_sensor_model SET DEFAULT 'SCT-013-000 (100A/50mA + 22Ω Burden)';

UPDATE calibration_records
SET current_sensor_model = 'SCT-013-000 (100A/50mA + 22Ω Burden)'
WHERE current_sensor_model ILIKE '%30A%'
   OR current_sensor_model ILIKE '%1V%'
   OR current_sensor_model ILIKE '%built-in burden%';
