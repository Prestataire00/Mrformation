-- Add meeting_url column for video conference links (separate from physical location)
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS meeting_url TEXT;
