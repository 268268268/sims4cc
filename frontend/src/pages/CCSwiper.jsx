import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Trash,
  Check,
  ArrowCounterClockwise,
  SkipForward,
  Cube,
  DeviceMobile,
  ArrowsClockwise,
  SlidersHorizontal,
  Folder,
  Prohibit,
  Info,
  X,
  Copy
} from '@phosphor-icons/react'
import Model3DViewer from '../components/Model3DViewer'
import { formatBytes, formatDate } from '../lib/format'
import { useT } from '../lib/i18n'

export default function CCSwiper({ modsFolder }) {
  const { t } = useT()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [stats, setStats] = useState({ total: 0, reviewed: 0, remaining: 0, historyCount: 0 })
  const [filterType, setFilterType] = useState('all')
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(true)
  const [folderFilter, setFolderFilter] = useState('')
  const [folders, setFolders] = useState([])
  const [show3D, setShow3D] = useState(false)
  const [mobileModal, setMobileModal] = useState(false)
  const [mobileServer, setMobileServer] = useState(null)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const cardRef = useRef(null)

  // Загрузка карточек
  const loadCards = useCallback(async () => {
    setLoading(true)
    setShow3D(false)
    try {
      const res = await window.api.swiperGetCards({
        filter: filterType,
        folder: folderFilter,
        onlyUnreviewed,
        shuffle: false
      })
      const list = res.cards || []
      setCards(list)
      setStats(res.stats || { total: list.length, reviewed: 0, remaining: list.length, historyCount: 0 })
      setCurrentIndex(0)

      // Собираем уникальные папки для фильтра
      const fSet = new Set()
      for (const c of list) {
        if (c.relativePath && c.relativePath.includes('\\')) {
          const top = c.relativePath.split('\\')[0]
          fSet.add(top)
        }
      }
      setFolders(Array.from(fSet))
    } catch (err) {
      console.error('Failed to load swiper cards:', err)
    } finally {
      setLoading(false)
    }
  }, [filterType, folderFilter, onlyUnreviewed])

  useEffect(() => {
    loadCards()
  }, [loadCards])

  // Загрузка статуса мобильного сервера
  useEffect(() => {
    window.api.swiperGetServerStatus().then(st => setMobileServer(st))
  }, [])

  const currentCard = cards[currentIndex]
  const nextCard = cards[currentIndex + 1]

  // Обработка действий (keep, trash, disable, skip)
  const handleAction = useCallback(async (action) => {
    if (!currentCard) return
    const card = currentCard
    setShow3D(false)
    setCurrentIndex(idx => idx + 1)
    setStats(prev => ({
      ...prev,
      remaining: Math.max(0, prev.remaining - 1),
      reviewed: prev.reviewed + (action !== 'skip' ? 1 : 0),
      historyCount: prev.historyCount + 1
    }))

    try {
      await window.api.swiperAction({
        modId: card.id,
        filePath: card.filePath,
        action
      })
    } catch (err) {
      console.error(`Swiper action ${action} failed:`, err)
    }
  }, [currentCard])

  // Отмена
  const handleUndo = useCallback(async () => {
    try {
      const res = await window.api.swiperUndo()
      if (res.ok) {
        if (currentIndex > 0) {
          setCurrentIndex(idx => idx - 1)
          setStats(prev => ({
            ...prev,
            remaining: prev.remaining + 1,
            historyCount: Math.max(0, prev.historyCount - 1)
          }))
        } else {
          loadCards()
        }
      }
    } catch (err) {
      console.error('Undo failed:', err)
    }
  }, [currentIndex, loadCards])

  // Сброс истории
  const handleReset = async () => {
    if (confirm('Сбросить историю проверенных модов для этого режима?')) {
      await window.api.swiperResetReviewed()
      loadCards()
    }
  }

  // Горячие клавиши
  useEffect(() => {
    const onKeyDown = (e) => {
      // Игнорируем если фокус в инпуте
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleAction('keep')
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleAction('trash')
      } else if (e.key === 'ArrowDown' || e.code === 'Space') {
        e.preventDefault()
        handleAction('skip')
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        handleUndo()
      } else if (e.key === '3' || e.key === 'ArrowUp') {
        if (currentCard?.has3D) {
          e.preventDefault()
          setShow3D(v => !v)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleAction, handleUndo, currentCard])

  // Drag & Swipe мыши
  const handleMouseDown = (e) => {
    if (show3D) return // не мешаем вращению 3D
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setDragOffset({ x: dx, y: dy })
  }

  const handleMouseUp = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragOffset.x > 120) {
      handleAction('keep')
    } else if (dragOffset.x < -120) {
      handleAction('trash')
    }
    setDragOffset({ x: 0, y: 0 })
  }

  // Мобильный сервер переключение
  const toggleMobileServer = async () => {
    if (mobileServer?.running) {
      const st = await window.api.swiperStopServer()
      setMobileServer(st)
    } else {
      const st = await window.api.swiperStartServer(3456)
      setMobileServer(st)
    }
  }

  const copyUrl = () => {
    if (mobileServer?.url) {
      navigator.clipboard.writeText(mobileServer.url)
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    }
  }

  const cardRotation = (dragOffset.x / 15)
  const keepOpacity = Math.max(0, Math.min(1, dragOffset.x / 100))
  const trashOpacity = Math.max(0, Math.min(1, -dragOffset.x / 100))

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0f16] text-gray-200 overflow-hidden select-none">
      {/* Верхняя панель управления */}
      <div className="h-14 px-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent flex items-center gap-2">
            💎 CC Swiper
          </span>
          <div className="flex items-center gap-2 text-xs text-gray-400 ml-4 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
            <span>Очередь: <b className="text-white">{stats.remaining}</b></span>
            <span className="text-gray-600">|</span>
            <span>Просмотрено: <b className="text-emerald-400">{stats.reviewed}</b></span>
            <span className="text-gray-600">|</span>
            <span>Всего: <b className="text-gray-300">{stats.total}</b></span>
          </div>
        </div>

        {/* Фильтры */}
        <div className="flex items-center gap-3">
          {/* Подпапка */}
          {folders.length > 0 && (
            <select
              value={folderFilter}
              onChange={e => setFolderFilter(e.target.value)}
              className="bg-gray-900 border border-white/10 text-xs rounded-lg px-2.5 py-1.5 text-gray-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="">📁 Все папки</option>
              {folders.map(f => (
                <option key={f} value={f}>📁 {f}</option>
              ))}
            </select>
          )}

          {/* Тип */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-gray-900 border border-white/10 text-xs rounded-lg px-2.5 py-1.5 text-gray-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Все моды</option>
            <option value="cas">👗 Одежда / CAS</option>
            <option value="objects">🛋️ Мебель / Объекты</option>
            <option value="with-thumbs">🖼️ Только с превью</option>
            <option value="no-thumbs">❓ Без превью</option>
          </select>

          {/* Чекбокс непросмотренные */}
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyUnreviewed}
              onChange={e => setOnlyUnreviewed(e.target.checked)}
              className="accent-emerald-500 rounded"
            />
            Только непроверенные
          </label>

          {/* Мобильный сервер */}
          <button
            onClick={() => setMobileModal(true)}
            className={`btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5 border ${
              mobileServer?.running ? 'border-emerald-500/50 text-emerald-300 bg-emerald-950/30' : 'border-white/10 text-gray-300'
            }`}
            title="Открыть на телефоне по Wi-Fi"
          >
            <DeviceMobile size={15} weight="bold" />
            <span>Свайпать с телефона</span>
            {mobileServer?.running && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />}
          </button>

          <button
            onClick={loadCards}
            className="btn-ghost p-2 text-gray-400 hover:text-white"
            title="Обновить список"
          >
            <ArrowsClockwise size={16} />
          </button>
        </div>
      </div>

      {/* Основная зона свайпа */}
      <div
        className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-gray-400 animate-pulse">
            <Cube size={40} className="text-emerald-500 animate-spin" />
            <p className="text-sm">Загрузка карточек для свайпа...</p>
          </div>
        ) : !currentCard ? (
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="w-20 h-20 rounded-full bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center text-4xl">
              🎉
            </div>
            <h3 className="text-xl font-bold text-white">Все моды проверены!</h3>
            <p className="text-sm text-gray-400">
              В выбранной категории не осталось непросмотренных файлов. Вы можете сбросить прогресс или выбрать другую папку.
            </p>
            <button
              onClick={handleReset}
              className="btn-primary px-4 py-2 text-xs flex items-center gap-2 mt-2"
            >
              <ArrowCounterClockwise size={14} weight="bold" />
              <span>Начать заново (сбросить историю)</span>
            </button>
          </div>
        ) : (
          <div className="relative w-full max-w-[460px] h-[580px] flex items-center justify-center">
            {/* Фоновая карточка (следующая) для ощущения глубины колоды */}
            {nextCard && (
              <div
                className="absolute inset-0 bg-[#101725] rounded-3xl border border-white/5 opacity-50 scale-95 translate-y-3 pointer-events-none shadow-xl flex flex-col overflow-hidden"
              >
                <div className="flex-1 bg-black/40 flex items-center justify-center">
                  {nextCard.thumbnail?.path ? (
                    <img
                      src={`/modimg?p=${encodeURIComponent(nextCard.thumbnail.path)}`}
                      alt="next"
                      className="max-h-full max-w-full object-contain blur-[1px]"
                    />
                  ) : (
                    <Cube size={50} className="text-gray-700" />
                  )}
                </div>
                <div className="p-4 bg-[#101725]">
                  <p className="text-gray-400 font-semibold truncate text-sm">{nextCard.name}</p>
                </div>
              </div>
            )}

            {/* Активная карточка */}
            <div
              ref={cardRef}
              onMouseDown={handleMouseDown}
              style={{
                transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${cardRotation}deg)`,
                cursor: show3D ? 'default' : isDragging ? 'grabbing' : 'grab'
              }}
              className="absolute inset-0 bg-[#121c2d] rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden transition-[box-shadow] duration-150"
            >
              {/* Штамп ОСТАВИТЬ (зеленый) */}
              <div
                style={{ opacity: keepOpacity }}
                className="absolute top-6 right-6 z-30 border-4 border-emerald-400 text-emerald-400 font-black text-2xl px-4 py-1.5 rounded-xl rotate-12 tracking-wider pointer-events-none"
              >
                ОСТАВИТЬ
              </div>

              {/* Штамп УДАЛИТЬ (красный) */}
              <div
                style={{ opacity: trashOpacity }}
                className="absolute top-6 left-6 z-30 border-4 border-rose-500 text-rose-500 font-black text-2xl px-4 py-1.5 rounded-xl -rotate-12 tracking-wider pointer-events-none"
              >
                В КОРЗИНУ
              </div>

              {/* Область изображения / 3D модели */}
              <div className="flex-1 bg-[#060a12] relative overflow-hidden flex items-center justify-center">
                {show3D ? (
                  <div className="w-full h-full">
                    <Model3DViewer filePath={currentCard.filePath} />
                  </div>
                ) : currentCard.thumbnail?.path ? (
                  <img
                    src={`/modimg?p=${encodeURIComponent(currentCard.thumbnail.path)}`}
                    alt="preview"
                    className="max-h-full max-w-full object-contain select-none pointer-events-none p-3 drop-shadow-[0_8px_20px_rgba(0,0,0,0.8)]"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-600">
                    <Cube size={60} weight="thin" />
                    <span className="text-xs">Нет превью</span>
                  </div>
                )}

                {/* Кнопка переключения 3D на самой карточке */}
                {currentCard.has3D && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShow3D(v => !v) }}
                    className={`absolute bottom-3 right-3 z-20 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all backdrop-blur-md shadow-lg ${
                      show3D
                        ? 'bg-emerald-500 text-black shadow-emerald-500/30'
                        : 'bg-black/60 hover:bg-black/80 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    <Cube size={14} weight="bold" />
                    <span>{show3D ? 'Фото' : '3D Режим'}</span>
                  </button>
                )}
              </div>

              {/* Инфо карточки */}
              <div className="p-4 bg-[#111928] border-t border-white/5 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-white font-bold text-base leading-snug line-clamp-1 break-words" title={currentCard.name}>
                    {currentCard.name}
                  </h4>
                  <span className="badge font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-500/20 shrink-0 text-[11px]">
                    {formatBytes(currentCard.size)}
                  </span>
                </div>

                {currentCard.author && (
                  <p className="text-emerald-400 text-xs font-medium">@{currentCard.author}</p>
                )}

                <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-400 pt-1">
                  {currentCard.kinds?.map(k => (
                    <span key={k} className="badge bg-white/5 text-gray-300">{k}</span>
                  ))}
                  {currentCard.dateAdded && (
                    <span className="text-gray-500 text-[11px]">· Добавлен {formatDate(currentCard.dateAdded)}</span>
                  )}
                </div>

                <p className="text-gray-500 text-[11px] truncate pt-0.5" title={currentCard.relativePath}>
                  📁 {currentCard.relativePath}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Нижние кнопки управления с подсказками клавиш */}
        {currentCard && (
          <div className="flex items-center gap-4 mt-6 z-20">
            {/* В корзину */}
            <button
              onClick={() => handleAction('trash')}
              className="w-14 h-14 rounded-full bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 text-rose-400 border border-rose-500/40 flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-rose-950/40 transition-all cursor-pointer group"
              title="Переместить в корзину (Стрелка влево)"
            >
              <Trash size={22} weight="bold" className="group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-mono opacity-60">←</span>
            </button>

            {/* Выключить */}
            <button
              onClick={() => handleAction('disable')}
              className="w-12 h-12 rounded-full bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 text-amber-300 border border-amber-500/30 flex flex-col items-center justify-center gap-0.5 shadow-md transition-all cursor-pointer"
              title="Отключить (.disabled)"
            >
              <Prohibit size={18} weight="bold" />
              <span className="text-[8px] font-mono opacity-60">off</span>
            </button>

            {/* Отмена */}
            <button
              onClick={handleUndo}
              disabled={stats.historyCount === 0}
              className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 text-gray-300 border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-0.5 shadow-md transition-all cursor-pointer"
              title="Отменить последнее действие (Ctrl+Z)"
            >
              <ArrowCounterClockwise size={18} weight="bold" />
              <span className="text-[8px] font-mono opacity-60">Ctrl+Z</span>
            </button>

            {/* Пропустить */}
            <button
              onClick={() => handleAction('skip')}
              className="w-12 h-12 rounded-full bg-sky-500/20 hover:bg-sky-500/30 active:scale-95 text-sky-300 border border-sky-500/30 flex flex-col items-center justify-center gap-0.5 shadow-md transition-all cursor-pointer"
              title="Пропустить на потом (Пробел / Стрелка вниз)"
            >
              <SkipForward size={18} weight="bold" />
              <span className="text-[8px] font-mono opacity-60">Space</span>
            </button>

            {/* Оставить */}
            <button
              onClick={() => handleAction('keep')}
              className="w-14 h-14 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 active:scale-95 text-emerald-400 border border-emerald-500/40 flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer group"
              title="Оставить мод (Стрелка вправо)"
            >
              <Check size={24} weight="bold" className="group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-mono opacity-60">→</span>
            </button>
          </div>
        )}
      </div>

      {/* Модальное окно подключения смартфона */}
      {mobileModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/15 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setMobileModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <DeviceMobile size={22} weight="bold" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Свайпай моды со смартфона</h3>
                <p className="text-xs text-gray-400">Лежи на диване и чисти моды пальцем на телефоне</p>
              </div>
            </div>

            <div className="bg-black/40 rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center my-4">
              {mobileServer?.running && mobileServer?.qrCodeDataUrl ? (
                <>
                  <img
                    src={mobileServer.qrCodeDataUrl}
                    alt="QR Code"
                    className="w-56 h-56 rounded-xl border border-emerald-500/30 shadow-lg mb-3"
                  />
                  <p className="text-xs text-gray-300 text-center mb-2">
                    Наведи камеру телефона (ПК и телефон должны быть в одной сети Wi-Fi):
                  </p>
                  <div className="flex items-center gap-2 bg-gray-900/80 px-3 py-1.5 rounded-lg border border-white/10 w-full justify-between">
                    <span className="text-xs font-mono text-emerald-400 truncate">{mobileServer.url}</span>
                    <button
                      onClick={copyUrl}
                      className="text-gray-400 hover:text-white p-1 text-xs flex items-center gap-1"
                    >
                      <Copy size={14} />
                      <span>{copiedUrl ? 'Скопировано!' : 'Копия'}</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-gray-400 text-xs">
                  Мобильный сервер не запущен. Нажмите кнопку ниже для запуска.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={toggleMobileServer}
                className={`btn-primary px-4 py-2 text-xs flex items-center gap-2 ${
                  mobileServer?.running ? 'bg-rose-600 hover:bg-rose-500 border-rose-500' : ''
                }`}
              >
                <span>{mobileServer?.running ? 'Остановить сервер' : 'Запустить сервер'}</span>
              </button>

              <button
                onClick={() => setMobileModal(false)}
                className="btn-ghost px-4 py-2 text-xs"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
