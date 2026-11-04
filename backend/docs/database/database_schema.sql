CREATE TABLE IF NOT EXISTS accounts_user (
    id BIGSERIAL PRIMARY KEY,
    password VARCHAR(128) NOT NULL,
    last_login TIMESTAMPTZ NULL,
    is_superuser BOOLEAN NOT NULL DEFAULT FALSE,
    username VARCHAR(150) NOT NULL UNIQUE,
    first_name VARCHAR(150) NOT NULL DEFAULT '',
    last_name VARCHAR(150) NOT NULL DEFAULT '',
    email VARCHAR(254) NOT NULL DEFAULT '',
    is_staff BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    date_joined TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    role VARCHAR(20) NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'manager', 'broker', 'agent', 'client')),
    phone_number VARCHAR(30) NOT NULL DEFAULT '',
    date_of_birth DATE NULL,
    address_line1 VARCHAR(255) NOT NULL DEFAULT '',
    address_line2 VARCHAR(255) NOT NULL DEFAULT '',
    city VARCHAR(120) NOT NULL DEFAULT '',
    province VARCHAR(120) NOT NULL DEFAULT '',
    postal_code VARCHAR(20) NOT NULL DEFAULT '',
    buyer_type VARCHAR(20) NOT NULL DEFAULT 'individual' CHECK (buyer_type IN ('individual', 'couple', 'investor', 'company')),
    preferred_contact_method VARCHAR(20) NOT NULL DEFAULT 'email' CHECK (preferred_contact_method IN ('email', 'phone', 'sms')),
    payment_card_number VARCHAR(19) NOT NULL DEFAULT '',
    payment_card_name VARCHAR(150) NOT NULL DEFAULT '',
    payment_card_expiry_month SMALLINT NULL CHECK (payment_card_expiry_month IS NULL OR payment_card_expiry_month BETWEEN 1 AND 12),
    payment_card_expiry_year SMALLINT NULL CHECK (payment_card_expiry_year IS NULL OR payment_card_expiry_year >= 0)
);

CREATE TABLE IF NOT EXISTS accounts_subdivision (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    blueprint_data TEXT NOT NULL DEFAULT '',
    blueprint_lots JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts_lot (
    id BIGSERIAL PRIMARY KEY,
    subdivision_id BIGINT NULL REFERENCES accounts_subdivision(id) ON DELETE CASCADE,
    block VARCHAR(50) NOT NULL,
    lot_number INTEGER NOT NULL CHECK (lot_number >= 0),
    area INTEGER NOT NULL CHECK (area >= 0),
    price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'pending', 'reserved', 'sold', 'unavailable', 'occupied')),
    polygon_points JSONB NOT NULL DEFAULT '[]'::jsonb,
    photo_data TEXT NOT NULL DEFAULT '',
    UNIQUE (subdivision_id, block, lot_number)
);

CREATE TABLE IF NOT EXISTS accounts_reservationrequest (
    id BIGSERIAL PRIMARY KEY,
    lot_id BIGINT NOT NULL REFERENCES accounts_lot(id) ON DELETE CASCADE,
    client_id BIGINT NOT NULL REFERENCES accounts_user(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by_id BIGINT NULL REFERENCES accounts_user(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS accounts_notification (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES accounts_user(id) ON DELETE CASCADE,
    reservation_request_id BIGINT NULL REFERENCES accounts_reservationrequest(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts_systemparameter (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(80) NOT NULL UNIQUE,
    label VARCHAR(120) NOT NULL,
    value VARCHAR(120) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts_saletransaction (
    id BIGSERIAL PRIMARY KEY,
    agent_id BIGINT NULL REFERENCES accounts_user(id) ON DELETE SET NULL,
    manager_id BIGINT NULL REFERENCES accounts_user(id) ON DELETE SET NULL,
    broker_id BIGINT NULL REFERENCES accounts_user(id) ON DELETE SET NULL,
    client_id BIGINT NULL REFERENCES accounts_user(id) ON DELETE SET NULL,
    lot_id BIGINT NULL REFERENCES accounts_lot(id) ON DELETE SET NULL,
    developer VARCHAR(120) NOT NULL DEFAULT '',
    project VARCHAR(120) NOT NULL,
    sale_date DATE NOT NULL,
    total_contract_price NUMERIC(12, 2) NOT NULL,
    agent_commission NUMERIC(12, 2) NOT NULL DEFAULT 0,
    manager_commission NUMERIC(12, 2) NOT NULL DEFAULT 0,
    broker_commission NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_by_id BIGINT NULL REFERENCES accounts_user(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts_houserecommendationhistory (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NULL REFERENCES accounts_user(id) ON DELETE SET NULL,
    reference_image_data TEXT NOT NULL,
    recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS accounts_lot_subdivision_id_idx ON accounts_lot(subdivision_id);
CREATE INDEX IF NOT EXISTS accounts_reservationrequest_lot_id_idx ON accounts_reservationrequest(lot_id);
CREATE INDEX IF NOT EXISTS accounts_reservationrequest_client_id_idx ON accounts_reservationrequest(client_id);
CREATE INDEX IF NOT EXISTS accounts_reservationrequest_reviewed_by_id_idx ON accounts_reservationrequest(reviewed_by_id);
CREATE INDEX IF NOT EXISTS accounts_notification_user_id_idx ON accounts_notification(user_id);
CREATE INDEX IF NOT EXISTS accounts_notification_reservation_request_id_idx ON accounts_notification(reservation_request_id);
CREATE INDEX IF NOT EXISTS accounts_saletransaction_agent_id_idx ON accounts_saletransaction(agent_id);
CREATE INDEX IF NOT EXISTS accounts_saletransaction_manager_id_idx ON accounts_saletransaction(manager_id);
CREATE INDEX IF NOT EXISTS accounts_saletransaction_broker_id_idx ON accounts_saletransaction(broker_id);
CREATE INDEX IF NOT EXISTS accounts_saletransaction_client_id_idx ON accounts_saletransaction(client_id);
CREATE INDEX IF NOT EXISTS accounts_saletransaction_lot_id_idx ON accounts_saletransaction(lot_id);
CREATE INDEX IF NOT EXISTS accounts_saletransaction_created_by_id_idx ON accounts_saletransaction(created_by_id);
CREATE INDEX IF NOT EXISTS accounts_houserecommendationhistory_user_id_idx ON accounts_houserecommendationhistory(user_id);
