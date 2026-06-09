
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'invoiced';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'dispatched';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'cancelled';
