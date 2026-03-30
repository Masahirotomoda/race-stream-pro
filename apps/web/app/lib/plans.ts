import { createClient } from "@/app/lib/supabase/server";

export type Plan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price_per_15m: number;
  is_active: boolean;
};

export async function getPlans(): Promise<Plan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("price_per_15m", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPlan(key: string): Promise<Plan | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("key", key)
    .single();
  if (error) return null;
  return data;
}

/** 料金計算: 15分単価 × 15分ブロック数 */
export function calcPrice(plan: Plan, startAt: Date, endAt: Date): number {
  const ms = endAt.getTime() - startAt.getTime();
  const blocks = Math.ceil(ms / (15 * 60 * 1000));
  return plan.price_per_15m * blocks;
}
