import { useState, useEffect, useCallback } from 'react'
import { Stack, Play, PencilSimple, Export, DownloadSimple, Trash, Check, X, FloppyDisk, CircleNotch } from '@phosphor-icons/react'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import { useT } from '../lib/i18n'

/**
 * Manage named mod sets (profiles). A profile records which mods are on/off;
 * applying one toggles the library back to that state. Files are never deleted.
 */
export default function ProfilesModal({ onClose }) {
  const { t } = useT()
  const [data, setData] = useState({ profiles: [], activeId: null })
  const [newName, setNewName] = useState('')
  const [busyId, setBusyId] = useState(null) // profile id being applied
  const [editing, setEditing] = useState(null) // { id, name }
  const [confirmDel, setConfirmDel] = useState(null) // profile pending delete
  const [flash, setFlash] = useState(null) // { id, text }

  const reload = useCallback(() => window.api.listProfiles().then(d => d && setData(d)), [])
  useEffect(() => { reload() }, [reload])

  const saveCurrent = async () => {
    const name = newName.trim()
    if (!name) return
    await window.api.saveProfile({ name })
    setNewName('')
    reload()
  }

  const apply = async (p) => {
    if (busyId) return
    setBusyId(p.id)
    setFlash(null)
    try {
      const res = await window.api.applyProfile(p.id)
      if (res?.ok) {
        window.dispatchEvent(new CustomEvent('local-mods-changed')) // Local Mods rescans
        setFlash({ id: p.id, text: res.changed > 0 ? t('profiles.applied', { count: res.changed }) : t('profiles.noChanges') })
        reload()
      }
    } finally {
      setBusyId(null)
    }
  }

  const commitRename = async () => {
    const name = editing?.name?.trim()
    if (editing && name) await window.api.renameProfile(editing.id, name)
    setEditing(null)
    reload()
  }

  const doDelete = async (p) => {
    setConfirmDel(null)
    await window.api.deleteProfile(p.id)
    reload()
  }

  const doImport = async () => {
    const res = await window.api.importProfile()
    if (res?.ok) reload()
  }

  const modCount = (p) => Object.keys(p.states ?? {}).length

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg">
      <div className="p-6 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Stack size={20} weight="fill" className="text-emerald-400" /> {t('profiles.title')}
          </h2>
          <p className="text-gray-400 text-sm mt-1 leading-relaxed">{t('profiles.hint')}</p>
        </div>

        {/* Save current setup */}
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveCurrent()}
            placeholder={t('profiles.namePlaceholder')}
            className="input flex-1 px-3 py-2 text-sm"
          />
          <button onClick={saveCurrent} disabled={!newName.trim()} className="btn-primary px-4 py-2 text-sm">
            <FloppyDisk size={15} weight="bold" /> {t('profiles.create')}
          </button>
        </div>

        {/* Profile list */}
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {data.profiles.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-6">{t('profiles.empty')}</p>
          )}
          {data.profiles.map(p => (
            <div key={p.id} className="bg-white/5 rounded-lg px-3 py-2.5 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {editing?.id === p.id ? (
                  <input
                    autoFocus
                    value={editing.name}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(null) }}
                    onBlur={commitRename}
                    className="input flex-1 px-2 py-1 text-sm"
                  />
                ) : (
                  <span className="text-white text-sm font-medium truncate flex-1" title={p.name}>{p.name}</span>
                )}
                {data.activeId === p.id && (
                  <span className="badge bg-emerald-800/50 text-emerald-300"><Check size={10} weight="bold" /> {t('profiles.active')}</span>
                )}
                <span className="text-gray-500 text-xs shrink-0">{t('profiles.modsCount', { count: modCount(p) })}</span>
              </div>

              {flash?.id === p.id && (
                <p className="text-emerald-400 text-xs">{flash.text}</p>
              )}

              <div className="flex items-center gap-1.5">
                <button onClick={() => apply(p)} disabled={!!busyId} className="btn-success px-3 py-1.5 text-xs">
                  {busyId === p.id
                    ? <><CircleNotch size={13} weight="bold" className="animate-spin" /> {t('profiles.applyingTitle')}</>
                    : <><Play size={13} weight="fill" /> {t('profiles.apply')}</>}
                </button>
                <button onClick={() => setEditing({ id: p.id, name: p.name })} className="btn-ghost px-2.5 py-1.5 text-xs" title={t('profiles.rename')}>
                  <PencilSimple size={14} weight="regular" />
                </button>
                <button onClick={() => window.api.exportProfile(p.id)} className="btn-ghost px-2.5 py-1.5 text-xs" title={t('profiles.export')}>
                  <Export size={14} weight="regular" />
                </button>
                <button onClick={() => setConfirmDel(p)} className="btn-ghost ml-auto px-2.5 py-1.5 text-xs hover:text-red-300" title={t('common.delete')}>
                  <Trash size={14} weight="regular" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-white/5">
          <button onClick={doImport} className="btn-ghost px-3 py-2 text-sm">
            <DownloadSimple size={15} weight="bold" /> {t('profiles.import')}
          </button>
          <button onClick={onClose} className="btn-ghost px-3 py-2 text-sm"><X size={15} weight="bold" /> {t('common.close')}</button>
        </div>
      </div>

      {confirmDel && (
        <ConfirmDialog
          title={t('profiles.deleteConfirm', { name: confirmDel.name })}
          message={t('profiles.deleteConfirmMsg')}
          confirmLabel={<><Trash size={15} weight="bold" /> {t('common.delete')}</>}
          onConfirm={() => doDelete(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </Modal>
  )
}
