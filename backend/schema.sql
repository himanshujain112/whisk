CREATE TABLE IF NOT EXISTS files (
  code TEXT PRIMARY KEY,       -- The short code user enters
  file_key TEXT NOT NULL,      -- The unique path in R2
  filename TEXT NOT NULL,      -- Original name (e.g., 'resume.pdf')
  size INTEGER NOT NULL,       -- Bytes
  content_type TEXT NOT NULL,  -- MIME type
  is_downloaded BOOLEAN DEFAULT FALSE, -- Whether the file has been downloaded at least once
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);