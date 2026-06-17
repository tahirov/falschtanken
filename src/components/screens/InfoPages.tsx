// Customer-facing info & legal pages (German). Linked from the menu drawer.
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  MessagesSquare, BadgeEuro, Wrench, CreditCard, Smartphone, Banknote,
  Landmark, Phone, Mail, MapPin, Clock, Car, LifeBuoy,
} from 'lucide-react'
import { IMPRESSUM, DATENSCHUTZ, AGB } from '@/lib/legal'

function InfoLayout({ title, children, cta }: { title: string; children: React.ReactNode; cta?: boolean }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-y-auto px-5 py-5">
      <h1 className="font-heading text-xl font-bold mb-4">{title}</h1>
      {children}
      {cta && (
        <Button className="mt-5 w-full gap-2" size="lg" onClick={() => navigate('/')}>
          <LifeBuoy className="size-4" />
          Jetzt Hilfe anfordern
        </Button>
      )}
    </div>
  )
}

/** Render a plain-text legal blob into headings + paragraphs. */
function LegalBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className="space-y-3 pb-4">
      {blocks.map((b, i) => {
        const isHeading = !b.includes('\n') && (b.startsWith('§') || (b.length < 72 && !/[.,;:]$/.test(b)))
        return isHeading ? (
          <h2 key={i} className="font-heading text-sm font-semibold pt-2">{b}</h2>
        ) : (
          <p key={i} className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{b}</p>
        )
      })}
    </div>
  )
}

export function ImpressumPage() {
  return <InfoLayout title="Impressum"><LegalBody text={IMPRESSUM} /></InfoLayout>
}

export function DatenschutzPage() {
  return <InfoLayout title="Datenschutzerklärung"><LegalBody text={DATENSCHUTZ} /></InfoLayout>
}

export function AgbPage() {
  return <InfoLayout title="AGB"><LegalBody text={AGB} /></InfoLayout>
}

export function HowItWorksPage() {
  const steps = [
    { icon: MessagesSquare, title: 'Problem schildern', text: 'Beschreiben Sie Ihre Situation per Chat, Sprachnachricht oder Schritt für Schritt — optional mit Foto des Fahrzeugscheins.' },
    { icon: BadgeEuro, title: 'Festpreis erhalten', text: 'Sie bekommen sofort einen transparenten Festpreis inkl. Anfahrt — ohne versteckte Kosten.' },
    { icon: Car, title: 'Techniker kommt', text: 'Unser Techniker Ihsan wird benachrichtigt und macht sich auf den Weg. Sie sehen Live-Status und Ankunftszeit.' },
    { icon: Phone, title: 'Kontakt & Freigabe', text: 'Der Techniker meldet sich bei Ihnen und holt vor Beginn der Arbeiten Ihre Zustimmung ein — erst nach Ihrer Freigabe geht es los.' },
    { icon: Wrench, title: 'Gelöst & bezahlt', text: 'Vor Ort wird der falsche Kraftstoff abgepumpt und der richtige getankt. Bezahlt wird erst nach erledigter Arbeit.' },
  ]
  return (
    <InfoLayout title="So funktioniert's" cta>
      <div className="space-y-3">
        {steps.map((s, i) => {
          const Icon = s.icon
          return (
            <Card key={s.title} size="sm">
              <CardContent className="flex gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{i + 1}. {s.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.text}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </InfoLayout>
  )
}

export function PriceCalcPage() {
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums whitespace-nowrap">{value}</span>
    </div>
  )
  return (
    <InfoLayout title="So wird der Preis berechnet" cta>
      <p className="mb-4 text-sm text-muted-foreground">
        Unser Preis ist ein Festpreis und setzt sich transparent aus folgenden Bausteinen zusammen. Alle Preise verstehen sich netto zzgl. 19 % MwSt.
      </p>
      <div className="space-y-3">
        <Card size="sm">
          <CardContent className="space-y-2">
            <p className="text-sm font-semibold">Grundpreis (nach Anfahrt)</p>
            <Row label="bis 30 Min. Anfahrt" value="200 €" />
            <Row label="bis 60 Min. Anfahrt" value="300 €" />
            <Row label="je weitere 30 Min." value="+100 €" />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-2">
            <p className="text-sm font-semibold">Zeitzuschläge</p>
            <Row label="ab 18:00 Uhr" value="+50 €" />
            <Row label="ab 22:00 Uhr" value="+70 €" />
            <Row label="Wochenende" value="+90 €" />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-2">
            <p className="text-sm font-semibold">Leistung & Material</p>
            <Row label="Abpumpen & Entsorgung je Liter" value="2 €" />
            <Row label="Spülung Tank/Filter/Leitung" value="90 €" />
            <Row label="Lieferung Kraftstoff je Liter" value="2 €" />
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Auf die Summe kommen 19 % MwSt. Den genauen Festpreis sehen Sie vor der Bestätigung; die Endabrechnung erfolgt vor Ort.
        </p>
      </div>
    </InfoLayout>
  )
}

export function PaymentPage() {
  const methods = [
    { icon: CreditCard, text: 'Kartenzahlung vor Ort' },
    { icon: Smartphone, text: 'PayPal' },
    { icon: Landmark, text: 'Echtzeitüberweisung' },
    { icon: Banknote, text: 'Barzahlung' },
  ]
  return (
    <InfoLayout title="Zahlungsarten" cta>
      <p className="mb-4 text-sm text-muted-foreground">
        Die Zahlung erfolgt erst nach erledigter Arbeit, direkt vor Ort. Sie haben die Wahl:
      </p>
      <Card size="sm">
        <CardContent className="space-y-2.5">
          {methods.map((m) => {
            const Icon = m.icon
            return (
              <div key={m.text} className="flex items-center gap-3">
                <Icon className="size-4 text-muted-foreground shrink-0" />
                <span className="text-sm">{m.text}</span>
              </div>
            )
          })}
        </CardContent>
      </Card>
      <Card size="sm" className="mt-3">
        <CardContent className="space-y-1 text-sm">
          <p className="font-semibold">Bankverbindung</p>
          <p className="text-muted-foreground">PayPal: kontakt@falschgetankt.info</p>
          <p className="text-muted-foreground">Ihsan Gerçek · Commerzbank</p>
          <p className="text-muted-foreground tabular-nums">IBAN: DE42 3004 0000 0822 2416 00</p>
          <p className="text-muted-foreground">BIC: COBADEFFXXX</p>
        </CardContent>
      </Card>
    </InfoLayout>
  )
}

export function ContactPage() {
  return (
    <InfoLayout title="Kontakt" cta>
      <div className="space-y-3">
        <Card size="sm">
          <CardContent className="space-y-3 text-sm">
            <a href="tel:+4915222753000" className="flex items-center gap-3 text-foreground hover:underline">
              <Phone className="size-4 text-primary shrink-0" />
              +49 152 22 75 3000
            </a>
            <a href="mailto:kontakt@falschgetankt.info" className="flex items-center gap-3 text-foreground hover:underline">
              <Mail className="size-4 text-primary shrink-0" />
              kontakt@falschgetankt.info
            </a>
            <div className="flex items-start gap-3">
              <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-muted-foreground">IG-Trade24 GERMANY<br />Rheinische Str. 28<br />42781 Haan</span>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="size-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Rund um die Uhr erreichbar — 24/7</span>
            </div>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Einsatzgebiet: bis ca. 300 km rund um Haan (Großraum Düsseldorf/Köln und darüber hinaus).
        </p>
      </div>
    </InfoLayout>
  )
}
