import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  RefreshCw, MapPin, Car, Clock, Inbox, Loader2, ChevronDown, Check,
  Search, User, Phone, ArrowUpDown, ListFilter, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { useAuthStore, fetchOrders, updateOrderStatus } from '@/lib/auth'
import type { Order, OrderStatus } from '@/lib/orders'

const STATUSES: OrderStatus[] = ['requested', 'dispatched', 'completed', 'cancelled']

type StatusFilter = OrderStatus | 'all'
type SortKey = 'newest' | 'oldest' | 'priceHigh' | 'priceLow'
const SORT_KEYS: SortKey[] = ['newest', 'oldest', 'priceHigh', 'priceLow']

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

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortKey>('newest')

  const sortLabels: Record<SortKey, string> = {
    newest: t.sortNewest,
    oldest: t.sortOldest,
    priceHigh: t.sortPriceHigh,
    priceLow: t.sortPriceLow,
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = orders
    if (statusFilter !== 'all') list = list.filter((o) => o.status === statusFilter)
    if (q) {
      list = list.filter((o) =>
        [o.situation, o.vehicle, o.location, o.contact_name, o.contact_phone]
          .some((f) => (f ?? '').toLowerCase().includes(q)),
      )
    }
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return a.created_at.localeCompare(b.created_at)
        case 'priceHigh': return (b.price ?? 0) - (a.price ?? 0)
        case 'priceLow': return (a.price ?? 0) - (b.price ?? 0)
        default: return b.created_at.localeCompare(a.created_at)
      }
    })
  }, [orders, query, statusFilter, sortBy])

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

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    if (!session) return
    const prev = orders
    // Optimistic update; revert if the backend rejects it.
    setOrders((list) => list.map((o) => (o.id === orderId ? { ...o, status } : o)))
    const { error: err } = await updateOrderStatus(session.token, orderId, status)
    if (err) {
      setOrders(prev)
      toast.error(t.ordersError)
    }
  }

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
      <div className="px-4 py-3 border-b space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {loading ? t.loading : t.resultsCount(visible.length, orders.length)}
          </p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t.refresh}
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            className="pl-9 pr-9 h-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Filter + Sort */}
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="flex-1 justify-start gap-1.5 font-normal" />}
            >
              <ListFilter className="size-3.5 shrink-0" />
              <span className="truncate">
                {statusFilter === 'all' ? t.filterAll : t.status[statusFilter]}
              </span>
              <ChevronDown className="size-3.5 ml-auto shrink-0 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem onClick={() => setStatusFilter('all')}>
                <span className="flex-1">{t.filterAll}</span>
                {statusFilter === 'all' && <Check className="size-3.5 text-primary" />}
              </DropdownMenuItem>
              {STATUSES.map((s) => (
                <DropdownMenuItem key={s} onClick={() => setStatusFilter(s)}>
                  <span className="flex-1">{t.status[s]}</span>
                  {statusFilter === s && <Check className="size-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="flex-1 justify-start gap-1.5 font-normal" />}
            >
              <ArrowUpDown className="size-3.5 shrink-0" />
              <span className="truncate">{sortLabels[sortBy]}</span>
              <ChevronDown className="size-3.5 ml-auto shrink-0 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {SORT_KEYS.map((k) => (
                <DropdownMenuItem key={k} onClick={() => setSortBy(k)}>
                  <span className="flex-1">{sortLabels[k]}</span>
                  {sortBy === k && <Check className="size-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Search className="size-8" />
            <p className="text-sm">{t.noResults}</p>
          </div>
        ) : (
          visible.map((order) => (
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
                  {order.contact_name && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                      <User className="size-3 shrink-0" />
                      <span className="truncate">{order.contact_name}</span>
                    </p>
                  )}
                  {order.contact_phone && (
                    <a
                      href={`tel:${order.contact_phone}`}
                      className="flex items-center gap-1.5 text-xs text-primary min-w-0 w-fit hover:underline"
                    >
                      <Phone className="size-3 shrink-0" />
                      <span className="truncate">{order.contact_phone}</span>
                    </a>
                  )}
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 ${statusClass[order.status] ?? statusClass.requested}`}
                        />
                      }
                    >
                      {t.status[order.status]}
                      <ChevronDown className="size-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {STATUSES.map((s) => (
                        <DropdownMenuItem key={s} onClick={() => handleStatusChange(order.id, s)}>
                          <span className="flex-1">{t.status[s]}</span>
                          {order.status === s && <Check className="size-3.5 text-primary" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
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
