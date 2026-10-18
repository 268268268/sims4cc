import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DDSLoader } from 'three/examples/jsm/loaders/DDSLoader.js'
import { ArrowClockwise, ArrowsClockwise, Cube, Camera, X, Palette, WarningCircle, User, ArrowsOut, ArrowsIn } from '@phosphor-icons/react'
import { useT } from '../lib/i18n'

/**
 * 3D Вьювер мешей и расцветок The Sims 4.
 * Поддерживает вращение, зум, панорамирование, переключение расцветок, манекен тела и режим полигональной сетки.
 */
export default function Model3DViewer({ filePath, modName, onClose }) {
  const { t } = useT()
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const controlsRef = useRef(null)
  const cameraRef = useRef(null)
  const modelGroupRef = useRef(null)
  const animationFrameIdRef = useRef(null)
  const materialsRef = useRef([])
  const modMaterialsRef = useRef([])
  const mannequinMaterialsRef = useRef([])
  const modMeshesRef = useRef([])
  const cachedTexturesRef = useRef(new Map())
  const textureLoaderRef = useRef(new THREE.TextureLoader())

  const [loading, setLoading] = useState(true)
  const [switchingSwatch, setSwitchingSwatch] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [error, setError] = useState(null)
  const [modelData, setModelData] = useState(null)
  const [currentSwatchIndex, setCurrentSwatchIndex] = useState(0)
  const [wireframe, setWireframe] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [showMannequin, setShowMannequin] = useState(true)
  const [stats, setStats] = useState({ vertices: 0, faces: 0 })

  // Парсинг бинарного DDS нативно в сжатую текстуру WebGL
  const parseDdsTexture = useCallback((base64) => {
    try {
      if (!base64) return null
      const bin = atob(base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i)
      }
      let arrayBuffer = bytes.buffer

      // Поддержка обычных PNG и JPEG текстур
      if (arrayBuffer.byteLength >= 4) {
        const u8 = new Uint8Array(arrayBuffer)
        if ((u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) || (u8[0] === 0xff && u8[1] === 0xd8)) {
          const blob = new Blob([arrayBuffer], { type: u8[0] === 0x89 ? 'image/png' : 'image/jpeg' })
          const url = URL.createObjectURL(blob)
          const tex = new THREE.TextureLoader().load(url)
          tex.colorSpace = THREE.SRGBColorSpace
          tex.needsUpdate = true
          return tex
        }
      }

      if (arrayBuffer.byteLength >= 128) {
        const view = new DataView(arrayBuffer)
        const magic = view.getUint32(0, true)
        if (magic === 0x20534444) { // 'DDS '
          const height = view.getUint32(12, true)
          const width = view.getUint32(16, true)
          const mipmapCount = view.getUint32(28, true)
          const fourcc = view.getUint32(84, true)
          const blockBytes = fourcc === 0x31545844 ? 8 : 16
          if (width > 0 && height > 0 && mipmapCount > 0) {
            let expectedTotal = 128
            let w = width
            let h = height
            for (let i = 0; i < mipmapCount; i++) {
              expectedTotal += (Math.max(4, w) / 4) * (Math.max(4, h) / 4) * blockBytes
              w = Math.max(w >> 1, 1)
              h = Math.max(h >> 1, 1)
            }
            if (arrayBuffer.byteLength < expectedTotal) {
              const padded = new Uint8Array(expectedTotal)
              padded.set(new Uint8Array(arrayBuffer))
              arrayBuffer = padded.buffer
            }
          }
        }
      }

      const loader = new DDSLoader()
      const dds = loader.parse(arrayBuffer)
      const texture = new THREE.CompressedTexture(dds.mipmaps, dds.width, dds.height, dds.format)
      texture.minFilter = dds.mipmapCount > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.colorSpace = THREE.SRGBColorSpace
      texture.needsUpdate = true
      return texture
    } catch (err) {
      console.warn('[Model3DViewer] Не удалось распарсить DDS:', err)
      return null
    }
  }, [])

  // Инициализация Three.js сцены
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    const width = containerRef.current.clientWidth || 600
    const height = containerRef.current.clientHeight || 450

    // Сцена
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Камера
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 50)
    camera.position.set(0, 1.2, 2)
    cameraRef.current = camera

    // WebGL Рендерер
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    rendererRef.current = renderer

    // Управление камерой (OrbitControls)
    const controls = new OrbitControls(camera, canvasRef.current)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.maxDistance = 10
    controls.minDistance = 0.2
    controlsRef.current = controls

    // Трёхточечное студийное освещение
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.3)
    scene.add(ambientLight)

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4)
    keyLight.position.set(2, 3, 3)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xbbd0f0, 0.7)
    fillLight.position.set(-3, 1, -2)
    scene.add(fillLight)

    const rimLight = new THREE.DirectionalLight(0xffeedd, 0.5)
    rimLight.position.set(0, -2, -3)
    scene.add(rimLight)

    // Группа для модели (натуральные координаты Sims 4)
    const modelGroup = new THREE.Group()
    scene.add(modelGroup)
    modelGroupRef.current = modelGroup

    // Анимационный цикл
    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate)
      if (controlsRef.current) {
        controlsRef.current.autoRotate = autoRotate
        controlsRef.current.update()
      }
      renderer.render(scene, camera)
    }
    animate()

    // Обработчик ресайза
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      cameraRef.current.aspect = w / h
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(w, h)
    }
    const observer = new ResizeObserver(handleResize)
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current)
      cachedTexturesRef.current.forEach((t) => t.dispose())
      cachedTexturesRef.current.clear()
      renderer.dispose()
    }
  }, [])

  // Обновление вращения без пересоздания Three.js сцены
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate
    }
  }, [autoRotate])

  // Асинхронная загрузка PNG-текстуры с кэшированием в памяти
  const loadTexture = useCallback((textureUrl, swatchIdx) => {
    if (!textureUrl) return Promise.resolve(null)
    if (cachedTexturesRef.current.has(swatchIdx)) {
      return Promise.resolve(cachedTexturesRef.current.get(swatchIdx))
    }
    return new Promise((resolve) => {
      textureLoaderRef.current.load(
        textureUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          tex.needsUpdate = true
          cachedTexturesRef.current.set(swatchIdx, tex)
          resolve(tex)
        },
        undefined,
        (err) => {
          console.warn('[Model3DViewer] Ошибка загрузки текстуры:', err)
          resolve(null)
        }
      )
    })
  }, [])

  // Построение меша и наложение текстуры
  const buildModel = useCallback((data, isWireframe, withMannequin = true, initCamera = true) => {
    if (!sceneRef.current || !modelGroupRef.current) return

    const group = modelGroupRef.current
    // Очищаем старые меши
    while (group.children.length > 0) {
      const child = group.children[0]
      if (child.geometry) child.geometry.dispose()
      group.remove(child)
    }
    materialsRef.current.forEach((m) => m.dispose())
    materialsRef.current = []
    modMaterialsRef.current = []
    mannequinMaterialsRef.current = []
    modMeshesRef.current = []

    const currentSwatchIdx = data.currentSwatchIndex ?? 0
    let initialTexture = cachedTexturesRef.current.get(currentSwatchIdx) || null

    if (!initialTexture && data.textureUrl) {
      loadTexture(data.textureUrl, currentSwatchIdx).then((loadedTex) => {
        if (loadedTex && modMaterialsRef.current.length > 0) {
          for (const mat of modMaterialsRef.current) {
            mat.map = loadedTex
            mat.color.setHex(0xffffff)
            mat.transparent = true
            mat.alphaTest = 0.05
            mat.depthWrite = true
            mat.needsUpdate = true
          }
        }
      })
    } else if (!initialTexture && data.textureDdsBase64) {
      initialTexture = parseDdsTexture(data.textureDdsBase64)
      if (initialTexture) {
        cachedTexturesRef.current.set(currentSwatchIdx, initialTexture)
      }
    }

    let totalVertices = 0
    let totalFaces = 0

    // Создаем геометрию для каждого чанка мода
    for (const chunk of data.meshes || []) {
      const geom = new THREE.BufferGeometry()
      if (chunk.indices && chunk.indices.length > 0) {
        geom.setIndex(new THREE.Uint16BufferAttribute(chunk.indices, 1))
      }
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(chunk.positions), 3))

      if (chunk.normals && chunk.normals.length > 0) {
        geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(chunk.normals), 3))
      } else {
        geom.computeVertexNormals()
      }

      if (chunk.uvs && chunk.uvs.length > 0) {
        geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(chunk.uvs), 2))
      }

      const material = new THREE.MeshStandardMaterial({
        map: initialTexture || null,
        color: initialTexture ? 0xffffff : 0xd8dde6,
        roughness: 0.65,
        metalness: 0.05,
        transparent: true,
        alphaTest: 0.05,
        depthWrite: true,
        side: THREE.DoubleSide,
        wireframe: isWireframe
      })
      materialsRef.current.push(material)
      modMaterialsRef.current.push(material)

      const mesh = new THREE.Mesh(geom, material)
      group.add(mesh)
      modMeshesRef.current.push(mesh)

      totalVertices += (chunk.positions?.length || 0) / 3
      totalFaces += (chunk.indices?.length || 0) / 3
    }

    // Добавляем меши манекена тела (если включено и доступно)
    if (withMannequin && data.mannequinMeshes && data.mannequinMeshes.length > 0) {
      const mannequinMaterial = new THREE.MeshStandardMaterial({
        color: 0x8a92a0,
        roughness: 0.75,
        metalness: 0.05,
        side: THREE.DoubleSide,
        wireframe: isWireframe
      })
      materialsRef.current.push(mannequinMaterial)
      mannequinMaterialsRef.current.push(mannequinMaterial)

      for (const mChunk of data.mannequinMeshes) {
        const geom = new THREE.BufferGeometry()
        if (mChunk.indices && mChunk.indices.length > 0) {
          geom.setIndex(new THREE.Uint16BufferAttribute(mChunk.indices, 1))
        }
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mChunk.positions), 3))
        if (mChunk.normals && mChunk.normals.length > 0) {
          geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(mChunk.normals), 3))
        } else {
          geom.computeVertexNormals()
        }
        const mesh = new THREE.Mesh(geom, mannequinMaterial)
        group.add(mesh)
      }
    }

    setStats({ vertices: Math.round(totalVertices), faces: Math.round(totalFaces) })

    // Выравниваем модель по геометрическому центру
    const box = new THREE.Box3().setFromObject(group)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    group.position.x = -center.x
    group.position.y = -center.y
    group.position.z = -center.z

    // Первоначальная настройка камеры: приятный студийный ракурс
    if (initCamera && cameraRef.current && controlsRef.current) {
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      const fov = cameraRef.current.fov * (Math.PI / 180)
      const fitDist = (maxDim / 2) / Math.tan(fov / 2)
      const cameraDist = Math.max(fitDist * 1.15, 0.5)

      // Фокусируемся чуть выше центра и смотрим сверху под углом ~12 градусов
      const targetY = size.y * 0.08
      cameraRef.current.position.set(0, targetY + maxDim * 0.18, cameraDist)
      controlsRef.current.target.set(0, targetY, 0)
      controlsRef.current.minDistance = Math.max(0.1, maxDim * 0.15)
      controlsRef.current.maxDistance = maxDim * 6
      controlsRef.current.update()
    }
  }, [loadTexture])

  const wireframeRef = useRef(wireframe)
  wireframeRef.current = wireframe
  const showMannequinRef = useRef(showMannequin)
  showMannequinRef.current = showMannequin

  // Загрузка данных 3D-модели через IPC
  const load3DData = useCallback(async (swatchIdx) => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.get3DModel(filePath, swatchIdx)
      if (!res?.has3D) {
        setError(res?.error || t('model3d.noGeom'))
        setLoading(false)
        return
      }

      setModelData(res)
      setCurrentSwatchIndex(res.currentSwatchIndex || 0)
      buildModel(res, wireframeRef.current, showMannequinRef.current, true)
      setLoading(false)
    } catch (err) {
      setError(err.message || t('model3d.loadError'))
      setLoading(false)
    }
  }, [filePath, buildModel, t])

  useEffect(() => {
    load3DData(0)
  }, [filePath, load3DData])

  // Переключение расцветки (свотча) без сброса ракурса камеры
  const handleSelectSwatch = async (idx) => {
    if (idx === currentSwatchIndex || switchingSwatch) return

    // 1. Мгновенный путь: текстура уже была загружена в память
    const cachedTex = cachedTexturesRef.current.get(idx)
    if (cachedTex) {
      setCurrentSwatchIndex(idx)
      for (const mat of modMaterialsRef.current) {
        mat.map = cachedTex
        mat.color.setHex(0xffffff)
        mat.needsUpdate = true
      }
      return
    }

    // 2. Если еще не загружалась — запрашиваем URL с бэкенда
    setSwitchingSwatch(true)
    try {
      const res = await window.api.get3DModel(filePath, idx)
      if (res?.has3D) {
        setCurrentSwatchIndex(res.currentSwatchIndex ?? idx)
        let newTex = null
        if (res.textureUrl) {
          newTex = await loadTexture(res.textureUrl, idx)
        } else if (res.textureDdsBase64) {
          newTex = parseDdsTexture(res.textureDdsBase64)
          if (newTex) {
            cachedTexturesRef.current.set(idx, newTex)
          }
        }
        if (newTex) {
          for (const mat of modMaterialsRef.current) {
            mat.map = newTex
            mat.color.setHex(0xffffff)
            mat.transparent = true
            mat.alphaTest = 0.05
            mat.depthWrite = true
            mat.needsUpdate = true
          }
        }
      }
    } catch (err) {
      console.warn('Ошибка смены расцветки:', err)
    } finally {
      setSwitchingSwatch(false)
    }
  }

  // Переключение отображения манекена тела (сохраняет камеру)
  const toggleMannequin = () => {
    const next = !showMannequin
    setShowMannequin(next)
    if (modelData) {
      buildModel(modelData, wireframe, next, false)
    }
  }

  // Переключение режима сетки (Wireframe)
  const toggleWireframe = () => {
    const next = !wireframe
    setWireframe(next)
    materialsRef.current.forEach((m) => {
      m.wireframe = next
      m.needsUpdate = true
    })
  }

  // Сброс камеры на студийный ракурс
  const resetCamera = () => {
    if (!modelGroupRef.current || !cameraRef.current || !controlsRef.current) return
    const box = new THREE.Box3().setFromObject(modelGroupRef.current)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const fov = cameraRef.current.fov * (Math.PI / 180)
    const fitDist = (maxDim / 2) / Math.tan(fov / 2)
    const cameraDist = Math.max(fitDist * 1.15, 0.5)

    const targetY = size.y * 0.08
    cameraRef.current.position.set(0, targetY + maxDim * 0.18, cameraDist)
    controlsRef.current.target.set(0, targetY, 0)
    controlsRef.current.update()
  }

  // Быстрое переключение ракурсов камеры
  const setCameraPreset = (preset) => {
    if (!modelGroupRef.current || !cameraRef.current || !controlsRef.current) return
    const box = new THREE.Box3().setFromObject(modelGroupRef.current)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const fov = cameraRef.current.fov * (Math.PI / 180)
    const fitDist = (maxDim / 2) / Math.tan(fov / 2)
    const cameraDist = Math.max(fitDist * 1.15, 0.5)

    if (preset === 'face') {
      const y = size.y * 0.3
      cameraRef.current.position.set(0, y, cameraDist * 0.45)
      controlsRef.current.target.set(0, y, 0)
    } else if (preset === 'torso') {
      const y = size.y * 0.08
      cameraRef.current.position.set(0, y, cameraDist * 0.75)
      controlsRef.current.target.set(0, y, 0)
    } else if (preset === 'back') {
      const targetY = size.y * 0.08
      cameraRef.current.position.set(0, targetY + maxDim * 0.12, -cameraDist)
      controlsRef.current.target.set(0, targetY, 0)
    } else {
      // Полный рост / общий
      const targetY = size.y * 0.08
      cameraRef.current.position.set(0, targetY + maxDim * 0.18, cameraDist)
      controlsRef.current.target.set(0, targetY, 0)
    }
    controlsRef.current.update()
  }

  // Выход из полноэкранного режима по нажатию клавиши Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  // Снимок экрана 3D-модели
  const takeScreenshot = () => {
    if (!rendererRef.current) return
    const url = rendererRef.current.domElement.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `${(modName || 'sims4-mod').replace(/[^a-zA-Z0-9_-]/g, '_')}_3d.png`
    a.click()
  }

  return (
    <div
      className={`flex flex-col bg-[#0d1017] border border-white/10 select-none relative transition-all ${
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen rounded-none p-3'
          : 'h-full w-full rounded-xl overflow-hidden'
      }`}
    >
      {/* Верхняя панель управления */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/10 z-10 shrink-0">
        <div className="flex items-center gap-2">
          <Cube size={18} weight="duotone" className="text-emerald-400" />
          <span className="text-xs font-semibold text-gray-200">{t('model3d.title')}</span>
          {stats.faces > 0 && (
            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium flex items-center gap-1 ${
                stats.faces > 45000
                  ? 'bg-red-500/15 text-red-300 border-red-500/30'
                  : stats.faces > 20000
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}
              title={
                stats.faces > 45000
                  ? t('model3d.heavyDesc')
                  : stats.faces > 20000
                  ? t('model3d.mediumDesc')
                  : t('model3d.optimizedDesc')
              }
            >
              <span>{t('model3d.polygonsCount', { count: stats.faces.toLocaleString() })}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Пресеты ракурсов камеры */}
          <div className="hidden sm:flex items-center gap-0.5 bg-white/5 p-0.5 rounded-lg border border-white/5 text-[11px] text-gray-400">
            <button
              onClick={() => setCameraPreset('face')}
              className="px-2 py-0.5 rounded hover:bg-white/10 hover:text-white transition"
              title={t('model3d.tipFace')}
            >
              {t('model3d.camFace')}
            </button>
            <button
              onClick={() => setCameraPreset('torso')}
              className="px-2 py-0.5 rounded hover:bg-white/10 hover:text-white transition"
              title={t('model3d.tipTorso')}
            >
              {t('model3d.camTorso')}
            </button>
            <button
              onClick={() => setCameraPreset('full')}
              className="px-2 py-0.5 rounded hover:bg-white/10 hover:text-white transition"
              title={t('model3d.tipFull')}
            >
              {t('model3d.camFull')}
            </button>
            <button
              onClick={() => setCameraPreset('back')}
              className="px-2 py-0.5 rounded hover:bg-white/10 hover:text-white transition"
              title={t('model3d.tipBack')}
            >
              {t('model3d.camBack')}
            </button>
          </div>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-1.5 rounded-lg border text-xs transition ${
              autoRotate
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-white/5 text-gray-400 border-white/5 hover:text-white'
            }`}
            title={t('model3d.autoRotate')}
          >
            <ArrowsClockwise size={15} weight={autoRotate ? 'bold' : 'regular'} />
          </button>

          <button
            onClick={toggleWireframe}
            className={`p-1.5 rounded-lg border text-xs transition ${
              wireframe
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-white/5 text-gray-400 border-white/5 hover:text-white'
            }`}
            title={t('model3d.wireframe')}
          >
            <Cube size={15} weight={wireframe ? 'fill' : 'regular'} />
          </button>

          {modelData?.mannequinMeshes?.length > 0 && (
            <button
              onClick={toggleMannequin}
              className={`p-1.5 rounded-lg border text-xs transition ${
                showMannequin
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-white/5 text-gray-400 border-white/5 hover:text-white'
              }`}
              title={showMannequin ? t('model3d.hideMannequin') : t('model3d.showMannequin')}
            >
              <User size={15} weight={showMannequin ? 'fill' : 'regular'} />
            </button>
          )}

          <button
            onClick={resetCamera}
            className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-gray-400 hover:text-white transition"
            title={t('model3d.resetCam')}
          >
            <ArrowClockwise size={15} />
          </button>

          <button
            onClick={takeScreenshot}
            className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-gray-400 hover:text-white transition"
            title={t('model3d.screenshot')}
          >
            <Camera size={15} />
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-gray-400 hover:text-white transition"
            title={isFullscreen ? t('model3d.exitFullscreen') : t('model3d.fullscreen')}
          >
            {isFullscreen ? <ArrowsIn size={15} /> : <ArrowsOut size={15} />}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-gray-400 hover:text-red-300 transition ml-1"
              title={t('model3d.close')}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Основная область Canvas */}
      <div ref={containerRef} className="flex-1 min-h-0 w-full relative bg-gradient-to-b from-[#141824] to-[#0a0d14]">
        <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />

        {/* Индикатор загрузки */}
        {loading && (
          <div className="absolute inset-0 bg-[#0d1017]/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
            <p className="text-xs text-gray-300 font-medium">{t('model3d.loading')}</p>
          </div>
        )}

        {/* Ошибка */}
        {error && !loading && (
          <div className="absolute inset-0 bg-[#0d1017]/80 flex flex-col items-center justify-center gap-2.5 p-6 text-center">
            <WarningCircle size={32} className="text-amber-400" />
            <p className="text-sm text-gray-200 max-w-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Нижняя панель выбора расцветок (Swatches) */}
      {modelData?.swatches && modelData.swatches.length > 1 && (
        <div className="shrink-0 w-full px-3 py-2.5 bg-[#0e121a]/95 backdrop-blur-md border-t border-white/10 flex items-center gap-3 z-10">
          <div className="flex items-center gap-1.5 text-xs text-gray-300 shrink-0 font-medium select-none">
            <Palette size={15} className="text-emerald-400" />
            <span>{t('model3d.swatches', { count: modelData.swatches.length })}</span>
            {switchingSwatch && (
              <span className="w-3.5 h-3.5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin ml-1 inline-block" />
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto py-2 px-1 scrollbar-thin flex-1 min-w-0">
            {modelData.swatches.map((swatch) => {
              const isSelected = swatch.index === currentSwatchIndex
              const color1 = swatch.colors?.[0] || '#777'
              const color2 = swatch.colors?.[1] || null
              return (
                <button
                  key={swatch.index}
                  type="button"
                  onClick={() => handleSelectSwatch(swatch.index)}
                  className={`w-7 h-7 rounded-full border-2 transition-all shrink-0 relative overflow-hidden shadow-md cursor-pointer ${
                    isSelected
                      ? 'border-emerald-400 ring-2 ring-emerald-400/50 scale-110 z-10'
                      : 'border-white/20 hover:border-white/60 hover:scale-105 opacity-85 hover:opacity-100'
                  }`}
                  title={t('model3d.swatchIndex', { index: swatch.index + 1 })}
                >
                  {color2 ? (
                    <div
                      className="w-full h-full"
                      style={{
                        background: `linear-gradient(135deg, ${color1} 50%, ${color2} 50%)`
                      }}
                    />
                  ) : (
                    <div className="w-full h-full" style={{ backgroundColor: color1 }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
