import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import type { Order, OrderStatus } from '@/lib/orders'

interface AdminSession {
  token: string
  username: string
  role: string
}

interface AuthState {
  session: AdminSession | null
  setSession: (s: AdminSession | null) => void
}

/** Admin session, persisted to localStorage so a refresh keeps you logged in. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
    }),
    { name: 'th24-admin-session' },
  ),
)

/** Verify credentials and open a session. Returns the session or an error. */
export async function adminLogin(
  username: string,
  password: string,
): Promise<{ session: AdminSession | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_login', {
    p_username: username,
    p_password: password,
  })
  if (error) return { session: null, error: error.message }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { session: null, error: 'invalid' }
  return { session: row as AdminSession, error: null }
}

/** Fetch the orders log for a logged-in admin. */
export async function fetchOrders(token: string): Promise<{ orders: Order[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_orders', { p_token: token })
  if (error) return { orders: [], error: error.message }
  return { orders: (data ?? []) as Order[], error: null }
}

/** Change an order's status (admin only). Returns the updated order. */
export async function updateOrderStatus(
  token: string,
  orderId: string,
  status: OrderStatus,
): Promise<{ order: Order | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_update_order_status', {
    p_token: token,
    p_order_id: orderId,
    p_status: status,
  })
  if (error) return { order: null, error: error.message }
  const row = Array.isArray(data) ? data[0] : data
  return { order: (row ?? null) as Order | null, error: null }
}

/** End the current session server-side. */
export async function adminLogout(token: string): Promise<void> {
  await supabase.rpc('admin_logout', { p_token: token })
}
