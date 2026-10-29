-- Collaboration: people a plan is shared with, its invite link, and who is
-- in it right now. Live queries read these through Neon Realtime, which needs
-- a primary key on every table it watches.

-- Bumped on every write so concurrent editors can detect and merge conflicts.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES neon_auth."user"(id) ON DELETE SET NULL;

-- Everyone except the owner (plans.user_id) who can open and edit a plan.
CREATE TABLE IF NOT EXISTS plan_members (
  plan_id   uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, user_id)
);

CREATE INDEX IF NOT EXISTS plan_members_user_idx ON plan_members (user_id);

-- One invite link per plan. Anyone signed in who opens it joins as an editor.
CREATE TABLE IF NOT EXISTS plan_invites (
  plan_id     uuid PRIMARY KEY REFERENCES plans(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per open browser tab: its cursor on the floor plan and what it has selected.
CREATE TABLE IF NOT EXISTS plan_presence (
  plan_id     uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  session_id  text NOT NULL,
  user_id     uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL,
  view        text NOT NULL DEFAULT '2d' CHECK (view IN ('2d', '3d')),
  cursor_x    real,
  cursor_z    real,
  selection   jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, session_id)
);
