import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { BarChart3, ClipboardCheck, FileText, LayoutDashboard, Settings, Users, type LucideIcon } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { IntakeProvider } from '@/components/intake/IntakeProvider'
import { QueueProvider, useQueue } from '@/hooks/useQueue'
import { cn } from '@/lib/utils'
import { DashboardPage } from '@/pages/DashboardPage'
import { PrescriptionsPage } from '@/pages/PrescriptionsPage'
import { PrescriptionPage } from '@/pages/PrescriptionPage'
import { PatientsPage } from '@/pages/PatientsPage'
import { ReviewsPage } from '@/pages/ReviewsPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

interface NavItem {
  to: string
  label: string
  Icon: LucideIcon
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/prescriptions', label: 'Prescriptions', Icon: FileText },
  { to: '/patients', label: 'Patients', Icon: Users },
  { to: '/reviews', label: 'Reviews', Icon: ClipboardCheck },
  { to: '/analytics', label: 'Analytics', Icon: BarChart3 },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

function Brand() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-ring">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-[13px] font-bold tracking-tight text-primary-foreground">Rx</span>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight">AutoScript</span>
        <span className="hidden text-[11px] text-muted-foreground sm:block">Prescription intake &amp; review</span>
      </span>
    </Link>
  )
}

function MainNav() {
  const { stats } = useQueue()
  const pending = stats?.pendingReview ?? 0
  return (
    <nav aria-label="Main navigation" className="no-scrollbar -mx-1 flex min-w-0 items-center gap-0.5 overflow-x-auto px-1">
      {NAV.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
              isActive && 'bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground',
            )
          }
        >
          <Icon className="size-4" aria-hidden />
          <span className="hidden md:inline">{label}</span>
          <span className="sr-only md:hidden">{label}</span>
          {to === '/reviews' && pending > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold tabular-nums text-amber-900" aria-label={`${pending} pending review`}>
              {pending}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function Shell() {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/80 bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <MainNav />
          <div className="hidden items-center gap-2 lg:flex">
            <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">JD</span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-medium">Dr. Jane Doe</span>
              <span className="text-[11px] text-muted-foreground">Clinical Pharmacist</span>
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/prescriptions" element={<PrescriptionsPage />} />
          <Route path="/prescriptions/:id" element={<PrescriptionPage />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Toaster position="bottom-right" richColors closeButton />
    </>
  )
}

export default function App() {
  return (
    <QueueProvider>
      <IntakeProvider>
        <Shell />
      </IntakeProvider>
    </QueueProvider>
  )
}
