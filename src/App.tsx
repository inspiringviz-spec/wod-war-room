import { CalendarDays, Hammer, History, Home, Menu, Share2, ShieldCheck, Swords, Timer, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { dayName, shortDate } from './domain/calc'
import { decodeState, decodeWod } from './domain/share'
import { defaultTrainingDay, go, useRoute, useStore } from './state/store'
import type { Page } from './state/store'
import { Button, cx, LEVEL_BG, Notice, Sheet } from './ui/kit'
import { ShareSheet } from './components/ShareSheet'
import { WodView } from './components/WodView'
import { Builder } from './pages/Builder'
import { Dashboard } from './pages/Dashboard'
import { Guard } from './pages/Guard'
import { Live } from './pages/Live'
import { Strategy } from './pages/Strategy'
import { Team } from './pages/Team'
import { Week } from './pages/Week'
import { Wods } from './pages/Wods'

const NAV: { page: Page; label: string; short: string; icon: LucideIcon }[] = [
  { page: 'dashboard', label: 'Tableau de bord', short: 'Accueil', icon: Home },
  { page: 'week', label: 'Semaine de compétition', short: 'Semaine', icon: CalendarDays },
  { page: 'builder', label: 'Mini-WOD Builder', short: 'Builder', icon: Hammer },
  { page: 'live', label: 'Mode séance', short: 'Séance', icon: Timer },
  { page: 'team', label: 'Équipe et compétences', short: 'Équipe', icon: Users },
  { page: 'strategy', label: 'Stratégie d’équipe', short: 'Stratégie', icon: Swords },
  { page: 'guard', label: 'Fatigue Guard', short: 'Fatigue', icon: ShieldCheck },
  { page: 'wods', label: 'WODs de référence', short: 'WODs N-1', icon: History },
]

const MOBILE: Page[] = ['dashboard', 'week', 'builder', 'team']

function Logo() {
  return (
    <button type="button" onClick={() => go('dashboard')} className="flex items-center gap-2" aria-label="WOD War Room, retour à l'accueil">
      <span className="grid size-8 place-items-center rounded-lg bg-lime font-display text-lg leading-none font-bold text-bg">W</span>
      <span className="font-display text-xl leading-none font-bold tracking-[0.08em] uppercase">
        WOD <span className="text-lime">War Room</span>
      </span>
    </button>
  )
}

function ImportGate() {
  const route = useRoute()
  const { replace, update, toast, today, state } = useStore()
  const plan = useMemo(() => (route.page === 'import' ? decodeState(route.param) : null), [route.page, route.param])
  const wod = useMemo(() => (route.page === 'wod' ? decodeWod(route.param) : null), [route.page, route.param])
  const close = () => go('dashboard', '', true)

  if (route.page === 'import') {
    return (
      <Sheet open onClose={close} title="Plan partagé">
        {plan ? (
          <div className="space-y-3">
            <p className="text-sm leading-snug text-mute">
              Un coéquipier vous envoie son plan : {plan.sessions.length} séance{plan.sessions.length > 1 ? 's' : ''},
              compétition le {dayName(plan.competitionDate).toLowerCase()} {shortDate(plan.competitionDate).replace(/\.$/, '')}.
            </p>
            <ul className="space-y-1 rounded-xl bg-panel2 p-3 text-[13px]">
              {plan.sessions.slice(0, 8).map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <span className="truncate">{s.wod.name}</span>
                  <span className="shrink-0 text-dim">{dayName(s.date)}</span>
                </li>
              ))}
              <li className="border-t border-line pt-1 text-dim">Équipe : {plan.athletes.map((a) => a.name).join(', ')}</li>
            </ul>
            <Notice tone="amber">Charger ce plan remplace celui de ce téléphone (séances, profils, stratégie).</Notice>
            <div className="flex gap-2">
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  replace(plan)
                  toast('Plan chargé')
                  close()
                }}
              >
                Charger ce plan
              </Button>
              <Button onClick={close}>Garder le mien</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Notice tone="red">Ce lien est incomplet ou abîmé. Demandez à votre coéquipier de le renvoyer en entier.</Notice>
            <Button className="w-full" onClick={close}>
              Fermer
            </Button>
          </div>
        )}
      </Sheet>
    )
  }

  if (route.page === 'wod') {
    return (
      <Sheet open onClose={close} title="Mini-WOD partagé">
        {wod ? (
          <div className="space-y-3">
            <p className="font-semibold">{wod.name}</p>
            <WodView wod={wod} />
            <div className="flex gap-2 pt-1">
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  update((s) => {
                    s.draft = wod
                    s.draftSessionId = undefined
                    s.draftDate = defaultTrainingDay(state.competitionDate, today)
                  })
                  go('builder', '', true)
                }}
              >
                Ouvrir dans le builder
              </Button>
              <Button onClick={close}>Ignorer</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Notice tone="red">Ce lien est incomplet ou abîmé.</Notice>
            <Button className="w-full" onClick={close}>
              Fermer
            </Button>
          </div>
        )}
      </Sheet>
    )
  }
  return null
}

export default function App() {
  const route = useRoute()
  const { daysOut, week, toastMessage, storageOk } = useStore()
  const [share, setShare] = useState(false)
  const [more, setMore] = useState(false)
  const page: Page = route.page === 'import' || route.page === 'wod' ? 'dashboard' : route.page
  const countdown = daysOut > 0 ? `J-${daysOut}` : daysOut === 0 ? 'Jour J' : 'Terminé'

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-lime focus:px-3 focus:py-2 focus:text-bg">
        Aller au contenu
      </a>

      {/* Barre latérale (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-panel px-4 py-5 lg:flex">
        <Logo />
        <div className="mt-5 flex items-center justify-between rounded-2xl border border-line bg-bg px-3.5 py-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-dim uppercase">Compétition</p>
            <p className="font-display text-3xl leading-none font-bold text-lime uppercase">{countdown}</p>
          </div>
          <span className={cx('size-2.5 rounded-full', LEVEL_BG[week.level])} title="Niveau de la semaine" />
        </div>
        <nav aria-label="Navigation principale" className="mt-4 flex-1 space-y-1">
          {NAV.map((n) => (
            <button
              key={n.page}
              type="button"
              onClick={() => go(n.page)}
              aria-current={page === n.page ? 'page' : undefined}
              className={cx(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition',
                page === n.page ? 'bg-panel3 text-ink' : 'text-mute hover:bg-panel2 hover:text-ink',
              )}
            >
              <n.icon size={18} aria-hidden className={page === n.page ? 'text-lime' : ''} />
              {n.label}
            </button>
          ))}
        </nav>
        <Button onClick={() => setShare(true)}>
          <Share2 size={16} aria-hidden />
          Partager le plan
        </Button>
      </aside>

      {/* En-tête (mobile) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-lime/30 bg-lime/10 px-2.5 py-1 font-display text-base leading-none font-bold text-lime uppercase">{countdown}</span>
          <button type="button" onClick={() => setShare(true)} aria-label="Partager le plan" className="grid size-10 place-items-center rounded-full bg-panel2 text-mute hover:text-ink">
            <Share2 size={17} aria-hidden />
          </button>
        </div>
      </header>

      <main id="contenu" className="mx-auto w-full max-w-5xl px-4 pt-4 pb-28 sm:px-6 lg:pt-8 lg:pb-12">
        {!storageOk && (
          <Notice tone="amber" className="mb-4">
            Le stockage local est indisponible (navigation privée ?). Vos modifications seront perdues à la fermeture :
            utilisez le partage par lien ou l’export.
          </Notice>
        )}
        <div key={page} className="animate-rise">
          {page === 'dashboard' && <Dashboard />}
          {page === 'wods' && <Wods initial={route.param} />}
          {page === 'builder' && <Builder />}
          {page === 'guard' && <Guard />}
          {page === 'strategy' && <Strategy initial={route.param} />}
          {page === 'week' && <Week />}
          {page === 'team' && <Team />}
          {page === 'live' && <Live sessionId={route.param} />}
        </div>
      </main>

      {/* Navigation basse (mobile) */}
      <nav aria-label="Navigation principale" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.filter((n) => MOBILE.includes(n.page)).map((n) => (
            <li key={n.page}>
              <button
                type="button"
                onClick={() => go(n.page)}
                aria-current={page === n.page ? 'page' : undefined}
                className={cx('flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium', page === n.page ? 'text-lime' : 'text-mute')}
              >
                <n.icon size={21} aria-hidden />
                {n.short}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMore(true)}
              aria-haspopup="dialog"
              className={cx('flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium', !MOBILE.includes(page) ? 'text-lime' : 'text-mute')}
            >
              <Menu size={21} aria-hidden />
              Plus
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="Plus">
        <ul className="space-y-1.5">
          {NAV.filter((n) => !MOBILE.includes(n.page)).map((n) => (
            <li key={n.page}>
              <button
                type="button"
                onClick={() => {
                  setMore(false)
                  go(n.page)
                }}
                className={cx('flex w-full items-center gap-3 rounded-xl border px-3.5 py-3.5 text-left font-medium', page === n.page ? 'border-lime/40 bg-lime/8' : 'border-line bg-panel2')}
              >
                <n.icon size={20} aria-hidden className="text-lime" />
                {n.label}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                setMore(false)
                setShare(true)
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel2 px-3.5 py-3.5 text-left font-medium"
            >
              <Share2 size={20} aria-hidden className="text-lime" />
              Partager, exporter, importer
            </button>
          </li>
        </ul>
      </Sheet>

      <ShareSheet open={share} onClose={() => setShare(false)} />
      <ImportGate />

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-8">
        {toastMessage && (
          <div className="animate-rise rounded-full border border-line bg-panel3 px-4 py-2.5 text-sm font-medium shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
            {toastMessage}
          </div>
        )}
      </div>
    </div>
  )
}
