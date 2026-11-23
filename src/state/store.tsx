import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { daysBetween, todayISO, weekDays } from '../domain/calc'
import { defaultSessions, defaultState } from '../domain/data'
import { assessWeek, readiness } from '../domain/risk'
import type { Readiness, RiskContext, WeekAssessment } from '../domain/risk'
import { sanitizeState } from '../domain/share'
import type { AppState } from '../domain/types'

const STORAGE_KEY = 'wod-war-room:v2'

function load(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const state = sanitizeState(JSON.parse(raw))
      if (state) return state
    }
  } catch {
    // Stockage indisponible ou corrompu : on repart du plan par défaut.
  }
  // Premier lancement : la séance par défaut est placée aujourd'hui si possible.
  const state = defaultState()
  const today = todayISO()
  const days = weekDays(state.competitionDate).filter((d) => d !== state.competitionDate)
  if (days.includes(today) && today !== state.draftDate) {
    state.sessions = defaultSessions(state.competitionDate, today, state.athletes)
    state.draftDate = today
  }
  return state
}

function save(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Stockage indisponible : l'interface le signale (voir storageAvailable).
  }
}

function storageAvailable(): boolean {
  try {
    const probe = `${STORAGE_KEY}:probe`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

interface Store {
  state: AppState
  /** Modifie une copie de l'état ; la copie devient le nouvel état. */
  update: (mutate: (draft: AppState) => void) => void
  replace: (next: AppState) => void
  today: string
  /** Jours restants avant la compétition (négatif si passée). */
  daysOut: number
  week: WeekAssessment
  ready: Readiness
  ctxFor: (date: string) => RiskContext
  toast: (message: string) => void
  toastMessage: string | null
  storageOk: boolean
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load)
  const [today, setToday] = useState(() => todayISO())
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [storageOk] = useState(storageAvailable)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    save(state)
  }, [state])

  useEffect(() => {
    const refresh = () => setToday(todayISO())
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const update = useCallback((mutate: (draft: AppState) => void) => {
    setState((prev) => {
      const draft = structuredClone(prev)
      mutate(draft)
      return draft
    })
  }, [])

  const replace = useCallback((next: AppState) => setState(next), [])

  const toast = useCallback((message: string) => {
    setToastMessage(message)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToastMessage(null), 2600)
  }, [])

  const week = useMemo(
    () =>
      assessWeek({
        competitionDate: state.competitionDate,
        sessions: state.sessions,
        athletes: state.athletes,
        config: state.config,
      }),
    [state.competitionDate, state.sessions, state.athletes, state.config],
  )
  const ready = useMemo(() => readiness(week, state.athletes, state.config), [week, state.athletes, state.config])

  const ctxFor = useCallback(
    (date: string): RiskContext => ({
      daysOut: daysBetween(date, state.competitionDate),
      athletes: state.athletes,
      config: state.config,
    }),
    [state.competitionDate, state.athletes, state.config],
  )

  const value: Store = {
    state,
    update,
    replace,
    today,
    daysOut: daysBetween(today, state.competitionDate),
    week,
    ready,
    ctxFor,
    toast,
    toastMessage,
    storageOk,
  }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('StoreProvider manquant')
  return store
}

/** Jour d'entraînement par défaut : aujourd'hui s'il est dans la semaine, sinon le premier jour. */
export function defaultTrainingDay(competitionDate: string, today: string): string {
  const days = weekDays(competitionDate)
  return days.includes(today) ? today : days[0]
}

/** Jour de l'unique séance d'équipe : celui des parties planifiées, sinon aujourd'hui. */
export function useSessionDate(): string {
  const { state, today } = useStore()
  const days = weekDays(state.competitionDate).filter((d) => d !== state.competitionDate)
  const planned = state.sessions.find((s) => days.includes(s.date))
  if (planned) return planned.date
  if (days.includes(state.draftDate)) return state.draftDate
  return days.includes(today) ? today : days[0]
}

// ---------- Routage par hash (compatible GitHub Pages, aucun 404) ----------

export type Page = 'dashboard' | 'wods' | 'builder' | 'guard' | 'strategy' | 'week' | 'team' | 'live' | 'import' | 'wod' | 'avis' | 'seance'

const PAGES: Page[] = ['dashboard', 'wods', 'builder', 'guard', 'strategy', 'week', 'team', 'live', 'import', 'wod', 'avis', 'seance']

export interface Route {
  page: Page
  param: string
}

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  const slash = clean.indexOf('/')
  const head = slash === -1 ? clean : clean.slice(0, slash)
  const param = slash === -1 ? '' : clean.slice(slash + 1)
  const page = PAGES.includes(head as Page) ? (head as Page) : 'dashboard'
  return { page, param }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function go(page: Page, param = '', replaceHistory = false): void {
  const hash = `#/${page}${param ? `/${param}` : ''}`
  if (replaceHistory) {
    window.history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = hash
  }
}
