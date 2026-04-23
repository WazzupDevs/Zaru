-- UUID v7 (RFC 9562, draft-peabody-dispatch-new-uuid-format-04).
-- Time-ordered: improves Postgres B-tree index locality vs. random v4.
-- Existing rows / tables remain on gen_random_uuid() (see ADR 0006).
-- New tables created from now on declare:
--   id String @id @default(dbgenerated("uuidv7()")) @db.Uuid

CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms = substring(
    int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint)
    FROM 3
  );
  uuid_bytes = unix_ts_ms || gen_random_bytes(10);
  -- Set version (7) in byte 6's high nibble.
  uuid_bytes = set_byte(
    uuid_bytes,
    6,
    (b'0111' || get_byte(uuid_bytes, 6)::bit(4))::bit(8)::int
  );
  -- Set variant (10xx) in byte 8's high two bits.
  uuid_bytes = set_byte(
    uuid_bytes,
    8,
    (b'10' || get_byte(uuid_bytes, 8)::bit(6))::bit(8)::int
  );
  RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION uuidv7() IS
  'RFC 9562 UUID version 7 (time-ordered). Prefer over gen_random_uuid() for new tables.';
