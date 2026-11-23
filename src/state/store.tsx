import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { daysBetween, todayISO, weekDays } from '../domain/calc'
import { defaultSessions, defaultState } from '../domain/data'
import { assessWeek, readiness } from '../domain/risk'
import type { Readiness, RiskContext, WeekAssessment } from '../domain/risk'
import { sanitizeState } from '../domain/share'
import { isValidTeamCode, mergeDoc, normalizeTeamCode, sectionHashes, stampChanges, toDoc } from '../domain/sync'
import type { Stamps } from '../domain/sync'
import type { AppState } from '../domain/types'
import { fetchTeam, saveTeam, syncAvailable } from './remote'

const STORAGE_KEY = 'wod-war-room:v2'
const TEAM_KEY = 'wod-war-room:team'
const STAMPS_KEY = 'wod-war-room:stamps'

export type SyncStatus = 'off' | 'syncing' | 'ok' | 'offline' | 'error'

function loadTeam(): string {
  try {
    const code = normalizeTeamCode(window.localStorage.getItem(TEAM_KEY) ?? '')
    return syncAvailable && isValidTeamCode(code) ? code : ''
  } catch {
    return ''
  }
}

function loadStamps(): Stamps {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STAMPS_KEY) ?? '{}') as unknown
    const out: Stamps = {}
    if (typeof raw === 'object' && raw !== null) {
      for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function persist(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // stockage indisponible : la synchro continue en mémoire
  }
}

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
  /** Code de l'équipe synchronisée, ou chaîne vide. */
  teamCode: string
  syncStatus: SyncStatus
  lastSync: number | null
  joinTeam: (code: string) => void
  leaveTeam: () => void
  syncNow: () => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load)
  const [today, setToday] = useState(() => todayISO())
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [storageOk] = useState(storageAvailable)
  const timer = useRef<number | undefined>(undefined)

  // --- Synchronisation d'équipe ---
  const [teamCode, setTeamCode] = useState(loadTeam)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => (loadTeam() ? 'syncing' : 'off'))
  const [lastSync, setLastSync] = useState<number | null>(null)
  const stateRef = useRef(state)
  const codeRef = useRef(teamCode)
  const hashesRef = useRef<Record<string, string> | null>(null)
  const stampsRef = useRef<Stamps | null>(null)
  const busyRef = useRef(false)
  const dirtyRef = useRef(false)
  const debounceRef = useRef<number | undefined>(undefined)
  const cycleRef = useRef<() => void>(() => undefined)

  /** Un aller-retour : lire l'équipe, fusionner, renvoyer ce qui est plus récent ici. */
  const cycle = useCallback(async () => {
    const code = codeRef.current
    if (!code) return
    if (busyRef.current) {
      dirtyRef.current = true
      return
    }
    busyRef.current = true
    try {
      const remote = await fetchTeam(code)
      if (codeRef.current !== code) return
      const res = mergeDoc(stateRef.current, stampsRef.current ?? {}, remote?.doc ?? null)
      stampsRef.current = res.stamps
      persist(STAMPS_KEY, JSON.stringify(res.stamps))
      if (res.changed) {
        hashesRef.current = sectionHashes(res.state)
        stateRef.current = res.state
        setState(res.state)
      }
      if (res.needsPush) {
        const version = await saveTeam(code, toDoc(res.state, res.stamps), remote?.version ?? 0)
        // Refusé : un autre téléphone a écrit entre-temps, on refait un tour.
        if (version === null) dirtyRef.current = true
      }
      setSyncStatus('ok')
      setLastSync(Date.now())
    } catch {
      setSyncStatus(navigator.onLine === false ? 'offline' : 'error')
    } finally {
      busyRef.current = false
      if (dirtyRef.current) {
        dirtyRef.current = false
        window.setTimeout(() => cycleRef.current(), 600)
      }
    }
  }, [])

  useEffect(() => {
    cycleRef.current = () => void cycle()
  }, [cycle])

  useEffect(() => {
    save(state)
    stateRef.current = state
    if (!stampsRef.current) stampsRef.current = loadStamps()
    if (!hashesRef.current) {
      hashesRef.current = sectionHashes(state)
      return
    }
    // Chaque section modifiée ici reçoit l'heure de la modification.
    const res = stampChanges(hashesRef.current, state, stampsRef.current, Date.now())
    hashesRef.current = res.hashes
    if (!res.changed) return
    stampsRef.current = res.stamps
    persist(STAMPS_KEY, JSON.stringify(res.stamps))
    if (codeRef.current) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => cycleRef.current(), 700)
    }
  }, [state])

  useEffect(() => {
    codeRef.current = teamCode
    if (!teamCode) return
    const run = () => {
      if (document.visibilityState === 'visible') cycleRef.current()
    }
    run()
    const id = window.setInterval(run, 5000)
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', run)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', run)
    }
  }, [teamCode])

  const joinTeam = useCallback((input: string) => {
    const code = normalizeTeamCode(input)
    if (!syncAvailable || !isValidTeamCode(code)) return
    persist(TEAM_KEY, code)
    setSyncStatus('syncing')
    setTeamCode(code)
  }, [])

  const leaveTeam = useCallback(() => {
    persist(TEAM_KEY, null)
    setTeamCode('')
    setSyncStatus('off')
    setLastSync(null)
  }, [])

  const syncNow = useCallback(() => cycleRef.current(), [])

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
    teamCode,
    syncStatus,
    lastSync,
    joinTeam,
    leaveTeam,
    syncNow,
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

export type Page = 'dashboard' | 'wods' | 'builder' | 'guard' | 'strategy' | 'week' | 'team' | 'live' | 'import' | 'wod' | 'avis' | 'seance' | 'equipe'

const PAGES: Page[] = ['dashboard', 'wods', 'builder', 'guard', 'strategy', 'week', 'team', 'live', 'import', 'wod', 'avis', 'seance', 'equipe']

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
