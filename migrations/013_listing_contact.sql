-- Additive / nullable. Do not run remotely in this task.
-- listings.contact_method: 'whatsapp' | 'phone'
-- listings.contact_value: E.164
ALTER TABLE listings ADD COLUMN contact_method TEXT;
ALTER TABLE listings ADD COLUMN contact_value TEXT;
