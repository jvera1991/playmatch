export type UserRole = "player" | "owner" | "admin";
export type SportType = "futbol" | "padel" | "voley";
export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "completed";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  whatsapp_number: string | null;
  role: UserRole;
  is_approved_owner: boolean;
}

export interface Venue {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  address: string;
  city: string;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
}

export interface Court {
  id: string;
  venue_id: string;
  sport: SportType;
  name: string;
  description: string | null;
  price_per_hour: number;
  slot_duration_minutes: number;
  is_active: boolean;
}

export interface Booking {
  id: string;
  court_id: string;
  player_id: string;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  total_price: number;
  commission_rate: number;
  commission_amount: number;
  owner_payout_amount: number;
  wompi_transaction_id: string | null;
}
