// Auto-generated types for the Roamies Supabase schema.
// Keep in sync with supabase/schema.sql.

export type TravelStatus = 'on_trip' | 'planning' | 'explorer' | 'home';
export type TripRole = 'planner' | 'contributor';
export type ExpenseCategory = 'food' | 'transport' | 'accommodation' | 'activity' | 'other';

export interface DbProfile {
  id: string;
  display_name: string | null;
  handle: string | null;
  location: string | null;
  travel_status: TravelStatus;
  avatar_url: string | null;
  updated_at: string;
}

export interface DbTrip {
  id: string;
  name: string;
  dates_label: string | null;
  accent_color: string;
  created_by: string;
  is_active: boolean;
  created_at: string;
}

export interface DbTripMember {
  trip_id: string;
  user_id: string;
  role: TripRole;
  display_color: string;
  joined_at: string;
}

export interface DbTripMemberWithProfile extends DbTripMember {
  profile: DbProfile | null;
}

export interface DbStop {
  id: string;
  trip_id: string;
  trip_date: string;         // ISO date string: 'YYYY-MM-DD'
  place_name: string;
  stop_time: string | null;  // '14:00'
  category: string;
  description: string | null;
  duration_minutes: number;
  cost: string | null;
  origin: string;
  pet_friendly: boolean;
  created_by: string | null;
  created_at: string;
}

export interface DbExpense {
  id: string;
  trip_id: string;
  title: string;
  amount_chf: number;
  paid_by: string;           // user UUID
  split_with: string[];      // array of user UUIDs
  category: ExpenseCategory;
  expense_date: string | null;
  created_at: string;
}

export interface DbAiMessage {
  id: string;
  trip_id: string;
  type: 'user' | 'ai' | 'ai_vote' | 'proactive';
  text: string | null;
  intro: string | null;
  options: { text: string }[] | null;
  sent_by: string | null;
  created_at: string;
}

export interface DbAiVote {
  id: string;
  message_id: string;
  user_id: string;
  option_idx: number;
  created_at: string;
}

export interface DbTripPhoto {
  id: string;
  trip_id: string;
  stop_id: string | null;
  trip_date: string;         // ISO date: 'YYYY-MM-DD'
  uploaded_by: string | null;
  storage_path: string;
  created_at: string;
}
