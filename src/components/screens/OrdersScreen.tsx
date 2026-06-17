import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  RefreshCw, MapPin, Car, Clock, Inbox, Loader2, ChevronDown, Check,
  Search, User, Phone, ArrowUpDown, ListFilter, X, FileText, ExternalLink, LogOut,
  Euro, Truck, CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'
import { translations } from '@/lib/i18n'
import { useAuthStore, fetchOrders, updateOrderStatus, adminLogout } from '@/lib/auth'
import type { Order, OrderStatus } from '@/lib/orders'

type AdminT = (typeof translations)[keyof typeof translations]['admin']
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
const statusBar: Record<string, string> = {
  requested: 'bg-blue-500',
  dispatched: 'bg-violet-500',
  completed: 'bg-green-500',
  cancelled: 'bg-gray-400',
}

/** Status pill that opens a dropdown to change the order status. */
function StatusControl({ order, t, onChange }: { order: Order; t: AdminT; onChange: (id: string, s: OrderStatus) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80 ${statusClass[order.status] ?? statusClass.requested}`}
          />
        }
      >
        {t.status[order.status]}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {STATUSES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => onChange(order.id, s)}>
            <span className="flex-1">{t.status[s]}</span>
            {order.status === s && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex gap-4">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words font-medium">{value}</span>
    </div>
  )
}

export function OrdersScreen() {
  const lang = useAppStore((s) => s.lang)
  const t = translations[lang].admin
  const session = useAuthStore((s) => s.session)
  const setSession = useAuthStore((s) => s.setSession)

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortKey>('newest')
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  // Open the Fahrzeugschein: image in a modal, PDF in a new tab.
  function openDoc(url: string) {
    if (/\.pdf($|\?)/i.test(url)) window.open(url, '_blank')
    else setDocUrl(url)
  }

  const sortLabels: Record<SortKey, string> = {
    newest: t.sortNewest, oldest: t.sortOldest, priceHigh: t.sortPriceHigh, priceLow: t.sortPriceLow,
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = orders
    if (statusFilter !== 'all') list = list.filter((o) => o.status === statusFilter)
    if (q) {
      list = list.filter((o) =>
        [o.situation, o.vehicle, o.location, o.contact_name, o.contact_phone].some((f) => (f ?? '').toLowerCase().includes(q)),
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

  // Dashboard stats over ALL orders (not the filtered view).
  const stats = useMemo(() => {
    const byStatus: Record<string, number> = { requested: 0, dispatched: 0, completed: 0, cancelled: 0 }
    let revenue = 0
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1
      if (o.status === 'completed' || o.status === 'dispatched') revenue += o.price ?? 0
    }
    const now = new Date()
    const days: { label: string; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(now.getDate() - i)
      const next = new Date(d); next.setDate(d.getDate() + 1)
      const count = orders.filter((o) => { const ts = new Date(o.created_at); return ts >= d && ts < next }).length
      days.push({ label: d.toLocaleDateString(lang, { weekday: 'short' }), count })
    }
    const maxDay = Math.max(1, ...days.map((d) => d.count))
    return { total: orders.length, byStatus, revenue, days, maxDay }
  }, [orders, lang])

  async function handleLogout() {
    if (session) await adminLogout(session.token)
    setSession(null)
  }

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true); setError(false)
    const { orders: data, error: err } = await fetchOrders(session.token)
    if (err) setError(true); else setOrders(data)
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  async function handleStatusChange(orderId: string, status: OrderStatus) {
    if (!session) return
    const prev = orders
    setOrders((list) => list.map((o) => (o.id === orderId ? { ...o, status } : o)))
    const { error: err } = await updateOrderStatus(session.token, orderId, status)
    if (err) { setOrders(prev); toast.error(t.ordersError) }
  }

  function formatDate(iso: string): string {
    const rel: Record<string, { today: string; yesterday: string }> = {
      de: { today: 'Heute', yesterday: 'Gestern' },
      en: { today: 'Today', yesterday: 'Yesterday' },
      pl: { today: 'Dziś', yesterday: 'Wczoraj' },
    }
    const labels = rel[lang] ?? rel.de
    const d = new Date(iso)
    const time = d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
    const startDay = new Date(d); startDay.setHours(0, 0, 0, 0)
    const diff = Math.round((startToday.getTime() - startDay.getTime()) / 86_400_000)
    if (diff === 0) return `${labels.today}, ${time}`
    if (diff === 1) return `${labels.yesterday}, ${time}`
    const sameYear = d.getFullYear() === startToday.getFullYear()
    const date = d.toLocaleDateString(lang, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })
    return `${date}, ${time}`
  }

  if (!session) return null

  const detail = detailId ? orders.find((o) => o.id === detailId) ?? null : null

  const kpis = [
    { label: 'Aufträge gesamt', value: String(stats.total), icon: Inbox },
    { label: t.status.dispatched, value: String(stats.byStatus.dispatched), icon: Truck },
    { label: t.status.completed, value: String(stats.byStatus.completed), icon: CheckCircle2 },
    { label: 'Umsatz (aktiv)', value: `€${stats.revenue}`, icon: Euro },
  ]

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-muted">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl p-4 space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="font-heading text-lg font-bold">{t.ordersTitle}</h1>
              <p className="text-xs text-muted-foreground">
                {loading ? t.loading : t.resultsCount(visible.length, orders.length)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
                <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                {t.refresh}
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleLogout}>
                <LogOut className="size-3.5" />
                {t.logout}
              </Button>
            </div>
          </div>

          {loading && orders.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="size-6 animate-spin" /></div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-24 text-center text-muted-foreground">
              <p className="text-sm">{t.ordersError}</p>
              <Button variant="outline" size="sm" onClick={load}>{t.refresh}</Button>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {kpis.map((k) => {
                  const Icon = k.icon
                  return (
                    <Card key={k.label} size="sm">
                      <CardContent className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Icon className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-heading text-xl font-bold leading-none tabular-nums">{k.value}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{k.label}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Charts */}
              <div className="grid gap-3 lg:grid-cols-2">
                <Card size="sm">
                  <CardContent className="space-y-3">
                    <p className="text-sm font-semibold">Aufträge — letzte 7 Tage</p>
                    <div className="flex h-28 items-end gap-2">
                      {stats.days.map((d, i) => (
                        <div key={i} className="flex flex-1 flex-col items-center gap-1">
                          <div className="flex w-full flex-1 items-end">
                            <div
                              className="w-full rounded-t bg-primary/70"
                              style={{ height: `${Math.max((d.count / stats.maxDay) * 100, d.count ? 6 : 2)}%` }}
                              title={`${d.count}`}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{d.label}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardContent className="space-y-2.5">
                    <p className="text-sm font-semibold">Status-Verteilung</p>
                    {STATUSES.map((s) => {
                      const c = stats.byStatus[s] ?? 0
                      const pct = stats.total ? Math.round((c / stats.total) * 100) : 0
                      return (
                        <div key={s} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>{t.status[s]}</span>
                            <span className="text-muted-foreground tabular-nums">{c}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className={`h-full rounded-full ${statusBar[s]}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              </div>

              {/* Filters */}
              <Card size="sm">
                <CardContent className="space-y-2.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="h-9 pl-9 pr-9" />
                    {query && (
                      <button type="button" onClick={() => setQuery('')} aria-label="Clear" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="flex-1 justify-start gap-1.5 font-normal lg:flex-none lg:w-48" />}>
                        <ListFilter className="size-3.5 shrink-0" />
                        <span className="truncate">{statusFilter === 'all' ? t.filterAll : t.status[statusFilter]}</span>
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
                      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="flex-1 justify-start gap-1.5 font-normal lg:flex-none lg:w-48" />}>
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
                </CardContent>
              </Card>

              {/* Empty / results */}
              {orders.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                  <Inbox className="size-8" /><p className="text-sm">{t.ordersEmpty}</p>
                </div>
              ) : visible.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                  <Search className="size-8" /><p className="text-sm">{t.noResults}</p>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden overflow-x-auto rounded-xl border bg-card lg:block">
                    <table className="w-full min-w-[920px] text-sm">
                      <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          {['Datum', 'Situation', 'Fahrzeug', 'Standort', 'Kunde', 'Menge', 'Preis', 'Risiko', 'Status'].map((h) => (
                            <th key={h} className={`px-4 py-3 font-medium whitespace-nowrap ${h === 'Preis' ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((o) => (
                          <tr key={o.id} onClick={() => setDetailId(o.id)} className="cursor-pointer border-t hover:bg-muted/30">
                            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(o.created_at)}</td>
                            <td className="whitespace-nowrap px-4 py-3 font-medium">{o.situation || '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="line-clamp-2 max-w-[170px]">{o.vehicle || '—'}</span>
                                {o.vehicle_doc_url && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); openDoc(o.vehicle_doc_url!) }} title="Fahrzeugschein ansehen" className="text-primary hover:opacity-80">
                                    <FileText className="size-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground"><span className="line-clamp-2 max-w-[190px]">{o.location || '—'}</span></td>
                            <td className="px-4 py-3">
                              <span className="line-clamp-2 max-w-[150px]">{o.contact_name || '—'}</span>
                              {o.contact_phone && <a href={`tel:${o.contact_phone}`} onClick={(e) => e.stopPropagation()} className="text-xs text-primary hover:underline">{o.contact_phone}</a>}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground"><span className="line-clamp-2 max-w-[150px]">{o.litres || '—'}</span></td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{o.price != null ? `€${o.price}` : '—'}</td>
                            <td className="px-4 py-3">
                              {o.severity && (
                                <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${severityClass[o.severity]}`}>{t.severity[o.severity]}</span>
                              )}
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><StatusControl order={o} t={t} onChange={handleStatusChange} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="space-y-2.5 lg:hidden">
                    {visible.map((order) => (
                      <Card key={order.id} onClick={() => setDetailId(order.id)} className="cursor-pointer">
                        <CardContent className="p-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{order.situation || '—'}</p>
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="size-3 shrink-0" />{formatDate(order.created_at)}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="font-heading text-sm font-bold">{order.price != null ? `€${order.price}` : '—'}</span>
                              {order.severity && (
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${severityClass[order.severity]}`}>{t.severity[order.severity]}</span>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 space-y-1">
                            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><Car className="size-3 shrink-0" /><span className="truncate">{order.vehicle || '—'}</span></p>
                            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="size-3 shrink-0" /><span className="truncate">{order.location || '—'}</span></p>
                            {order.contact_name && <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><User className="size-3 shrink-0" /><span className="truncate">{order.contact_name}</span></p>}
                            {order.contact_phone && <a href={`tel:${order.contact_phone}`} onClick={(e) => e.stopPropagation()} className="flex w-fit min-w-0 items-center gap-1.5 text-xs text-primary hover:underline"><Phone className="size-3 shrink-0" /><span className="truncate">{order.contact_phone}</span></a>}
                          </div>
                          {order.vehicle_doc_url && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); openDoc(order.vehicle_doc_url!) }} className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                              <FileText className="size-3 shrink-0" /> Fahrzeugschein
                            </button>
                          )}
                          <div className="mt-2.5 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                            <StatusControl order={order} t={t} onChange={handleStatusChange} />
                            {order.litres && <span className="text-xs text-muted-foreground">{order.litres}</span>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Fahrzeugschein image preview modal */}
      <Dialog open={!!docUrl} onOpenChange={(o) => { if (!o) setDocUrl(null) }}>
        <DialogContent className="w-[94vw] max-w-[calc(100%-2rem)] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Fahrzeugschein</DialogTitle>
          </DialogHeader>
          {docUrl && (
            <div className="space-y-2">
              <img src={docUrl} alt="Fahrzeugschein" className="max-h-[78vh] w-full rounded-lg border object-contain bg-muted" />
              <a href={docUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="size-3.5" /> In neuem Tab öffnen
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Full order details modal (opened by clicking a row / card) */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetailId(null) }}>
        <DialogContent className="w-[94vw] max-w-2xl gap-4 p-6">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3 pr-6 text-lg">
                  <span className="min-w-0 break-words">{detail.situation || '—'}</span>
                  {detail.price != null && <span className="font-heading shrink-0">€{detail.price}</span>}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusControl order={detail} t={t} onChange={handleStatusChange} />
                  {detail.severity && (
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${severityClass[detail.severity]}`}>{t.severity[detail.severity]}</span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{formatDate(detail.created_at)}</span>
                </div>
                <div className="space-y-2 border-t pt-3.5">
                  <Field label="Fahrzeug" value={detail.vehicle} />
                  <Field label="Motor gestartet" value={detail.engine_started} />
                  <Field label="Menge" value={detail.litres} />
                  <Field label="Standort" value={detail.location} />
                  <Field label="Kunde" value={detail.contact_name} />
                  <Field
                    label="Telefon"
                    value={detail.contact_phone ? <a href={`tel:${detail.contact_phone}`} className="text-primary hover:underline">{detail.contact_phone}</a> : null}
                  />
                </div>
                {(detail.vehicle_doc || detail.vehicle_doc_url) && (
                  <div className="space-y-2 border-t pt-3.5">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><FileText className="size-3.5" /> Fahrzeugschein</p>
                    {detail.vehicle_doc && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {detail.vehicle_doc.kennzeichen && <span>Kennz.: {detail.vehicle_doc.kennzeichen}</span>}
                        {detail.vehicle_doc.marke && <span>{detail.vehicle_doc.marke} {detail.vehicle_doc.modell ?? ''}</span>}
                        {detail.vehicle_doc.kraftstoff && <span>{detail.vehicle_doc.kraftstoff}</span>}
                        {detail.vehicle_doc.erstzulassung && <span>EZ {detail.vehicle_doc.erstzulassung}</span>}
                        {detail.vehicle_doc.leistung_kw && <span>{detail.vehicle_doc.leistung_kw} kW</span>}
                        {detail.vehicle_doc.fin && <span>FIN {detail.vehicle_doc.fin}</span>}
                      </div>
                    )}
                    {detail.vehicle_doc_url && (
                      <button type="button" onClick={() => openDoc(detail.vehicle_doc_url!)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="size-3.5" /> Foto ansehen
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
