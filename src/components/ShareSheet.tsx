import { Cloud, Copy, Download, LogOut, RefreshCw, RotateCcw, Share2, Upload, UserPlus, WifiOff } from 'lucide-react'
import { useRef, useState } from 'react'
import { defaultState } from '../domain/data'
import { baseUrl, parseJSONState, planLink } from '../domain/share'
import { isValidTeamCode, newTeamCode, normalizeTeamCode } from '../domain/sync'
import { syncAvailable } from '../state/remote'
import { useStore } from '../state/store'
import type { SyncStatus } from '../state/store'
import { Button, cx, INPUT, Notice, Sheet } from '../ui/kit'

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** Partage natif si disponible (mobile), sinon copie du lien. */
export async function shareLink(title: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared'
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed'
}

const STATUS: Record<SyncStatus, { label: string; dot: string }> = {
  off: { label: 'Non connecté', dot: 'bg-dim' },
  syncing: { label: 'Connexion à l’équipe…', dot: 'bg-amber animate-pulse-soft' },
  ok: { label: 'Synchronisé', dot: 'bg-lime' },
  offline: { label: 'Hors ligne : vos modifications partiront au retour du réseau', dot: 'bg-amber' },
  error: { label: 'Serveur injoignable pour l’instant, nouvel essai automatique', dot: 'bg-red' },
}

export function teamInviteLink(code: string): string {
  return `${baseUrl()}#/equipe/${code}`
}

/** Synchronisation d'équipe : visible uniquement si un projet Supabase est configuré. */
function TeamSync() {
  const { teamCode, syncStatus, lastSync, joinTeam, leaveTeam, syncNow, toast } = useStore()
  const [input, setInput] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  if (!syncAvailable) return null
  const candidate = normalizeTeamCode(input)

  if (teamCode) {
    const status = STATUS[syncStatus]
    return (
      <div className="rounded-2xl border border-lime/30 bg-lime/6 p-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Cloud size={16} aria-hidden className="text-lime" />
          Équipe synchronisée
        </p>
        <p className="mt-1.5 flex items-start gap-2 text-[13px] leading-snug text-mute" aria-live="polite">
          <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', status.dot)} />
          <span>
            {status.label}
            {syncStatus === 'ok' && lastSync ? ` à ${new Date(lastSync).toLocaleTimeString('fr-FR')}` : ''}
          </span>
        </p>
        <p className="tabular mt-2 rounded-lg bg-bg px-3 py-2 text-center font-mono text-sm tracking-wider">{teamCode}</p>
        <p className="mt-2 text-[11px] leading-snug text-dim">
          Les avis, la séance et la stratégie se mettent à jour entre les téléphones en quelques secondes. Le lien d’invitation ne change jamais ; quiconque
          le reçoit peut lire et modifier le plan.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            className="col-span-2"
            onClick={async () => {
              const r = await shareLink('WOD War Room · rejoindre l’équipe', teamInviteLink(teamCode))
              toast(r === 'copied' ? 'Lien d’invitation copié' : r === 'shared' ? 'Invitation partagée' : 'Copie impossible')
            }}
          >
            <UserPlus size={16} aria-hidden />
            Inviter l’équipe
          </Button>
          <Button onClick={syncNow}>
            <RefreshCw size={15} aria-hidden />
            Actualiser
          </Button>
          {confirmLeave ? (
            <Button
              variant="danger"
              onClick={() => {
                leaveTeam()
                setConfirmLeave(false)
                toast('Synchronisation arrêtée sur ce téléphone')
              }}
            >
              Confirmer
            </Button>
          ) : (
            <Button onClick={() => setConfirmLeave(true)}>
              <LogOut size={15} aria-hidden />
              Quitter
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-line bg-panel2 p-3.5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Cloud size={16} aria-hidden className="text-lime" />
        Synchroniser l’équipe
      </p>
      <p className="mt-1 text-[13px] leading-snug text-mute">
        Un seul lien pour les trois téléphones : avis, séance et stratégie se mettent à jour tout seuls. Le plan de ce téléphone devient celui de l’équipe.
      </p>
      <Button
        variant="primary"
        className="mt-3 w-full"
        onClick={() => {
          joinTeam(newTeamCode())
          toast('Équipe créée : invitez les autres')
        }}
      >
        Créer l’équipe
      </Button>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!isValidTeamCode(candidate)) return
          joinTeam(candidate)
          setInput('')
        }}
      >
        <input
          type="text"
          aria-label="Code d'équipe"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ou saisir un code d’équipe"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={cx(INPUT, 'flex-1 font-mono text-[13px]')}
        />
        <Button type="submit" disabled={!isValidTeamCode(candidate)}>
          Rejoindre
        </Button>
      </form>
    </div>
  )
}

export function ShareSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, replace, update, toast, teamCode, leaveTeam } = useStore()
  const file = useRef<HTMLInputElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const link = open ? planLink(state) : ''

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wod-war-room-${state.competitionDate}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('Fichier exporté')
  }

  const importJSON = async (f: File | undefined) => {
    setError(null)
    if (!f) return
    const next = parseJSONState(await f.text())
    if (!next) {
      setError('Fichier illisible : ce n’est pas un export WOD War Room valide.')
      return
    }
    replace(next)
    toast('Plan importé')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Partager le plan">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-mute">Nom de l’équipe</span>
          <input
            type="text"
            value={state.teamName}
            maxLength={30}
            placeholder="Affiché en haut, à côté de WOD War Room"
            onChange={(e) => update((s) => { s.teamName = e.target.value })}
            className={cx(INPUT, 'font-semibold')}
          />
        </label>
        <TeamSync />
        {!teamCode && (
          <Notice>
            <span className="flex items-start gap-2">
              <WifiOff size={15} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                Sans équipe synchronisée, chaque téléphone garde sa propre copie : après une modification, renvoyez le lien.
              </span>
            </span>
          </Notice>
        )}

        <div>
          <p className="text-sm font-semibold">Lien du plan complet</p>
          <p className="mt-1 text-[13px] leading-snug text-mute">
            Séances, profils, compétences et stratégie sont contenus dans le lien lui-même, sans serveur. Quiconque
            reçoit le lien voit ces informations.
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              onClick={async () => {
                const r = await shareLink('WOD War Room · plan de la semaine', link)
                toast(r === 'copied' ? 'Lien copié' : r === 'shared' ? 'Lien partagé' : 'Copie impossible')
              }}
            >
              <Share2 size={16} aria-hidden />
              Partager
            </Button>
            <Button
              onClick={async () => toast((await copyText(link)) ? 'Lien copié' : 'Copie impossible')}
            >
              <Copy size={16} aria-hidden />
              Copier
            </Button>
          </div>
          <p className="tabular mt-1.5 text-[11px] text-dim">{link.length.toLocaleString('fr-FR')} caractères</p>
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-sm font-semibold">Fichier de sauvegarde</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Button onClick={exportJSON}>
              <Download size={16} aria-hidden />
              Exporter
            </Button>
            <Button onClick={() => file.current?.click()}>
              <Upload size={16} aria-hidden />
              Importer
            </Button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Importer un fichier JSON"
              onChange={(e) => {
                void importJSON(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          {error && (
            <Notice tone="red" className="mt-2.5">
              {error}
            </Notice>
          )}
        </div>

        <div className="border-t border-line pt-4">
          {confirmReset ? (
            <div className="rounded-xl border border-red/30 bg-red/8 p-3">
              <p className="text-[13px] leading-snug">
                Tout effacer sur ce téléphone (séance, profils, stratégie) et revenir au plan de départ ? Ce téléphone quitte aussi l’équipe synchronisée ; le plan des autres n’est pas touché.
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => {
                    // On quitte d'abord l'équipe : la remise à zéro ne doit pas écraser le plan des autres.
                    leaveTeam()
                    replace(defaultState())
                    setConfirmReset(false)
                    toast('Plan réinitialisé')
                    onClose()
                  }}
                >
                  Oui, réinitialiser
                </Button>
                <Button onClick={() => setConfirmReset(false)}>Annuler</Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw size={14} aria-hidden />
              Réinitialiser l’application
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
