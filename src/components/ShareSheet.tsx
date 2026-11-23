import { Copy, Download, RotateCcw, Share2, Upload, WifiOff } from 'lucide-react'
import { useRef, useState } from 'react'
import { defaultState } from '../domain/data'
import { parseJSONState, planLink } from '../domain/share'
import { useStore } from '../state/store'
import { Button, Notice, Sheet } from '../ui/kit'

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

export function ShareSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, replace, toast } = useStore()
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
        <Notice>
          <span className="flex items-start gap-2">
            <WifiOff size={15} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              Pas de synchronisation automatique : chaque téléphone garde sa propre copie. Après une modification,
              renvoyez le lien à l’équipe.
            </span>
          </span>
        </Notice>

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
                Tout effacer sur ce téléphone (séances, profils, stratégie) et revenir au plan conseillé ?
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => {
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
