import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Menu, ListChecks, Calculator, CreditCard, Mail, FileText, Shield, ScrollText, LifeBuoy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

// Customer-facing menu (German). Admin login lives at /admin, off this menu.
const SERVICE = [
  { to: '/so-funktioniert-es', label: "So funktioniert's", icon: ListChecks },
  { to: '/preisberechnung', label: 'Preisberechnung', icon: Calculator },
  { to: '/zahlung', label: 'Zahlungsarten', icon: CreditCard },
  { to: '/kontakt', label: 'Kontakt', icon: Mail },
]
const LEGAL = [
  { to: '/impressum', label: 'Impressum', icon: FileText },
  { to: '/datenschutz', label: 'Datenschutz', icon: Shield },
  { to: '/agb', label: 'AGB', icon: ScrollText },
]

export function AppMenu() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  function go(to: string) {
    setOpen(false)
    navigate(to)
  }

  const Item = ({ to, label, icon: Icon, primary }: { to: string; label: string; icon: React.ElementType; primary?: boolean }) => {
    const active = pathname === to
    const tone = active ? 'text-foreground' : primary ? 'text-primary' : 'text-muted-foreground'
    return (
      <Button
        variant="ghost"
        className={`w-full justify-start gap-3 ${active ? 'bg-muted font-medium' : `font-normal ${primary ? 'text-primary' : ''}`}`}
        onClick={() => go(to)}
      >
        <Icon className={`size-4 shrink-0 ${tone}`} />
        {label}
      </Button>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Menü" />}>
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] sm:w-[340px]">
        <SheetHeader>
          <SheetTitle>Tankhilfe24</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-2">
          <Item to="/" label="Hilfe anfordern" icon={LifeBuoy} primary />
          {SERVICE.map((i) => <Item key={i.to} {...i} />)}
          <div className="my-2 border-t" />
          <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">Rechtliches</p>
          {LEGAL.map((i) => <Item key={i.to} {...i} />)}
        </div>
      </SheetContent>
    </Sheet>
  )
}
