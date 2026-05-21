import './App.css'
import { Camera, Crosshair, Download, RefreshCw, Shuffle, Upload, Wind } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

type FieldMode = 'curl' | 'magnet' | 'tide'

type FieldSettings = {
  count: number
  spread: number
  fieldScale: number
  velocity: number
  attractor: number
  pointSize: number
  depth: number
  mode: FieldMode
  palette: string
  seed: number
}

type Palette = {
  name: string
  colors: [string, string, string, string]
}

const palettes: Palette[] = [
  { name: 'Prism Grove', colors: ['#d9ed92', '#52b788', '#34a0a4', '#f77f00'] },
  { name: 'Salt Bloom', colors: ['#f4f1de', '#81b29a', '#e07a5f', '#3d405b'] },
  { name: 'Lime Kiln', colors: ['#e9ff70', '#ff9770', '#70d6ff', '#f8f9fa'] },
]

const initialSettings: FieldSettings = {
  count: 9500,
  spread: 7.2,
  fieldScale: 0.72,
  velocity: 0.78,
  attractor: 0.58,
  pointSize: 0.032,
  depth: 2.2,
  mode: 'curl',
  palette: palettes[0].name,
  seed: 61740,
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizeSettings(input: unknown): FieldSettings {
  const source = typeof input === 'object' && input ? input as Partial<FieldSettings> : {}
  const mode = source.mode && ['curl', 'magnet', 'tide'].includes(source.mode) ? source.mode : initialSettings.mode
  const palette = palettes.some((item) => item.name === source.palette) ? source.palette! : initialSettings.palette

  return {
    count: Math.round(clamp(Number(source.count) || initialSettings.count, 2400, 18000)),
    spread: clamp(Number(source.spread) || initialSettings.spread, 3.5, 10),
    fieldScale: clamp(Number(source.fieldScale) || initialSettings.fieldScale, 0.18, 1.4),
    velocity: clamp(Number(source.velocity) || initialSettings.velocity, 0.05, 1.8),
    attractor: clamp(Number(source.attractor) || initialSettings.attractor, 0, 1.5),
    pointSize: clamp(Number(source.pointSize) || initialSettings.pointSize, 0.01, 0.07),
    depth: clamp(Number(source.depth) || initialSettings.depth, 0.2, 4),
    mode,
    palette,
    seed: Math.round(clamp(Number(source.seed) || initialSettings.seed, 1, 99999)),
  }
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x9e3779b9
    let value = state
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
    return ((value ^= value >>> 15) >>> 0) / 4294967296
  }
}

function activePalette(settings: FieldSettings) {
  return palettes.find((palette) => palette.name === settings.palette) ?? palettes[0]
}

function createParticleField(settings: FieldSettings) {
  const random = seededRandom(settings.seed)
  const palette = activePalette(settings).colors.map((color) => new THREE.Color(color))
  const positions = new Float32Array(settings.count * 3)
  const colors = new Float32Array(settings.count * 3)

  for (let index = 0; index < settings.count; index += 1) {
    const offset = index * 3
    const radius = Math.sqrt(random()) * settings.spread
    const angle = random() * Math.PI * 2
    const layer = random() - 0.5
    positions[offset] = Math.cos(angle) * radius
    positions[offset + 1] = Math.sin(angle) * radius
    positions[offset + 2] = layer * settings.depth

    const color = palette[index % palette.length].clone()
    color.lerp(palette[(index + 2) % palette.length], Math.min(1, radius / settings.spread))
    color.offsetHSL((random() - 0.5) * 0.04, 0, (random() - 0.5) * 0.08)
    color.toArray(colors, offset)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()

  return { geometry, positions }
}

type RangeControlProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format?: (value: number) => string
}

function RangeControl({ label, value, min, max, step, onChange, format }: RangeControlProps) {
  return (
    <label className="range-control">
      <span>
        {label}
        <strong>{format ? format(value) : value}</strong>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function wrapAxis(value: number, limit: number) {
  if (value > limit) {
    return -limit
  }
  if (value < -limit) {
    return limit
  }
  return value
}

function App() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const presetInputRef = useRef<HTMLInputElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const settingsRef = useRef<FieldSettings>(initialSettings)
  const [settings, setSettings] = useState<FieldSettings>(initialSettings)
  const palette = useMemo(() => activePalette(settings), [settings])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) {
        return
      }

      if (event.key === '1') updateSetting('mode', 'curl')
      if (event.key === '2') updateSetting('mode', 'magnet')
      if (event.key === '3') updateSetting('mode', 'tide')
      if (event.key.toLowerCase() === 'r') updateSetting('seed', Math.floor(Math.random() * 86000) + 10000)
      if (event.key.toLowerCase() === '0') setSettings(initialSettings)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const container = mountRef.current
    if (!container) {
      return
    }

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x080a08, 12, 32)

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80)
    camera.position.set(0, 0.8, 14.8)

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setClearColor(0x080a08, 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.8, 0.008, 8, 180),
      new THREE.MeshBasicMaterial({ color: 0xd9ed92, transparent: true, opacity: 0.18 }),
    )
    ring.rotation.x = Math.PI / 2
    scene.add(ring)

    let field = createParticleField(settingsRef.current)
    let signature = ''
    const material = new THREE.PointsMaterial({
      size: settingsRef.current.pointSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    let points = new THREE.Points(field.geometry, material)
    scene.add(points)

    const resize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    let frameId = 0
    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate)
      const nextSettings = settingsRef.current
      const nextSignature = `${nextSettings.count}-${nextSettings.spread}-${nextSettings.depth}-${nextSettings.palette}-${nextSettings.seed}`

      if (signature !== nextSignature) {
        signature = nextSignature
        scene.remove(points)
        points.geometry.dispose()
        field = createParticleField(nextSettings)
        points = new THREE.Points(field.geometry, material)
        scene.add(points)
      }

      const seconds = time * 0.001
      const positionAttribute = points.geometry.getAttribute('position') as THREE.BufferAttribute
      const positions = positionAttribute.array as Float32Array
      const limit = nextSettings.spread
      const step = nextSettings.velocity * 0.018
      const attractorX = Math.sin(seconds * 0.72) * limit * 0.38
      const attractorY = Math.cos(seconds * 0.54) * limit * 0.28

      for (let index = 0; index < nextSettings.count; index += 1) {
        const offset = index * 3
        const x = positions[offset]
        const y = positions[offset + 1]
        const z = positions[offset + 2]
        const curl =
          Math.sin((x + seconds) * nextSettings.fieldScale) +
          Math.cos((y - seconds * 0.8) * nextSettings.fieldScale) +
          Math.sin(z * 1.6 + seconds * 0.4)

        let vx = Math.cos(curl * Math.PI) * step
        let vy = Math.sin(curl * Math.PI) * step
        let vz = Math.sin(curl + seconds) * step * 0.28

        if (nextSettings.mode === 'magnet') {
          const dx = attractorX - x
          const dy = attractorY - y
          const distance = Math.max(Math.hypot(dx, dy), 0.001)
          vx += (dx / distance) * step * nextSettings.attractor
          vy += (dy / distance) * step * nextSettings.attractor
        } else if (nextSettings.mode === 'tide') {
          vx += Math.sin(y * 0.6 + seconds) * step * nextSettings.attractor
          vy += Math.cos(x * 0.6 - seconds) * step * nextSettings.attractor
          vz += Math.sin(x + y + seconds) * step * 0.5
        }

        positions[offset] = wrapAxis(x + vx, limit)
        positions[offset + 1] = wrapAxis(y + vy, limit)
        positions[offset + 2] = wrapAxis(z + vz, nextSettings.depth)
      }

      positionAttribute.needsUpdate = true
      material.size = nextSettings.pointSize
      points.rotation.z += nextSettings.velocity * 0.0007
      points.rotation.x = Math.sin(seconds * 0.2) * 0.08
      ring.rotation.z -= nextSettings.velocity * 0.001
      renderer.render(scene, camera)
    }

    frameId = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      scene.remove(points)
      points.geometry.dispose()
      material.dispose()
      ring.geometry.dispose()
      ;(ring.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
      rendererRef.current = null
    }
  }, [])

  const updateSetting = <Key extends keyof FieldSettings>(key: Key, value: FieldSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const exportImage = () => {
    const renderer = rendererRef.current
    if (!renderer) {
      return
    }
    const link = document.createElement('a')
    link.href = renderer.domElement.toDataURL('image/png')
    link.download = `chroma-field-lab-${settings.seed}.png`
    link.click()
  }

  const exportPreset = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `chroma-field-preset-${settings.seed}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importPreset = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        setSettings(normalizeSettings(JSON.parse(String(reader.result))))
      } catch {
        window.alert('This preset file could not be read.')
      }
      event.target.value = ''
    }
    reader.readAsText(file)
  }

  return (
    <main className="field-shell">
      <section className="field-stage" ref={mountRef} aria-label="Animated Three.js flow-field particles" />

      <aside className="control-panel" aria-label="Flow-field controls">
        <div className="brand-row">
          <span aria-hidden="true">
            <Wind size={18} />
          </span>
          <div>
            <p>Chroma Field Lab</p>
            <small>Flow-field particle painter</small>
          </div>
        </div>

        <div className="mode-row">
          {(['curl', 'magnet', 'tide'] as FieldMode[]).map((mode) => (
            <button
              className={settings.mode === mode ? 'active' : ''}
              key={mode}
              onClick={() => updateSetting('mode', mode)}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>

        <section className="panel-section">
          <p className="section-label">Field</p>
          <RangeControl label="Particles" value={settings.count} min={2400} max={18000} step={300} onChange={(value) => updateSetting('count', value)} />
          <RangeControl label="Spread" value={settings.spread} min={3.5} max={10} step={0.1} onChange={(value) => updateSetting('spread', value)} format={(value) => value.toFixed(1)} />
          <RangeControl label="Scale" value={settings.fieldScale} min={0.18} max={1.4} step={0.01} onChange={(value) => updateSetting('fieldScale', value)} format={(value) => value.toFixed(2)} />
          <RangeControl label="Velocity" value={settings.velocity} min={0.05} max={1.8} step={0.01} onChange={(value) => updateSetting('velocity', value)} format={(value) => value.toFixed(2)} />
          <RangeControl label="Attractor" value={settings.attractor} min={0} max={1.5} step={0.01} onChange={(value) => updateSetting('attractor', value)} format={(value) => value.toFixed(2)} />
          <RangeControl label="Depth" value={settings.depth} min={0.2} max={4} step={0.1} onChange={(value) => updateSetting('depth', value)} format={(value) => value.toFixed(1)} />
          <RangeControl label="Point size" value={settings.pointSize} min={0.01} max={0.07} step={0.002} onChange={(value) => updateSetting('pointSize', value)} format={(value) => value.toFixed(3)} />
        </section>

        <section className="panel-section">
          <p className="section-label">Palette</p>
          <div className="palette-grid">
            {palettes.map((item) => (
              <button
                className={settings.palette === item.name ? 'palette active' : 'palette'}
                key={item.name}
                onClick={() => updateSetting('palette', item.name)}
                type="button"
              >
                <span>
                  {item.colors.map((color) => (
                    <i key={color} style={{ background: color }} />
                  ))}
                </span>
                {item.name}
              </button>
            ))}
          </div>
        </section>

        <div className="action-row">
          <button type="button" onClick={() => updateSetting('seed', Math.floor(Math.random() * 86000) + 10000)}>
            <Shuffle size={16} />
            Seed
          </button>
          <button type="button" onClick={() => setSettings(initialSettings)}>
            <RefreshCw size={16} />
            Reset
          </button>
          <button type="button" onClick={exportPreset}>
            <Download size={16} />
            JSON
          </button>
          <button type="button" onClick={() => presetInputRef.current?.click()}>
            <Upload size={16} />
            Import
          </button>
          <button type="button" onClick={exportImage}>
            <Camera size={16} />
            PNG
          </button>
          <input ref={presetInputRef} className="hidden-input" type="file" accept="application/json,.json" onChange={importPreset} />
        </div>
      </aside>

      <div className="readout">
        <span>
          <Crosshair size={15} />
          {settings.mode}
        </span>
        <strong>{palette.name}</strong>
        <span>{settings.count.toLocaleString()} particles</span>
      </div>
    </main>
  )
}

export default App
