-- Mythic Pets Database Schema for Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (links to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pets table
CREATE TABLE IF NOT EXISTS pets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL, -- Using username as ID for now
  pet_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Economy table
CREATE TABLE IF NOT EXISTS economy (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT UNIQUE NOT NULL,
  gold INTEGER DEFAULT 0,
  gems INTEGER DEFAULT 0,
  potions INTEGER DEFAULT 0,
  transactions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Game state table (misc data like gather tasks, cooldowns)
CREATE TABLE IF NOT EXISTS game_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pets_user_id ON pets(user_id);
CREATE INDEX IF NOT EXISTS idx_economy_user_id ON economy(user_id);
CREATE INDEX IF NOT EXISTS idx_game_state_user_id ON game_state(user_id);

-- Row Level Security (RLS) - Allow users to only access their own data
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE economy ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;

-- Policy for profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- For simplified version (using username as ID), we'll allow public read/write
-- In production, you'd want to add proper auth checks
CREATE POLICY "Anyone can read pets" ON pets
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert pets" ON pets
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update pets" ON pets
  FOR UPDATE USING (true);

CREATE POLICY "Anyone can read economy" ON economy
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert economy" ON economy
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update economy" ON economy
  FOR UPDATE USING (true);

CREATE POLICY "Anyone can read game_state" ON game_state
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert game_state" ON game_state
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update game_state" ON game_state
  FOR UPDATE USING (true);

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
