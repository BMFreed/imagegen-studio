-- Noise settings belong to exact installed checkpoint bytes. A null field keeps its
-- assumed historical default independently of the other user-selected setting.
CREATE TABLE checkpoint_noise_profile_override (
  sha256 TEXT NOT NULL CHECK (
    length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  rescale_betas_zero_snr INTEGER CHECK (rescale_betas_zero_snr IN (0, 1)),
  timestep_spacing TEXT CHECK (timestep_spacing IN ('leading', 'linspace', 'trailing')),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0),
  PRIMARY KEY (sha256, size_bytes)
) STRICT;
