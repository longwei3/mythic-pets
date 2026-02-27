import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseKey = supabasePublishableKey || supabaseAnonKey;

// Only create client if credentials are provided
export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Check if Supabase is configured
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// Database table types
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          updated_at?: string;
        };
      };
      pets: {
        Row: {
          id: string;
          user_id: string;
          pet_data: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          pet_data: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          pet_data?: Record<string, unknown>;
          updated_at?: string;
        };
      };
      economy: {
        Row: {
          id: string;
          user_id: string;
          gold: number;
          gems: number;
          potions: number;
          transactions: Record<string, unknown>[];
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          gold?: number;
          gems?: number;
          potions?: number;
          transactions?: Record<string, unknown>[];
          updated_at?: string;
        };
        Update: {
          gold?: number;
          gems?: number;
          potions?: number;
          transactions?: Record<string, unknown>[];
          updated_at?: string;
        };
      };
      game_state: {
        Row: {
          id: string;
          user_id: string;
          key: string;
          value: Record<string, unknown>;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          key: string;
          value: Record<string, unknown>;
          updated_at?: string;
        };
        Update: {
          value?: Record<string, unknown>;
          updated_at?: string;
        };
      };
    };
  };
}
