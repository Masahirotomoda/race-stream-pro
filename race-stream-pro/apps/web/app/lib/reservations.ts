import { createClient } from "@/app/lib/supabase/server";

export type Reservation = {
  id: string;
  user_id: string;
  name: string;
  plan_key: string;
  start_at: string;
  end_at: string;
  stream_url: string | null;
  obs_scene: string | null;
  notes: string | null;
  status: "pending" | "confirmed" | "cancelled";
  total_price: number;
  created_at: string;
  plans?: {
    name: string;
    price_per_15m: number;
  };
};

export type CreateReservationInput = {
  name: string;
  plan_key: string;
  start_at: string;
  end_at: string;
  stream_url?: string;
  obs_scene?: string;
  notes?: string;
  total_price: number;
};

export async function getReservations(userId: string): Promise<Reservation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*, plans(name, price_per_15m)")
    .eq("user_id", userId)
    .order("start_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getReservation(
  id: string,
  userId: string
): Promise<Reservation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*, plans(name, price_per_15m)")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error) return null;
  return data;
}

export async function createReservation(
  userId: string,
  input: CreateReservationInput
): Promise<Reservation> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .insert({ user_id: userId, ...input })
    .select("*, plans(name, price_per_15m)")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
