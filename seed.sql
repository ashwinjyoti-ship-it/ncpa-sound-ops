-- NCPA Workflow Suite - Seed Data
-- Run after migrations

-- ============================================
-- CREW MEMBERS (from crew-assignment-automation)
-- ============================================

-- Senior Crew
INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('Naren', 'Senior', 1, 1, 0,
 '{"JBT": "Y", "Tata": "Y", "Experimental": "Y", "Little Theatre": "N", "Godrej Dance": "N", "Others": "Y"}',
 '{"Indian Music": "Y", "Intl Music": "Y*", "Western Music": "Y", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Special: Intl Music FOH');

INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('Nikhil', 'Senior', 1, 1, 0,
 '{"JBT": "Y*", "Tata": "Y*", "Experimental": "Y*", "Little Theatre": "Y", "Godrej Dance": "Y", "Others": "Y"}',
 '{"Indian Music": "Y", "Intl Music": "Y*", "Western Music": "Y", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Best for JBT/Tata/Exp. Special: Intl Music');

INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('Coni', 'Senior', 1, 0, 0,
 '{"JBT": "Y", "Tata": "Y", "Experimental": "Y", "Little Theatre": "Y", "Godrej Dance": "Y", "Others": "Y"}',
 '{"Indian Music": "Y", "Intl Music": "N", "Western Music": "Y", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Cannot FOH Intl Music');

INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('Sandeep', 'Senior', 1, 0, 0,
 '{"JBT": "N", "Tata": "N", "Experimental": "Y", "Little Theatre": "Y", "Godrej Dance": "Y", "Others": "Y"}',
 '{"Indian Music": "Y", "Intl Music": "N", "Western Music": "Y", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Cannot FOH Intl Music');

-- Mid Level Crew
INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('Aditya', 'Mid', 1, 0, 0,
 '{"JBT": "Y", "Tata": "Y", "Experimental": "Y", "Little Theatre": "Y", "Godrej Dance": "Y", "Others": "Y"}',
 '{"Indian Music": "Y*", "Intl Music": "N", "Western Music": "Y*", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Special: Indian/Western Music. No Intl');

INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('Viraj', 'Mid', 1, 0, 0,
 '{"JBT": "N", "Tata": "N", "Experimental": "Y", "Little Theatre": "Y", "Godrej Dance": "Y", "Others": "Y"}',
 '{"Indian Music": "Y", "Intl Music": "N", "Western Music": "N", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Cannot FOH Intl or Western');

INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('NS', 'Mid', 1, 0, 0,
 '{"JBT": "Y", "Tata": "Y", "Experimental": "Y", "Little Theatre": "Y", "Godrej Dance": "Y", "Others": "Y"}',
 '{"Indian Music": "Y", "Intl Music": "Y*", "Western Music": "Y", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Most flexible. Special: Intl Music');

INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('Nazar', 'Mid', 1, 0, 0,
 '{"JBT": "N", "Tata": "N", "Experimental": "Y", "Little Theatre": "Y", "Godrej Dance": "Y", "Others": "Y"}',
 '{"Indian Music": "Y", "Intl Music": "Exp only", "Western Music": "Y", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Intl Music FOH ONLY at Experimental');

INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('Shridhar', 'Mid', 1, 0, 0,
 '{"JBT": "N", "Tata": "N", "Experimental": "Y", "Little Theatre": "Y", "Godrej Dance": "Y", "Others": "Y"}',
 '{"Indian Music": "Y", "Intl Music": "N", "Western Music": "Y", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Not JBT/Tata. No Intl Music FOH');

-- Junior Crew
INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('Omkar', 'Junior', 1, 0, 0,
 '{"JBT": "N", "Tata": "N", "Experimental": "N", "Little Theatre": "Y", "Godrej Dance": "Y", "Others": "Y"}',
 '{"Indian Music": "Y", "Intl Music": "N", "Western Music": "Y", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Junior. No Intl Music FOH');

INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('Akshay', 'Junior', 1, 0, 0,
 '{"JBT": "N", "Tata": "N", "Experimental": "Y", "Little Theatre": "Y", "Godrej Dance": "Y", "Others": "Y"}',
 '{"Indian Music": "Y", "Intl Music": "N", "Western Music": "Y", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Junior. No Intl Music FOH');

-- Outside/Hired Crew
INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('OC1', 'Hired', 1, 0, 1,
 '{"JBT": "N", "Tata": "N", "Experimental": "N", "Little Theatre": "N", "Godrej Dance": "N", "Others": "N"}',
 '{"Indian Music": "Y", "Intl Music": "Y", "Western Music": "Y", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Outside Crew. Stage only.');

INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('OC2', 'Hired', 1, 0, 1,
 '{"JBT": "N", "Tata": "N", "Experimental": "N", "Little Theatre": "N", "Godrej Dance": "N", "Others": "N"}',
 '{"Indian Music": "Y", "Intl Music": "Y", "Western Music": "Y", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Outside Crew. Stage only.');

INSERT OR IGNORE INTO crew (name, level, can_stage, stage_only_if_urgent, is_outside_crew, venue_capabilities, vertical_capabilities, special_notes) VALUES
('OC3', 'Hired', 1, 0, 1,
 '{"JBT": "N", "Tata": "N", "Experimental": "N", "Little Theatre": "N", "Godrej Dance": "N", "Others": "N"}',
 '{"Indian Music": "Y", "Intl Music": "Y", "Western Music": "Y", "Theatre": "Y", "Corporate": "Y", "Library": "Y", "Dance": "Y", "Others": "Y"}',
 'Outside Crew. Stage only.');

-- ============================================
-- EQUIPMENT CATALOG (from quote-builder)
-- ============================================

INSERT OR IGNORE INTO equipment (name, category, rate_per_item) VALUES
('D&B M4 MONITORS (FLOOR)', 'Monitors', 2500),
('SENNHEISER G4 IN-EAR MONITORS', 'Monitors', 1500),
('SHURE SM58', 'Microphones', 300),
('SHURE SM57', 'Microphones', 300),
('SHURE SM81', 'Microphones', 550),
('SHURE BETA 98A', 'Microphones', 550),
('SHURE BETA 91A', 'Microphones', 550),
('SHURE BETA 52A', 'Microphones', 550),
('NEUMANN KM184', 'Microphones', 750),
('SENNHEISER GUN MICS', 'Microphones', 600),
('FLOOR MICS', 'Microphones', 500),
('AKG C411', 'Microphones', 500),
('GOOSENECK PODIUM MICS (SHURE)', 'Microphones', 1000),
('SENNHEISER E604 (DRUM KIT MICS)', 'Microphones', 550),
('SHURE WIRELESS ULXD SM58/HEADSET/LAPEL', 'Wireless', 1500),
('BSS DI BOX', 'DI Boxes', 250),
('2 TRACK RECORDING', 'Recording', 3000),
('MULTITRACK RECORDING', 'Recording', 12000),
('ALTAIR WIRELESS INTERCOMMS/BELTPACK', 'Intercomms', 2500);
