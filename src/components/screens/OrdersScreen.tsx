import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw, MapPin, Car, Clock, Inbox, Loader2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { useAuthStore, fetchOrders } from '@/lib/auth'
import type { Order } from '@/lib/orders'

const severityClass: Record<string, string> = {
  low: 'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-red-100 text-red-800 border-red-200',
}

const statusClass: Record<string, string> = {
  requested: 'bg-blue-100 text-blue-800 border-blue-200',
  dispatched: 'bg-violet-100 text-violet-800 border-violet-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-gray-100 text-gray-700 border-gray-200',
}

export function OrdersScreen() {
  const navigate = useNavigate()
  const lang = useAppStore((s) => s.lang)
  const t = translations[lang].admin
  const session = useAuthStore((s) => s.session)

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Guard: no session => back to the funnel.
  useEffect(() => {
    if (!session) navigate('/', { replace: true })
  }, [session, navigate])

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(false)
    const { orders: data, error: err } = await fetchOrders(session.token)
    if (err) setError(true)
    else setOrders(data)
    setLoading(false)
  }, [session])

  useEffect(() => {
    load()
  }, [load])

  function formatDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleString(lang, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (!session) return null

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <p className="text-sm text-muted-foreground">
          {loading ? t.loading : t.ordersSubtitle(orders.length)}
        </p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t.refresh}
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {loading && orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <p className="text-sm">{t.ordersError}</p>
            <Button variant="outline" size="sm" onClick={load}>{t.refresh}</Button>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Inbox className="size-8" />
            <p className="text-sm">{t.ordersEmpty}</p>
          </div>
        ) : (
          orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{order.situation || '—'}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Clock className="size-3 shrink-0" />
                      {formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-heading font-bold text-sm">
                      {order.price != null ? `€${order.price}` : '—'}
                    </span>
                    {order.severity && (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${severityClass[order.severity]}`}>
                        {t.severity[order.severity]}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2 space-y-1">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                    <Car className="size-3 shrink-0" />
                    <span className="truncate">{order.vehicle || '—'}</span>
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate">{order.location || '—'}</span>
                  </p>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClass[order.status] ?? statusClass.requested}`}>
                    {t.status[order.status]}
                  </span>
                  {order.litres && (
                    <span className="text-xs text-muted-foreground">{order.litres}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
