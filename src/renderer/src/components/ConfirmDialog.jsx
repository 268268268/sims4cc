import Modal from './Modal'

/** Small confirmation dialog: message + danger confirm / ghost cancel. */
export default function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} maxWidth="max-w-sm">
      <div className="p-6 flex flex-col gap-4">
        <h3 className="text-white font-semibold text-base pr-8">{title}</h3>
        {message && <p className="text-gray-400 text-sm leading-relaxed">{message}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button onClick={onConfirm} className="btn-danger px-4 py-2 text-sm">
            {confirmLabel}
          </button>
          <button onClick={onCancel} className="btn-ghost px-4 py-2 text-sm">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
