CREATE DATABASE IF NOT EXISTS smart_ambulance;
USE smart_ambulance;

CREATE TABLE IF NOT EXISTS service_areas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  area_name VARCHAR(100) NOT NULL UNIQUE,
  center_lat DECIMAL(10, 7) NOT NULL,
  center_lng DECIMAL(10, 7) NOT NULL,
  coverage_radius_km DECIMAL(5, 2) NOT NULL DEFAULT 5.00,
  city_name VARCHAR(100) NOT NULL DEFAULT 'Bengaluru',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hospitals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hospital_name VARCHAR(100) NOT NULL UNIQUE,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  locality VARCHAR(100) NOT NULL DEFAULT '',
  specialties VARCHAR(255) NOT NULL DEFAULT 'emergency',
  current_load_percent INT NOT NULL DEFAULT 50,
  available_beds INT NOT NULL DEFAULT 20,
  total_beds INT NOT NULL DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SET @locality_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'smart_ambulance'
    AND TABLE_NAME = 'hospitals'
    AND COLUMN_NAME = 'locality'
);
SET @locality_alter_sql = IF(
  @locality_column_exists = 0,
  'ALTER TABLE hospitals ADD COLUMN locality VARCHAR(100) NOT NULL DEFAULT '''' AFTER longitude',
  'SELECT 1'
);
PREPARE locality_stmt FROM @locality_alter_sql;
EXECUTE locality_stmt;
DEALLOCATE PREPARE locality_stmt;

SET @specialties_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'smart_ambulance'
    AND TABLE_NAME = 'hospitals'
    AND COLUMN_NAME = 'specialties'
);
SET @specialties_alter_sql = IF(
  @specialties_column_exists = 0,
  'ALTER TABLE hospitals ADD COLUMN specialties VARCHAR(255) NOT NULL DEFAULT ''emergency'' AFTER locality',
  'SELECT 1'
);
PREPARE specialties_stmt FROM @specialties_alter_sql;
EXECUTE specialties_stmt;
DEALLOCATE PREPARE specialties_stmt;

SET @load_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'smart_ambulance'
    AND TABLE_NAME = 'hospitals'
    AND COLUMN_NAME = 'current_load_percent'
);
SET @load_alter_sql = IF(
  @load_column_exists = 0,
  'ALTER TABLE hospitals ADD COLUMN current_load_percent INT NOT NULL DEFAULT 50 AFTER specialties',
  'SELECT 1'
);
PREPARE load_stmt FROM @load_alter_sql;
EXECUTE load_stmt;
DEALLOCATE PREPARE load_stmt;

SET @available_beds_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'smart_ambulance'
    AND TABLE_NAME = 'hospitals'
    AND COLUMN_NAME = 'available_beds'
);
SET @available_beds_alter_sql = IF(
  @available_beds_column_exists = 0,
  'ALTER TABLE hospitals ADD COLUMN available_beds INT NOT NULL DEFAULT 20 AFTER current_load_percent',
  'SELECT 1'
);
PREPARE beds_stmt FROM @available_beds_alter_sql;
EXECUTE beds_stmt;
DEALLOCATE PREPARE beds_stmt;

SET @total_beds_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'smart_ambulance'
    AND TABLE_NAME = 'hospitals'
    AND COLUMN_NAME = 'total_beds'
);
SET @total_beds_alter_sql = IF(
  @total_beds_column_exists = 0,
  'ALTER TABLE hospitals ADD COLUMN total_beds INT NOT NULL DEFAULT 100 AFTER available_beds',
  'SELECT 1'
);
PREPARE total_beds_stmt FROM @total_beds_alter_sql;
EXECUTE total_beds_stmt;
DEALLOCATE PREPARE total_beds_stmt;

SET @created_at_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'smart_ambulance'
    AND TABLE_NAME = 'hospitals'
    AND COLUMN_NAME = 'created_at'
);
SET @created_at_alter_sql = IF(
  @created_at_column_exists = 0,
  'ALTER TABLE hospitals ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER total_beds',
  'SELECT 1'
);
PREPARE created_at_stmt FROM @created_at_alter_sql;
EXECUTE created_at_stmt;
DEALLOCATE PREPARE created_at_stmt;

CREATE TABLE IF NOT EXISTS ambulances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ambulance_code VARCHAR(50) NOT NULL UNIQUE,
  hospital_name VARCHAR(100) NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ambulance_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_lat DECIMAL(10, 7) NOT NULL,
  user_lng DECIMAL(10, 7) NOT NULL,
  ambulance_id INT NOT NULL,
  eta_minutes INT NOT NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ambulance
    FOREIGN KEY (ambulance_id) REFERENCES ambulances(id)
);

INSERT INTO service_areas (area_name, center_lat, center_lng, coverage_radius_km, city_name)
VALUES
  ('Indiranagar', 12.9784, 77.6408, 5.00, 'Bengaluru'),
  ('MG Road', 12.9756, 77.6050, 5.00, 'Bengaluru'),
  ('Koramangala', 12.9352, 77.6245, 5.00, 'Bengaluru'),
  ('Hebbal', 13.0358, 77.5970, 5.00, 'Bengaluru'),
  ('Marathahalli', 12.9569, 77.7011, 5.00, 'Bengaluru'),
  ('Bannerghatta Road', 12.8933, 77.5970, 5.00, 'Bengaluru'),
  ('Whitefield', 12.9698, 77.7499, 5.00, 'Bengaluru'),
  ('Electronic City', 12.8456, 77.6603, 5.00, 'Bengaluru'),
  ('Yeshwanthpur', 13.0220, 77.5546, 5.00, 'Bengaluru'),
  ('Jayanagar', 12.9250, 77.5938, 5.00, 'Bengaluru'),
  ('Rajajinagar', 12.9917, 77.5562, 5.00, 'Bengaluru'),
  ('HSR Layout', 12.9116, 77.6474, 5.00, 'Bengaluru')
ON DUPLICATE KEY UPDATE
  center_lat = VALUES(center_lat),
  center_lng = VALUES(center_lng),
  coverage_radius_km = VALUES(coverage_radius_km),
  city_name = VALUES(city_name);

INSERT INTO hospitals (
  hospital_name,
  latitude,
  longitude,
  locality,
  specialties,
  current_load_percent,
  available_beds,
  total_beds
)
VALUES
  ('Cloudnine Hospital Indiranagar', 12.9712, 77.6412, 'Indiranagar', 'emergency,maternity,pediatric,nicu', 38, 34, 90),
  ('Manipal Hospital Old Airport Road', 12.9580, 77.6490, 'Indiranagar', 'emergency,stroke,neuro,icu', 54, 48, 120),
  ('Hosmat Hospital Trinity', 12.9629, 77.6011, 'MG Road', 'emergency,trauma,orthopedic,icu', 64, 28, 95),
  ('Bowring Medical Center', 12.9849, 77.6035, 'MG Road', 'emergency,cardiac,trauma,icu', 47, 38, 100),
  ('St. John Medical College Hospital', 12.9348, 77.6205, 'Koramangala', 'emergency,trauma,icu', 49, 44, 135),
  ('Apollo Spectra Koramangala', 12.9340, 77.6262, 'Koramangala', 'emergency,cardiac,trauma,icu', 51, 26, 85),
  ('Aster CMI Hospital', 13.0456, 77.5930, 'Hebbal', 'emergency,cardiac,pulmonary,icu', 43, 52, 125),
  ('Columbia Asia Hebbal', 13.0253, 77.5939, 'Hebbal', 'emergency,cardiac,stroke,icu', 52, 42, 105),
  ('Sakra World Hospital', 12.9276, 77.6846, 'Marathahalli', 'emergency,trauma,cardiac,pulmonary,icu', 58, 40, 130),
  ('Marathahalli Lifecare Hospital', 12.9597, 77.6974, 'Marathahalli', 'emergency,pulmonary,icu', 46, 29, 88),
  ('Fortis Hospital Bannerghatta', 12.9347, 77.6112, 'Bannerghatta Road', 'emergency,cardiac,trauma,icu,cathlab', 61, 32, 110),
  ('Apollo Bannerghatta Institute', 12.8894, 77.5963, 'Bannerghatta Road', 'emergency,cardiac,stroke,icu', 56, 35, 112),
  ('Vydehi Hospital Whitefield', 12.9754, 77.7278, 'Whitefield', 'emergency,trauma,cardiac,icu', 48, 41, 126),
  ('Manipal Whitefield Clinic', 12.9691, 77.7490, 'Whitefield', 'emergency,pediatric,icu', 42, 24, 80),
  ('Electronic City Multispeciality', 12.8492, 77.6658, 'Electronic City', 'emergency,cardiac,pulmonary,icu', 45, 37, 102),
  ('Springleaf Electronic City Hospital', 12.8424, 77.6626, 'Electronic City', 'emergency,trauma,icu', 40, 30, 92),
  ('People Tree Yeshwanthpur', 13.0096, 77.5533, 'Yeshwanthpur', 'emergency,cardiac,stroke,icu', 53, 39, 114),
  ('Ramaiah Memorial West Campus', 13.0170, 77.5568, 'Yeshwanthpur', 'emergency,trauma,icu', 44, 34, 96),
  ('Jayanagar General Hospital', 12.9251, 77.5930, 'Jayanagar', 'emergency,cardiac,pulmonary,icu', 50, 33, 99),
  ('Sagar Hospitals Jayanagar', 12.9181, 77.5968, 'Jayanagar', 'emergency,stroke,neuro,icu', 55, 28, 94),
  ('Rajajinagar Emergency Center', 12.9919, 77.5550, 'Rajajinagar', 'emergency,trauma,orthopedic,icu', 46, 36, 98),
  ('Suguna Rajajinagar Hospital', 12.9951, 77.5497, 'Rajajinagar', 'emergency,cardiac,icu', 52, 27, 87),
  ('Narayana HSR Clinic', 12.9125, 77.6448, 'HSR Layout', 'emergency,cardiac,icu', 41, 31, 93),
  ('Greenview HSR Hospital', 12.9147, 77.6389, 'HSR Layout', 'emergency,maternity,pediatric,icu', 39, 29, 84)
ON DUPLICATE KEY UPDATE
  latitude = VALUES(latitude),
  longitude = VALUES(longitude),
  locality = VALUES(locality),
  specialties = VALUES(specialties),
  current_load_percent = VALUES(current_load_percent),
  available_beds = VALUES(available_beds),
  total_beds = VALUES(total_beds);

INSERT INTO ambulances (ambulance_code, hospital_name, latitude, longitude, is_available)
VALUES
  ('AMB-IND-01', 'Cloudnine Hospital Indiranagar', 12.9724, 77.6394, 1),
  ('AMB-IND-02', 'Manipal Hospital Old Airport Road', 12.9601, 77.6468, 1),
  ('AMB-MGR-01', 'Hosmat Hospital Trinity', 12.9642, 77.6034, 1),
  ('AMB-MGR-02', 'Bowring Medical Center', 12.9833, 77.6061, 1),
  ('AMB-KOR-01', 'St. John Medical College Hospital', 12.9365, 77.6217, 1),
  ('AMB-KOR-02', 'Apollo Spectra Koramangala', 12.9328, 77.6278, 1),
  ('AMB-HEB-01', 'Aster CMI Hospital', 13.0441, 77.5947, 1),
  ('AMB-HEB-02', 'Columbia Asia Hebbal', 13.0237, 77.5958, 1),
  ('AMB-MAR-01', 'Sakra World Hospital', 12.9291, 77.6861, 1),
  ('AMB-MAR-02', 'Marathahalli Lifecare Hospital', 12.9582, 77.6991, 1),
  ('AMB-BGR-01', 'Fortis Hospital Bannerghatta', 12.9331, 77.6093, 1),
  ('AMB-BGR-02', 'Apollo Bannerghatta Institute', 12.8882, 77.5948, 1),
  ('AMB-WHT-01', 'Vydehi Hospital Whitefield', 12.9737, 77.7312, 1),
  ('AMB-WHT-02', 'Manipal Whitefield Clinic', 12.9708, 77.7473, 1),
  ('AMB-ELC-01', 'Electronic City Multispeciality', 12.8486, 77.6643, 1),
  ('AMB-ELC-02', 'Springleaf Electronic City Hospital', 12.8441, 77.6611, 1),
  ('AMB-YES-01', 'People Tree Yeshwanthpur', 13.0103, 77.5516, 1),
  ('AMB-YES-02', 'Ramaiah Memorial West Campus', 13.0155, 77.5586, 1),
  ('AMB-JAY-01', 'Jayanagar General Hospital', 12.9242, 77.5916, 1),
  ('AMB-JAY-02', 'Sagar Hospitals Jayanagar', 12.9173, 77.5982, 1),
  ('AMB-RAJ-01', 'Rajajinagar Emergency Center', 12.9927, 77.5534, 1),
  ('AMB-RAJ-02', 'Suguna Rajajinagar Hospital', 12.9943, 77.5510, 1),
  ('AMB-HSR-01', 'Narayana HSR Clinic', 12.9139, 77.6461, 1),
  ('AMB-HSR-02', 'Greenview HSR Hospital', 12.9131, 77.6407, 1)
ON DUPLICATE KEY UPDATE
  hospital_name = VALUES(hospital_name),
  latitude = VALUES(latitude),
  longitude = VALUES(longitude),
  is_available = VALUES(is_available);

WITH RECURSIVE global_latitudes AS (
  SELECT -90 AS lat_value
  UNION ALL
  SELECT lat_value + 10
  FROM global_latitudes
  WHERE lat_value < 90
),
global_longitudes AS (
  SELECT -180 AS lng_value
  UNION ALL
  SELECT lng_value + 10
  FROM global_longitudes
  WHERE lng_value < 180
)
INSERT INTO service_areas (area_name, center_lat, center_lng, coverage_radius_km, city_name)
SELECT
  CONCAT(
    'Global Area ',
    CASE WHEN lat_value >= 0 THEN 'N' ELSE 'S' END,
    LPAD(ABS(lat_value), 2, '0'),
    '_',
    CASE WHEN lng_value >= 0 THEN 'E' ELSE 'W' END,
    LPAD(ABS(lng_value), 3, '0')
  ) AS area_name,
  lat_value,
  lng_value,
  5.00,
  'Global Coverage'
FROM global_latitudes
CROSS JOIN global_longitudes
ON DUPLICATE KEY UPDATE
  center_lat = VALUES(center_lat),
  center_lng = VALUES(center_lng),
  coverage_radius_km = VALUES(coverage_radius_km),
  city_name = VALUES(city_name);

WITH RECURSIVE global_latitudes AS (
  SELECT -90 AS lat_value
  UNION ALL
  SELECT lat_value + 10
  FROM global_latitudes
  WHERE lat_value < 90
),
global_longitudes AS (
  SELECT -180 AS lng_value
  UNION ALL
  SELECT lng_value + 10
  FROM global_longitudes
  WHERE lng_value < 180
)
INSERT INTO hospitals (
  hospital_name,
  latitude,
  longitude,
  locality,
  specialties,
  current_load_percent,
  available_beds,
  total_beds
)
SELECT
  CONCAT(
    'Global Hospital ',
    CASE WHEN lat_value >= 0 THEN 'N' ELSE 'S' END,
    LPAD(ABS(lat_value), 2, '0'),
    '_',
    CASE WHEN lng_value >= 0 THEN 'E' ELSE 'W' END,
    LPAD(ABS(lng_value), 3, '0')
  ) AS hospital_name,
  ROUND(
    CASE
      WHEN lat_value >= 89.98 THEN 89.98
      WHEN lat_value <= -89.98 THEN -89.98
      ELSE lat_value + 0.0200
    END,
    7
  ) AS latitude,
  ROUND(
    CASE
      WHEN lng_value >= 179.98 THEN 179.98
      WHEN lng_value <= -179.98 THEN -179.98
      ELSE lng_value + 0.0200
    END,
    7
  ) AS longitude,
  CONCAT(
    'Global Area ',
    CASE WHEN lat_value >= 0 THEN 'N' ELSE 'S' END,
    LPAD(ABS(lat_value), 2, '0'),
    '_',
    CASE WHEN lng_value >= 0 THEN 'E' ELSE 'W' END,
    LPAD(ABS(lng_value), 3, '0')
  ) AS locality,
  CASE MOD(ABS(lat_value) + ABS(lng_value), 6)
    WHEN 0 THEN 'emergency,cardiac,icu'
    WHEN 1 THEN 'emergency,trauma,icu'
    WHEN 2 THEN 'emergency,stroke,neuro,icu'
    WHEN 3 THEN 'emergency,pediatric,nicu'
    WHEN 4 THEN 'emergency,maternity,icu'
    ELSE 'emergency,pulmonary,icu'
  END AS specialties,
  35 + MOD(ABS(lat_value) + ABS(lng_value), 45) AS current_load_percent,
  18 + MOD(ABS(lat_value) + ABS(lng_value), 22) AS available_beds,
  80 + MOD(ABS(lat_value) + ABS(lng_value), 60) AS total_beds
FROM global_latitudes
CROSS JOIN global_longitudes
ON DUPLICATE KEY UPDATE
  latitude = VALUES(latitude),
  longitude = VALUES(longitude),
  locality = VALUES(locality),
  specialties = VALUES(specialties),
  current_load_percent = VALUES(current_load_percent),
  available_beds = VALUES(available_beds),
  total_beds = VALUES(total_beds);

WITH RECURSIVE global_latitudes AS (
  SELECT -90 AS lat_value
  UNION ALL
  SELECT lat_value + 10
  FROM global_latitudes
  WHERE lat_value < 90
),
global_longitudes AS (
  SELECT -180 AS lng_value
  UNION ALL
  SELECT lng_value + 10
  FROM global_longitudes
  WHERE lng_value < 180
)
INSERT INTO ambulances (ambulance_code, hospital_name, latitude, longitude, is_available)
SELECT
  CONCAT(
    'AMB-GLB-',
    CASE WHEN lat_value >= 0 THEN 'N' ELSE 'S' END,
    LPAD(ABS(lat_value), 2, '0'),
    '-',
    CASE WHEN lng_value >= 0 THEN 'E' ELSE 'W' END,
    LPAD(ABS(lng_value), 3, '0')
  ) AS ambulance_code,
  CONCAT(
    'Global Hospital ',
    CASE WHEN lat_value >= 0 THEN 'N' ELSE 'S' END,
    LPAD(ABS(lat_value), 2, '0'),
    '_',
    CASE WHEN lng_value >= 0 THEN 'E' ELSE 'W' END,
    LPAD(ABS(lng_value), 3, '0')
  ) AS hospital_name,
  ROUND(lat_value, 7) AS latitude,
  ROUND(lng_value, 7) AS longitude,
  1 AS is_available
FROM global_latitudes
CROSS JOIN global_longitudes
ON DUPLICATE KEY UPDATE
  hospital_name = VALUES(hospital_name),
  latitude = VALUES(latitude),
  longitude = VALUES(longitude),
  is_available = VALUES(is_available);
