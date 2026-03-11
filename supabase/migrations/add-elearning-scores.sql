-- Track learner scores per course (best score, last score, attempts)
CREATE TABLE IF NOT EXISTS elearning_course_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES elearning_courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  best_score INTEGER NOT NULL DEFAULT 0,        -- best total points
  best_chapter_pct INTEGER NOT NULL DEFAULT 0,  -- best avg chapter quiz %
  best_final_pct INTEGER NOT NULL DEFAULT 0,    -- best final exam %
  last_score INTEGER NOT NULL DEFAULT 0,
  last_chapter_pct INTEGER NOT NULL DEFAULT 0,
  last_final_pct INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(course_id, user_id)
);

ALTER TABLE elearning_course_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage their own scores"
  ON elearning_course_scores
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all scores"
  ON elearning_course_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
