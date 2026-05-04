"use client"

import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import {
  ArrowClockwise,
  ArrowsClockwise,
  BellRinging,
  Broadcast,
  CaretLeft,
  CaretRight,
  Clock,
  Copy,
  DeviceMobile,
  Eraser,
  Eye,
  EyeSlash,
  FloppyDisk,
  GlobeHemisphereWest,
  Lightning,
  Pause,
  Play,
  Plus,
  Power,
  Prohibit,
  PushPinSimple,
  SlidersHorizontal,
  SpeakerHigh,
  SpeakerSlash,
  Timer,
  Trash,
} from "@phosphor-icons/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type Appearance = {
  timerSize: string
  timerColor: string
  timerFont: string
  titleSize: string
  titleColor: string
  titleFont?: string
  notesSize: string
  notesColor: string
  notesFont?: string
  clockSize: string
  clockColor: string
  barColor: string
  barHeight: string
}

type Visibility = {
  showTimer: boolean
  showBar: boolean
  showClock: boolean
  showTitle: boolean
  showNotes: boolean
}

type PlaylistItem = {
  title: string
  notes?: string
  minutes: number
  seconds: number
  yellowSec?: number
  redSec?: number
}

type Preset = {
  id: string
  title?: string
  minutes: number
  seconds: number
  yellowSec?: number
  redSec?: number
}

type StageMessage = {
  id: string
  text: string
  color?: string
  bold?: boolean
  caps?: boolean
  flash?: boolean
  focus?: boolean
}

type RemoteDevice = {
  id: string
  deviceId: string
  ip?: string
  userAgent?: string
  type?: string
}

type ProjectorDisplay = {
  id: number
  label?: string
  isPrimary?: boolean
  bounds?: { width: number; height: number }
}

type ProjectorStatus = {
  active: boolean
  displayName?: string
  isExternal?: boolean
  isFullScreen?: boolean
  displayId?: number
  displays?: ProjectorDisplay[]
  allDisplays?: ProjectorDisplay[]
}

type AppConfig = {
  customPresets?: Preset[]
  localUrl?: string
  tunnelUrl?: string | null
  settings: {
    autoAdvance: boolean
    ttsEnabled: boolean
    alarmSound: string
    readPlaylistTitle: boolean
    appearance: Appearance
    visibility: Visibility
    wrapUp: {
      yellowMs: number
      redMs: number
      flashOnRed: boolean
      flashOnOvertime: boolean
      soundOnYellow: boolean
      soundOnRed: boolean
    }
    securityPin?: string
    requirePinController?: boolean
    playlists?: PlaylistItem[]
    requirePinProjector?: boolean
    blockedDevices?: string[]
    messages?: StageMessage[]
    activeMessageId?: string | null
    milestones?: number[]
    focusMode?: {
      enabled: boolean
      focusedItem: "timer" | "title" | "notes"
    }
  }
}

type TimerState = {
  remainingMs: number
  totalMs: number
  isRunning: boolean
  isPaused: boolean
  isOvertime: boolean
  overtimeMs: number
  customTitle?: string
  customNotes?: string
  currentTitle?: string
  config?: AppConfig
  currentPlaylistIndex?: number
  activeWrapUp?: AppConfig["settings"]["wrapUp"] | null
  projectorStatus?: ProjectorStatus
}

type TimerApi = {
  isRemote?: boolean
  start: (data: unknown) => unknown
  pause: () => unknown
  resume: () => unknown
  reset: () => unknown
  seek?: (ms: number) => unknown
  flash?: () => unknown
  savePreset?: (preset: Preset) => unknown
  deletePreset?: (id: string) => unknown
  setTitle: (title: string) => unknown
  setNotes: (notes: unknown) => unknown
  saveSettings: (settings: Record<string, unknown>) => unknown
  getState: () => Promise<TimerState>
  onUpdate: (cb: (state: TimerState) => void) => void
  onConfigUpdate: (cb: (config: AppConfig) => void) => void
  onFinished?: (cb: () => void) => void
  startTunnel?: () => Promise<string | null>
  stopTunnel?: () => Promise<boolean>
  refreshPin?: () => Promise<unknown>
  getDevices?: () => Promise<RemoteDevice[]>
  blockDevice?: (socketId: string, deviceId: string) => unknown
  unblockDevice?: (deviceId: string) => unknown
  onDevicesUpdate?: (cb: (devices: RemoteDevice[]) => void) => void
  onProjectorStatus?: (cb: (status: ProjectorStatus) => void) => void
  controlProjector?: (action: string, data?: Record<string, unknown>) => unknown
  register?: (pin: string) => unknown
}

declare global {
  interface Window {
    timerAPI?: TimerApi
    io?: () => SocketLike
  }

  interface WindowEventMap {
    "timer:authRequired": CustomEvent<string | undefined>
    "timer:authSuccess": CustomEvent
  }
}

type SocketLike = {
  connected: boolean
  emit: (event: string, ...args: unknown[]) => void
  on: (event: string, cb: (...args: never[]) => void) => void
  once: (event: string, cb: (...args: never[]) => void) => void
}

const defaultAppearance: Appearance = {
  timerSize: "24vw",
  timerColor: "#ffffff",
  timerFont: "Outfit",
  titleSize: "6vh",
  titleColor: "#ffffff",
  titleFont: "Outfit",
  notesSize: "4.5vh",
  notesColor: "#ffffff",
  notesFont: "Outfit",
  clockSize: "17vh",
  clockColor: "#f2f2f2",
  barColor: "#3b82f6",
  barHeight: "12px",
}

const defaultVisibility: Visibility = {
  showTimer: true,
  showBar: true,
  showClock: false,
  showTitle: true,
  showNotes: true,
}

const fontOptions = [
  { value: "Outfit", label: "Rounded Display" },
  { value: "Inter", label: "Modern Sans" },
  { value: "Oswald", label: "Condensed" },
  { value: "Impact", label: "Heavy" },
  { value: "Georgia", label: "Serif" },
  { value: "ui-monospace", label: "Monospace" },
  { value: "system-ui", label: "System UI" },
]

const defaultConfig: AppConfig = {
  customPresets: [],
  tunnelUrl: null,
  settings: {
    autoAdvance: false,
    ttsEnabled: true,
    alarmSound: "pulse",
    readPlaylistTitle: true,
    appearance: defaultAppearance,
    visibility: defaultVisibility,
    wrapUp: {
      yellowMs: 60000,
      redMs: 30000,
      flashOnRed: true,
      flashOnOvertime: true,
      soundOnYellow: false,
      soundOnRed: true,
    },
    securityPin: "----",
    requirePinController: true,
    requirePinProjector: true,
    blockedDevices: [],
    messages: [],
    activeMessageId: null,
    milestones: [600, 300, 120, 60, 30],
    playlists: [],
    focusMode: {
      enabled: false,
      focusedItem: "timer",
    },
  },
}

function formatTime(ms: number) {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function parseNumber(value: string | number | undefined, fallback = 0) {
  const next = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(next) ? next : fallback
}

function durationMs(item: Pick<PlaylistItem, "minutes" | "seconds">) {
  return Math.max(0, (parseNumber(item.minutes) * 60 + parseNumber(item.seconds)) * 1000)
}

function formatDuration(item: Pick<PlaylistItem, "minutes" | "seconds">) {
  return `${parseNumber(item.minutes)}m ${String(parseNumber(item.seconds)).padStart(2, "0")}s`
}

function buildWrapUp(
  item: Pick<PlaylistItem, "yellowSec" | "redSec">,
  settings: AppConfig["settings"],
) {
  if (!item.yellowSec && !item.redSec) return null
  return {
    yellowMs: (item.yellowSec || 60) * 1000,
    redMs: (item.redSec || 30) * 1000,
    flashOnRed: settings.wrapUp?.flashOnRed ?? true,
    flashOnOvertime: settings.wrapUp?.flashOnOvertime ?? true,
    soundOnYellow: settings.wrapUp?.soundOnYellow ?? false,
    soundOnRed: settings.wrapUp?.soundOnRed ?? true,
  }
}

function formatMilestone(seconds: number) {
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

function parseMilestones(value: string) {
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      if (part.endsWith("m")) return parseNumber(part, 0) * 60
      if (part.endsWith("s")) return parseNumber(part, 0)
      return parseNumber(part, 0)
    })
    .filter((seconds) => seconds > 0)
}

function normalizeFontValue(value?: string) {
  const normalized = String(value || "Outfit").trim().replace(/^['"]|['"]$/g, "")
  return fontOptions.some((option) => option.value === normalized) ? normalized : "Outfit"
}

function deviceName(userAgent = "") {
  if (userAgent.includes("iPhone")) return "iPhone"
  if (userAgent.includes("Android")) return "Android"
  if (userAgent.includes("Macintosh")) return "Mac"
  if (userAgent.includes("Windows")) return "Windows"
  return "Remote device"
}

function displayOptionLabel(display: ProjectorDisplay, index: number, currentDisplayId?: number) {
  const label = display.label || `Display ${index + 1}`
  const resolution = display.bounds ? `${display.bounds.width}x${display.bounds.height}` : ""
  const meta = [
    display.isPrimary ? "Primary" : "",
    display.id === currentDisplayId ? "Current" : "",
  ].filter(Boolean)

  return [label, resolution, meta.join(" - ")].filter(Boolean).join(" - ")
}

function normalizeCssLength(value: string, fallback: string, defaultUnit: string) {
  const raw = String(value || "").trim()
  if (!raw) return fallback
  if (/^-?\d+(\.\d+)?$/.test(raw)) return `${raw}${defaultUnit}`
  return raw
}

function createRemoteTimerApi(): TimerApi | undefined {
  if (!window.io) return undefined

  const socket = window.io()
  const getDeviceId = () => {
    const key = "remote_device_id"
    const saved = window.localStorage.getItem(key)
    if (saved) return saved
    const next = `dev-${Math.random().toString(36).slice(2, 11)}`
    window.localStorage.setItem(key, next)
    return next
  }

  socket.on("connect", () => {
    socket.emit("timer:identify", { deviceId: getDeviceId(), userAgent: navigator.userAgent })
    socket.emit("timer:getState", (state: TimerState) => {
      if (state?.config?.settings?.requirePinController === false) {
        socket.emit("register", {
          pin: "",
          clientType: "controller",
          deviceId: getDeviceId(),
          userAgent: navigator.userAgent,
        })
        return
      }

      const savedPin = window.sessionStorage.getItem("production_pin")
      if (savedPin) {
        socket.emit("register", {
          pin: savedPin,
          clientType: "controller",
          deviceId: getDeviceId(),
          userAgent: navigator.userAgent,
        })
        return
      }

      window.dispatchEvent(new CustomEvent("timer:authRequired"))
    })
  })

  socket.on("registered", ({ success, error }: { success?: boolean; error?: string }) => {
    if (success) {
      window.dispatchEvent(new CustomEvent("timer:authSuccess"))
    } else {
      window.sessionStorage.removeItem("production_pin")
      window.dispatchEvent(new CustomEvent("timer:authRequired", { detail: error || "Invalid PIN" }))
    }
  })

  socket.on("auth:error", (message: string) => {
    window.sessionStorage.removeItem("production_pin")
    window.dispatchEvent(new CustomEvent("timer:authRequired", { detail: message }))
  })

  return {
    isRemote: true,
    start: (data) => socket.emit("timer:start", data),
    pause: () => socket.emit("timer:pause"),
    resume: () => socket.emit("timer:resume"),
    reset: () => socket.emit("timer:reset"),
    seek: (ms) => socket.emit("timer:seek", ms),
    flash: () => socket.emit("timer:flash"),
    savePreset: (preset) => socket.emit("timer:savePreset", preset),
    deletePreset: (id) => socket.emit("timer:deletePreset", id),
    setTitle: (title) => socket.emit("timer:setTitle", title),
    setNotes: (notes) => socket.emit("timer:setNotes", notes),
    saveSettings: (settings) => socket.emit("timer:saveSettings", settings),
    getState: () =>
      new Promise((resolve) => {
        socket.emit("timer:getState", (state: TimerState) => resolve(state))
        socket.once("timer:state", (state: TimerState) => resolve(state))
        setTimeout(() => resolve({ ...emptyState, config: defaultConfig }), 1500)
      }),
    onUpdate: (cb) => socket.on("timer:update", cb as never),
    onConfigUpdate: (cb) => socket.on("timer:configUpdate", cb as never),
    onFinished: (cb) => socket.on("timer:finished", cb as never),
    startTunnel: () =>
      new Promise((resolve) => {
        socket.once("timer:tunnelResult", (result: { success?: boolean; url?: string }) => resolve(result?.url || null))
        socket.emit("timer:startTunnel")
      }),
    stopTunnel: () =>
      new Promise((resolve) => {
        socket.once("timer:tunnelStopped", () => resolve(true))
        socket.emit("timer:stopTunnel")
      }),
    refreshPin: () => new Promise((resolve) => socket.emit("timer:refreshPin", resolve)),
    getDevices: () =>
      new Promise((resolve) => {
        socket.once("timer:devicesUpdate", (devices: RemoteDevice[]) => resolve(devices || []))
        socket.emit("timer:getDevices")
      }),
    blockDevice: (socketId, deviceId) => socket.emit("timer:blockDevice", { socketId, deviceId }),
    unblockDevice: (deviceId) => socket.emit("timer:unblockDevice", deviceId),
    onDevicesUpdate: (cb) => socket.on("timer:devicesUpdate", cb as never),
    onProjectorStatus: (cb) => socket.on("timer:projectorStatus", cb as never),
    controlProjector: (action, data) => socket.emit("timer:controlProjector", action, data),
    register: (pin) => {
      window.sessionStorage.setItem("production_pin", pin)
      socket.emit("register", {
        pin,
        clientType: "controller",
        deviceId: getDeviceId(),
        userAgent: navigator.userAgent,
      })
    },
  }
}

const emptyState: TimerState = {
  remainingMs: 0,
  totalMs: 0,
  isRunning: false,
  isPaused: false,
  isOvertime: false,
  overtimeMs: 0,
  config: defaultConfig,
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function VisibilityRow({
  label,
  checked,
  onCheckedChange,
  icon,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-background/40 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        {label}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export default function Page() {
  const [api, setApi] = useState<TimerApi | null>(null)
  const [state, setState] = useState<TimerState>(emptyState)
  const [config, setConfig] = useState<AppConfig>(defaultConfig)
  const [minutes, setMinutes] = useState("5")
  const [seconds, setSeconds] = useState("0")
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [appearance, setAppearance] = useState<Appearance>(defaultAppearance)
  const [visibility, setVisibility] = useState<Visibility>(defaultVisibility)
  const [connection, setConnection] = useState("Connecting")
  const [playlistDraft, setPlaylistDraft] = useState<PlaylistItem>({
    title: "",
    notes: "",
    minutes: 10,
    seconds: 0,
  })
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false)
  const [milestonesDraft, setMilestonesDraft] = useState("")
  const [devices, setDevices] = useState<RemoteDevice[]>([])
  const [projectorStatus, setProjectorStatus] = useState<ProjectorStatus>({ active: false, displays: [] })
  const [muted, setMuted] = useState(false)
  const [copyStatus, setCopyStatus] = useState("")
  const [qrDataUrl, setQrDataUrl] = useState("")
  const [authRequired, setAuthRequired] = useState(false)
  const [authError, setAuthError] = useState("")
  const [pinDraft, setPinDraft] = useState("")
  const [timerYellowSec, setTimerYellowSec] = useState("60")
  const [timerRedSec, setTimerRedSec] = useState("30")

  useEffect(() => {
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined

    const setup = () => {
      const bridge = window.timerAPI || createRemoteTimerApi()
      if (!bridge) {
        retry = setTimeout(setup, 250)
        return
      }

      if (cancelled) return
      setApi(bridge)
      setConnection(bridge.isRemote ? "Remote" : "Local")
      bridge.onUpdate((nextState) => {
        setState(nextState)
        if (nextState.projectorStatus) setProjectorStatus(nextState.projectorStatus)
        if (nextState.config) {
          setConfig(nextState.config)
          setAppearance({ ...defaultAppearance, ...nextState.config.settings.appearance })
          setVisibility({ ...defaultVisibility, ...nextState.config.settings.visibility })
          setMilestonesDraft((nextState.config.settings.milestones || []).map(formatMilestone).join(", "))
        }
      })
      bridge.onConfigUpdate((nextConfig) => {
        setConfig(nextConfig)
        setAppearance({ ...defaultAppearance, ...nextConfig.settings.appearance })
        setVisibility({ ...defaultVisibility, ...nextConfig.settings.visibility })
        setMilestonesDraft((nextConfig.settings.milestones || []).map(formatMilestone).join(", "))
      })
      bridge.onDevicesUpdate?.(setDevices)
      bridge.onProjectorStatus?.(setProjectorStatus)
      bridge.getState().then((nextState) => {
        if (cancelled) return
        setState(nextState)
        if (nextState.projectorStatus) setProjectorStatus(nextState.projectorStatus)
        const nextConfig = nextState.config || defaultConfig
        setConfig(nextConfig)
        setAppearance({ ...defaultAppearance, ...nextConfig.settings.appearance })
        setVisibility({ ...defaultVisibility, ...nextConfig.settings.visibility })
        setMilestonesDraft((nextConfig.settings.milestones || []).map(formatMilestone).join(", "))
        setTitle(nextState.currentTitle || nextState.customTitle || "")
        setNotes(String(nextState.customNotes || ""))
      })
      bridge.getDevices?.().then(setDevices)
    }

    setup()
    return () => {
      cancelled = true
      if (retry) clearTimeout(retry)
    }
  }, [])

  const displayTime = state.isOvertime ? `-${formatTime(state.overtimeMs)}` : formatTime(state.remainingMs)
  const progress = useMemo(() => {
    if (!state.totalMs) return 0
    if (state.isOvertime) return 100
    return Math.min(100, Math.max(0, (1 - state.remainingMs / state.totalMs) * 100))
  }, [state.isOvertime, state.remainingMs, state.totalMs])
  const elapsedMs = state.isOvertime ? state.totalMs : Math.max(0, state.totalMs - state.remainingMs)
  const playlist = config.settings.playlists || []
  const presets = config.customPresets || []
  const messages = config.settings.messages || []
  const activePlaylistIndex = state.currentPlaylistIndex ?? -1
  const localControllerUrl =
    config.localUrl || (typeof window !== "undefined" ? `${window.location.origin}` : "http://localhost:8321")
  const localProjectorUrl = `${localControllerUrl.replace(/\/$/, "")}/projector`
  const qrTargetUrl = config.tunnelUrl ? `${config.tunnelUrl.replace(/\/$/, "")}/projector` : localProjectorUrl
  const projectorDisplays = projectorStatus.displays?.length
    ? projectorStatus.displays
    : projectorStatus.allDisplays || []
  const selectedProjectorDisplayId = projectorStatus.displayId ?? projectorDisplays[0]?.id

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(qrTargetUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 220,
      color: { dark: "#111111", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [qrTargetUrl])

  useEffect(() => {
    const requireAuth = (event: CustomEvent<string | undefined>) => {
      setAuthRequired(true)
      setAuthError(event.detail || "")
    }
    const authSuccess = () => {
      setAuthRequired(false)
      setAuthError("")
      setPinDraft("")
    }
    window.addEventListener("timer:authRequired", requireAuth)
    window.addEventListener("timer:authSuccess", authSuccess)
    return () => {
      window.removeEventListener("timer:authRequired", requireAuth)
      window.removeEventListener("timer:authSuccess", authSuccess)
    }
  }, [])

  const saveVisibility = (next: Visibility) => {
    setVisibility(next)
    api?.saveSettings({ visibility: next })
  }

  const updateAppearance = (patch: Partial<Appearance>) => {
    setAppearance((current) => ({ ...current, ...patch }))
  }

  const startTimer = () => {
    const mins = Number.parseInt(minutes) || 0
    const secs = Number.parseInt(seconds) || 0
    const ms = (mins * 60 + secs) * 1000
    const wrapUp = buildWrapUp(
      {
        yellowSec: parseNumber(timerYellowSec, 0),
        redSec: parseNumber(timerRedSec, 0),
      },
      config.settings,
    )
    api?.setTitle(title)
    api?.setNotes(notes)
    api?.start({ ms, title, notes, wrapUp })
  }

  const runPlaylistItem = (item: PlaylistItem, index: number) => {
    setMinutes(String(item.minutes))
    setSeconds(String(item.seconds))
    setTitle(item.title)
    setNotes(item.notes || "")
    api?.setTitle(item.title)
    api?.setNotes(item.notes || "")
    api?.start({
      ms: durationMs(item),
      index,
      title: item.title,
      notes: item.notes || "",
      wrapUp: buildWrapUp(item, config.settings),
    })
  }

  const savePlaylist = (next: PlaylistItem[]) => {
    api?.saveSettings({ playlists: next })
    setConfig((current) => ({ ...current, settings: { ...current.settings, playlists: next } }))
  }

  const addPlaylistItem = () => {
    const nextItem = {
      ...playlistDraft,
      title: playlistDraft.title.trim() || "Untitled timer",
      minutes: Math.max(0, parseNumber(playlistDraft.minutes)),
      seconds: clampNumber(parseNumber(playlistDraft.seconds), 0, 59),
    }
    savePlaylist([...playlist, nextItem])
    setPlaylistDraft({ title: "", notes: "", minutes: 10, seconds: 0 })
    setPlaylistDialogOpen(false)
  }

  const updatePlaylistItem = (index: number, patch: Partial<PlaylistItem>) => {
    const next = playlist.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      return {
        ...item,
        ...patch,
        seconds: patch.seconds === undefined ? item.seconds : clampNumber(parseNumber(patch.seconds), 0, 59),
        minutes: patch.minutes === undefined ? item.minutes : Math.max(0, parseNumber(patch.minutes)),
      }
    })
    savePlaylist(next)
    if (index === activePlaylistIndex && patch.title !== undefined) api?.setTitle(patch.title || "")
  }

  const removePlaylistItem = (index: number) => {
    savePlaylist(playlist.filter((_, itemIndex) => itemIndex !== index))
    if (index === activePlaylistIndex) api?.reset()
  }

  const runNextPlaylistItem = () => {
    if (!playlist.length) return
    const nextIndex = clampNumber(activePlaylistIndex + 1, 0, playlist.length - 1)
    runPlaylistItem(playlist[nextIndex], nextIndex)
  }

  const runPreviousPlaylistItem = () => {
    if (!playlist.length) return
    const nextIndex = clampNumber(activePlaylistIndex - 1, 0, playlist.length - 1)
    runPlaylistItem(playlist[nextIndex], nextIndex)
  }

  const clearPlaylist = () => {
    if (!window.confirm("Clear the entire playlist lineup?")) return
    api?.reset()
    api?.setNotes("")
    savePlaylist([])
  }

  const applyPreset = (preset: Preset) => {
    setMinutes(String(preset.minutes))
    setSeconds(String(preset.seconds))
    setTitle(preset.title || "")
    setTimerYellowSec(String(preset.yellowSec || Math.floor((config.settings.wrapUp.yellowMs || 60000) / 1000)))
    setTimerRedSec(String(preset.redSec || Math.floor((config.settings.wrapUp.redMs || 30000) / 1000)))
  }

  const saveCurrentPreset = () => {
    const mins = Math.max(0, parseNumber(minutes))
    const secs = clampNumber(parseNumber(seconds), 0, 59)
    api?.savePreset?.({
      id: Date.now().toString(),
      minutes: mins,
      seconds: secs,
      title: title || `${mins}m ${secs}s`,
      yellowSec: Math.max(0, parseNumber(timerYellowSec, 0)),
      redSec: Math.max(0, parseNumber(timerRedSec, 0)),
    })
  }

  const showMessage = (message: StageMessage) => {
    api?.saveSettings({ activeMessageId: message.id })
    api?.setNotes(message)
  }

  const saveMessages = (next: StageMessage[], activeMessageId = config.settings.activeMessageId) => {
    api?.saveSettings({ messages: next, activeMessageId })
    setConfig((current) => ({
      ...current,
      settings: { ...current.settings, messages: next, activeMessageId },
    }))
  }

  const updateMessage = (id: string, patch: Partial<StageMessage>) => {
    const next = messages.map((message) => (message.id === id ? { ...message, ...patch } : message))
    saveMessages(next)
    const active = next.find((message) => message.id === id && config.settings.activeMessageId === id)
    if (active) api?.setNotes(active)
  }

  const addMessage = () => {
    const nextMessage: StageMessage = {
      id: Date.now().toString(),
      text: "New message",
      color: "#ffffff",
      bold: true,
      caps: false,
      flash: false,
      focus: false,
    }
    saveMessages([...messages, nextMessage])
  }

  const clearMessage = () => {
    api?.setNotes("")
    api?.saveSettings({ activeMessageId: null })
    setConfig((current) => ({ ...current, settings: { ...current.settings, activeMessageId: null } }))
  }

  const deleteMessage = (id: string) => {
    const wasActive = config.settings.activeMessageId === id
    saveMessages(messages.filter((message) => message.id !== id), wasActive ? null : config.settings.activeMessageId)
    if (wasActive) api?.setNotes("")
  }

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard?.writeText(value)
    setCopyStatus(`${label} copied`)
    setTimeout(() => setCopyStatus(""), 1500)
  }

  const saveAppearance = () => {
    const nextAppearance = {
      ...appearance,
      timerSize: normalizeCssLength(appearance.timerSize, defaultAppearance.timerSize, "vw"),
      titleSize: normalizeCssLength(appearance.titleSize, defaultAppearance.titleSize, "vh"),
      notesSize: normalizeCssLength(appearance.notesSize, defaultAppearance.notesSize, "vh"),
      clockSize: normalizeCssLength(appearance.clockSize, defaultAppearance.clockSize, "vh"),
      barHeight: normalizeCssLength(appearance.barHeight, defaultAppearance.barHeight, "px"),
      timerFont: normalizeFontValue(appearance.timerFont),
      titleFont: normalizeFontValue(appearance.titleFont),
      notesFont: normalizeFontValue(appearance.notesFont),
    }
    setAppearance(nextAppearance)
    api?.saveSettings({ appearance: nextAppearance })
  }

  const resetAppearance = () => {
    setAppearance(defaultAppearance)
    api?.saveSettings({
      appearance: defaultAppearance,
      focusMode: {
        enabled: false,
        focusedItem: "timer",
      },
    })
  }

  const updateFocusMode = (patch: Partial<NonNullable<AppConfig["settings"]["focusMode"]>>) => {
    const nextFocus = {
      enabled: config.settings.focusMode?.enabled ?? false,
      focusedItem: config.settings.focusMode?.focusedItem ?? "timer",
      ...patch,
    }
    updateSettings({ focusMode: nextFocus })
    api?.saveSettings({ focusMode: nextFocus })
  }

  const saveSettings = () => {
    api?.saveSettings({
      autoAdvance: config.settings.autoAdvance,
      ttsEnabled: config.settings.ttsEnabled,
      readPlaylistTitle: config.settings.readPlaylistTitle,
      alarmSound: config.settings.alarmSound,
      milestones: parseMilestones(milestonesDraft),
      wrapUp: config.settings.wrapUp,
      visibility,
    })
  }

  const updateSettings = (patch: Partial<AppConfig["settings"]>) => {
    setConfig((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...patch,
      },
    }))
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 lg:p-6">
        <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Broadcast className="size-3.5" />
                {connection}
              </Badge>
              <Badge variant={state.isRunning ? "default" : "secondary"}>
                {state.isRunning ? "Running" : state.isPaused ? "Paused" : "Idle"}
              </Badge>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Down to Earth</h1>
            <p className="text-sm text-muted-foreground">Production timer controller</p>
          </div>

          <div className="grid min-w-0 gap-2 rounded-xl border bg-card px-4 py-3 text-right">
            <div className="text-5xl font-semibold tabular-nums tracking-tight">{displayTime}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </header>

        <Tabs defaultValue="timer" className="grid gap-4">
          <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 lg:w-fit">
            <TabsTrigger value="timer">Timer</TabsTrigger>
            <TabsTrigger value="playlist">Playlist</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="output">Output</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="timer">
            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Run Timer</CardTitle>
                  <CardDescription>Set a duration and send it to every connected display.</CardDescription>
                  <CardAction>
                    <Button variant="outline" size="icon" onClick={() => api?.flash?.()} title="Flash projector">
                      <Lightning />
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="rounded-lg border bg-muted/25 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{formatTime(elapsedMs)} elapsed</span>
                      <span>{state.totalMs ? formatTime(state.totalMs) : "No timer loaded"}</span>
                    </div>
                    <Slider
                      value={[elapsedMs]}
                      min={0}
                      max={Math.max(state.totalMs, 1)}
                      step={1000}
                      disabled={!state.totalMs || !api?.seek}
                      onValueCommit={([value]) => api?.seek?.(Math.max(0, state.totalMs - value))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Minutes">
                      <Input inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
                    </Field>
                    <Field label="Seconds">
                      <Input inputMode="numeric" value={seconds} onChange={(event) => setSeconds(event.target.value)} />
                    </Field>
                  </div>
                  <Field label="Title">
                    <Input
                      value={title}
                      placeholder="e.g. Main session"
                      onChange={(event) => {
                        setTitle(event.target.value)
                        api?.setTitle(event.target.value)
                      }}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Yellow warning">
                      <Input
                        inputMode="numeric"
                        value={timerYellowSec}
                        onChange={(event) => setTimerYellowSec(event.target.value)}
                      />
                    </Field>
                    <Field label="Red warning">
                      <Input
                        inputMode="numeric"
                        value={timerRedSec}
                        onChange={(event) => setTimerRedSec(event.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button className="h-11" onClick={startTimer}>
                      <Play />
                      {state.isRunning || state.isPaused ? "Restart" : "Start"}
                    </Button>
                    <Button
                      className="h-11"
                      variant="secondary"
                      disabled={!state.isRunning && !state.isPaused}
                      onClick={() => (state.isPaused ? api?.resume() : api?.pause())}
                    >
                      {state.isPaused ? <Play /> : <Pause />}
                      {state.isPaused ? "Resume" : "Pause"}
                    </Button>
                    <Button className="h-11" variant="outline" onClick={() => api?.reset()}>
                      <ArrowClockwise />
                      Reset
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Quick presets</Label>
                      <Button variant="ghost" size="sm" onClick={saveCurrentPreset}>
                        <FloppyDisk />
                        Save
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                      {[5, 10, 20, 30, 45, 60].map((presetMinutes) => (
                        <Button
                          key={presetMinutes}
                          variant="secondary"
                          onClick={() => {
                            setMinutes(String(presetMinutes))
                            setSeconds("0")
                          }}
                        >
                          {presetMinutes}m
                        </Button>
                      ))}
                    </div>
                    {presets.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {presets.map((preset) => (
                          <div key={preset.id} className="flex items-center gap-2 rounded-lg border bg-background/40 p-2">
                            <button className="min-w-0 flex-1 text-left" onClick={() => applyPreset(preset)}>
                              <div className="truncate text-sm font-medium">{preset.title || "Preset"}</div>
                              <div className="text-xs text-muted-foreground">{formatDuration(preset)}</div>
                            </button>
                            <Button variant="ghost" size="icon" onClick={() => api?.deletePreset?.(preset.id)} title="Delete preset">
                              <Trash />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Rundown</CardTitle>
                  <CardDescription>Saved playlist items from the current production file.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-72 pr-3">
                    <div className="grid gap-2">
                      {(config.settings.playlists || []).length === 0 ? (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                          No playlist items yet.
                        </div>
                      ) : (
                        playlist.map((item, index) => (
                          <div key={`${item.title}-${index}`} className="rounded-lg border bg-background/40 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium">{item.title || "Untitled"}</div>
                                <div className="text-xs text-muted-foreground">
                                  {item.minutes}m {item.seconds}s
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => runPlaylistItem(item, index)}
                              >
                                <Play />
                                Run
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="playlist">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Playlist Builder</CardTitle>
                  <CardDescription>Build the show lineup, edit durations inline, and run items without leaving the tab.</CardDescription>
                  <CardAction>
                    <Button onClick={() => setPlaylistDialogOpen(true)}>
                      <Plus />
                      Add Timer
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {playlist.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                      No playlist items yet. Add timers for each show segment.
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {playlist.map((item, index) => {
                        const isActive = index === activePlaylistIndex
                        return (
                          <div
                            key={`${item.title}-${index}`}
                            className={`grid gap-3 rounded-lg border p-3 ${isActive ? "border-primary bg-primary/5" : "bg-background/40"}`}
                          >
                            <div className="grid gap-3 lg:grid-cols-[1fr_96px_96px_auto] lg:items-end">
                              <Field label={`Item ${index + 1}`}>
                                <Input
                                  value={item.title}
                                  onChange={(event) => updatePlaylistItem(index, { title: event.target.value })}
                                />
                              </Field>
                              <Field label="Minutes">
                                <Input
                                  inputMode="numeric"
                                  value={item.minutes}
                                  onChange={(event) => updatePlaylistItem(index, { minutes: parseNumber(event.target.value) })}
                                />
                              </Field>
                              <Field label="Seconds">
                                <Input
                                  inputMode="numeric"
                                  value={item.seconds}
                                  onChange={(event) => updatePlaylistItem(index, { seconds: parseNumber(event.target.value) })}
                                />
                              </Field>
                              <div className="flex gap-2">
                                <Button variant={isActive ? "default" : "outline"} onClick={() => runPlaylistItem(item, index)}>
                                  <Play />
                                  Run
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removePlaylistItem(index)}
                                  title="Remove item"
                                >
                                  <Trash />
                                </Button>
                              </div>
                            </div>
                            <Textarea
                              className="min-h-20 resize-none"
                              value={item.notes || ""}
                              placeholder="Production cues for this item..."
                              onChange={(event) => updatePlaylistItem(index, { notes: event.target.value })}
                            />
                            {isActive && (
                              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" disabled={!playlist.length} onClick={runPreviousPlaylistItem}>
                      <CaretLeft />
                      Prev
                    </Button>
                    <Button disabled={!playlist.length} onClick={runNextPlaylistItem}>
                      <CaretRight />
                      Next
                    </Button>
                    <Button variant="outline" disabled={!playlist.length} onClick={clearPlaylist}>
                      <Eraser />
                      Clear
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="messages">
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Production Notes</CardTitle>
                  <CardDescription>Send live stage cues to the projector.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Textarea
                    className="min-h-40 resize-none"
                    value={notes}
                    placeholder="Type a stage note..."
                    onChange={(event) => {
                      setNotes(event.target.value)
                      api?.setNotes(event.target.value)
                    }}
                  />
                  <div className="flex justify-end">
                    <Button variant="outline" onClick={() => api?.setNotes("")}>
                      Clear Notes
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Message Library</CardTitle>
                  <CardDescription>Reusable stage messages with emphasis controls.</CardDescription>
                  <CardAction>
                    <Button variant="outline" onClick={addMessage}>
                      <Plus />
                      Add
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {messages.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No saved messages yet.
                    </div>
                  ) : (
                    messages.map((message) => {
                      const isActive = config.settings.activeMessageId === message.id
                      return (
                        <div
                          key={message.id}
                          className={`grid gap-3 rounded-lg border p-3 ${isActive ? "border-primary bg-primary/5" : "bg-background/40"}`}
                        >
                          <Textarea
                            value={message.text}
                            className="min-h-20 resize-none"
                            onChange={(event) => updateMessage(message.id, { text: event.target.value })}
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              className="h-9 w-14 p-1"
                              type="color"
                              value={message.color || "#ffffff"}
                              onChange={(event) => updateMessage(message.id, { color: event.target.value })}
                            />
                            <Button
                              size="sm"
                              variant={message.bold ? "default" : "outline"}
                              onClick={() => updateMessage(message.id, { bold: !message.bold })}
                            >
                              Bold
                            </Button>
                            <Button
                              size="sm"
                              variant={message.caps ? "default" : "outline"}
                              onClick={() => updateMessage(message.id, { caps: !message.caps })}
                            >
                              Caps
                            </Button>
                            <Button
                              size="sm"
                              variant={message.flash ? "default" : "outline"}
                              onClick={() => updateMessage(message.id, { flash: !message.flash })}
                            >
                              Flash
                            </Button>
                            <Button
                              size="sm"
                              variant={message.focus ? "default" : "outline"}
                              onClick={() => updateMessage(message.id, { focus: !message.focus })}
                            >
                              Focus
                            </Button>
                            <div className="ml-auto flex gap-2">
                              <Button size="sm" onClick={() => showMessage(message)}>
                                <PushPinSimple />
                                Show
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteMessage(message.id)}
                                title="Delete message"
                              >
                                <Trash />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <Button variant="outline" onClick={clearMessage}>
                    <EyeSlash />
                    Hide Active Message
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="appearance">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Countdown</CardTitle>
                  <CardDescription>Primary timer typography and color.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Field label="Timer size">
                    <Input value={appearance.timerSize} onChange={(event) => updateAppearance({ timerSize: event.target.value })} />
                  </Field>
                  <Field label="Timer color">
                    <Input type="color" value={appearance.timerColor} onChange={(event) => updateAppearance({ timerColor: event.target.value })} />
                  </Field>
                  <Field label="Timer font">
                    <Select value={normalizeFontValue(appearance.timerFont)} onValueChange={(value) => updateAppearance({ timerFont: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fontOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Title & Notes</CardTitle>
                  <CardDescription>Stage text sizing now accepts plain numbers too.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Field label="Title size">
                    <Input value={appearance.titleSize} onChange={(event) => updateAppearance({ titleSize: event.target.value })} />
                  </Field>
                  <Field label="Title color">
                    <Input type="color" value={appearance.titleColor} onChange={(event) => updateAppearance({ titleColor: event.target.value })} />
                  </Field>
                  <Field label="Title font">
                    <Select value={normalizeFontValue(appearance.titleFont)} onValueChange={(value) => updateAppearance({ titleFont: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fontOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Separator />
                  <Field label="Notes size">
                    <Input value={appearance.notesSize} onChange={(event) => updateAppearance({ notesSize: event.target.value })} />
                  </Field>
                  <Field label="Notes color">
                    <Input type="color" value={appearance.notesColor} onChange={(event) => updateAppearance({ notesColor: event.target.value })} />
                  </Field>
                  <Field label="Notes font">
                    <Select value={normalizeFontValue(appearance.notesFont)} onValueChange={(value) => updateAppearance({ notesFont: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fontOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Clock & Bar</CardTitle>
                  <CardDescription>Independent clock size and progress styling.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Field label="Clock size">
                    <Input value={appearance.clockSize} onChange={(event) => updateAppearance({ clockSize: event.target.value })} />
                  </Field>
                  <Field label="Clock color">
                    <Input type="color" value={appearance.clockColor} onChange={(event) => updateAppearance({ clockColor: event.target.value })} />
                  </Field>
                  <Separator />
                  <Field label="Bar height">
                    <Input value={appearance.barHeight} onChange={(event) => updateAppearance({ barHeight: event.target.value })} />
                  </Field>
                  <Field label="Bar color">
                    <Input type="color" value={appearance.barColor} onChange={(event) => updateAppearance({ barColor: event.target.value })} />
                  </Field>
                  <Separator />
                  <VisibilityRow
                    label="Focus mode"
                    icon={<Eye className="size-4" />}
                    checked={config.settings.focusMode?.enabled ?? false}
                    onCheckedChange={(checked) => updateFocusMode({ enabled: checked })}
                  />
                  <Field label="Focus target">
                    <Select
                      value={config.settings.focusMode?.focusedItem || "timer"}
                      onValueChange={(value) =>
                        updateFocusMode({ focusedItem: value as NonNullable<AppConfig["settings"]["focusMode"]>["focusedItem"] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="timer">Timer</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                        <SelectItem value="notes">Notes</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Button className="mt-2" onClick={saveAppearance}>
                      <FloppyDisk />
                      Apply
                    </Button>
                    <Button className="mt-2" variant="outline" onClick={resetAppearance}>
                      <ArrowClockwise />
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="output">
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Links & Security</CardTitle>
                  <CardDescription>Share local or tunnel access and manage remote unlock behavior.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <Field label="Controller URL">
                    <div className="flex gap-2">
                      <Input readOnly value={localControllerUrl} />
                      <Button variant="outline" size="icon" onClick={() => copyText(localControllerUrl, "Controller URL")}>
                        <Copy />
                      </Button>
                    </div>
                  </Field>
                  <Field label="Projector URL">
                    <div className="flex gap-2">
                      <Input readOnly value={localProjectorUrl} />
                      <Button variant="outline" size="icon" onClick={() => copyText(localProjectorUrl, "Projector URL")}>
                        <Copy />
                      </Button>
                    </div>
                  </Field>
                  <div className="grid gap-3 rounded-lg border bg-muted/25 p-3 sm:grid-cols-[auto_1fr] sm:items-center">
                    <div className="flex size-40 items-center justify-center rounded-md bg-white p-2">
                      {qrDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={qrDataUrl} alt="Projector QR code" className="size-full" />
                      ) : (
                        <div className="text-xs text-muted-foreground">QR</div>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm font-medium">Projector QR</div>
                      <div className="break-all text-xs text-muted-foreground">{qrTargetUrl}</div>
                      <Button variant="secondary" onClick={() => copyText(qrTargetUrl, "QR URL")}>
                        <Copy />
                        Copy QR URL
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2 rounded-lg border bg-muted/25 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">Remote PIN</div>
                        <div className="font-mono text-3xl font-semibold tracking-widest">
                          {config.settings.securityPin || "----"}
                        </div>
                      </div>
                      <Button variant="outline" onClick={() => window.confirm("Generate a new PIN and disconnect remote devices?") && api?.refreshPin?.()}>
                        <ArrowClockwise />
                        Refresh
                      </Button>
                    </div>
                    <VisibilityRow
                      label="Require PIN for controllers"
                      icon={<DeviceMobile className="size-4" />}
                      checked={config.settings.requirePinController !== false}
                      onCheckedChange={(checked) => {
                        updateSettings({ requirePinController: checked })
                        api?.saveSettings({ requirePinController: checked })
                      }}
                    />
                    <VisibilityRow
                      label="Require PIN for projectors"
                      icon={<Broadcast className="size-4" />}
                      checked={config.settings.requirePinProjector !== false}
                      onCheckedChange={(checked) => {
                        updateSettings({ requirePinProjector: checked })
                        api?.saveSettings({ requirePinProjector: checked })
                      }}
                    />
                  </div>
                  <div className="grid gap-2 rounded-lg border bg-muted/25 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Public tunnel</div>
                        <div className="text-xs text-muted-foreground">{config.tunnelUrl || "Not active"}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={async () => {
                            const url = await api?.startTunnel?.()
                            if (url) setConfig((current) => ({ ...current, tunnelUrl: url }))
                          }}
                        >
                          <GlobeHemisphereWest />
                          Go Global
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!config.tunnelUrl}
                          onClick={async () => {
                            await api?.stopTunnel?.()
                            setConfig((current) => ({ ...current, tunnelUrl: null }))
                          }}
                        >
                          Stop
                        </Button>
                      </div>
                    </div>
                    {config.tunnelUrl && (
                      <Button variant="secondary" onClick={() => copyText(config.tunnelUrl || "", "Tunnel URL")}>
                        <Copy />
                        Copy Tunnel URL
                      </Button>
                    )}
                  </div>
                  {copyStatus && <div className="text-sm text-muted-foreground">{copyStatus}</div>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Remote Devices</CardTitle>
                  <CardDescription>Monitor connected phones, tablets, browsers, and projector clients.</CardDescription>
                  <CardAction>
                    <Badge variant="secondary">{devices.length} Active</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[420px] pr-3">
                    <div className="grid gap-2">
                      {devices.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                          No remote devices connected.
                        </div>
                      ) : (
                        devices.map((device) => {
                          const isBlocked = config.settings.blockedDevices?.includes(device.deviceId)
                          return (
                            <div key={`${device.id}-${device.deviceId}`} className="flex items-center gap-3 rounded-lg border bg-background/40 p-3">
                              <DeviceMobile className="size-5 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">
                                  {deviceName(device.userAgent)} {isBlocked ? "(Blocked)" : ""}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {(device.ip || "").replace("::ffff:", "")} · {device.deviceId}
                                </div>
                              </div>
                              {isBlocked ? (
                                <Button size="sm" variant="outline" onClick={() => api?.unblockDevice?.(device.deviceId)}>
                                  Unblock
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.confirm("Block this remote device?") && api?.blockDevice?.(device.id, device.deviceId)}
                                >
                                  <Prohibit />
                                  Block
                                </Button>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Production Settings</CardTitle>
                  <CardDescription>Operational preferences shared with connected clients.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                <VisibilityRow
                  label="Auto-advance"
                  icon={<ArrowsClockwise className="size-4" />}
                  checked={config.settings.autoAdvance}
                  onCheckedChange={(checked) => updateSettings({ autoAdvance: checked })}
                />
                <VisibilityRow
                  label="TTS announcements"
                  icon={<BellRinging className="size-4" />}
                  checked={config.settings.ttsEnabled}
                  onCheckedChange={(checked) => updateSettings({ ttsEnabled: checked })}
                />
                <VisibilityRow
                  label="Read playlist titles"
                  icon={<Broadcast className="size-4" />}
                  checked={config.settings.readPlaylistTitle}
                  onCheckedChange={(checked) => updateSettings({ readPlaylistTitle: checked })}
                />
                <Field label="Alarm sound">
                  <Select value={config.settings.alarmSound} onValueChange={(value) => updateSettings({ alarmSound: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pulse">Pulse</SelectItem>
                      <SelectItem value="chime">Chime</SelectItem>
                      <SelectItem value="gong">Gong</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Milestones">
                  <Input value={milestonesDraft} onChange={(event) => setMilestonesDraft(event.target.value)} placeholder="10m, 5m, 2m, 60s, 30s" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={muted ? "outline" : "secondary"}
                    onClick={() => setMuted((current) => !current)}
                  >
                    {muted ? <SpeakerSlash /> : <SpeakerHigh />}
                    {muted ? "Muted" : "Audio On"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const audio = new Audio()
                      audio.volume = muted ? 0 : 0.8
                      audio.src =
                        "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVYGAACAgICAgH+Af4B/gH+Af4B/gH+Af4B/gH+Af4CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg"
                      void audio.play()
                    }}
                  >
                    <BellRinging />
                    Test
                  </Button>
                </div>
                  <Button onClick={saveSettings}>
                    <FloppyDisk />
                    Save Settings
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Stage Display</CardTitle>
                  <CardDescription>Projector window controls and shared visibility.</CardDescription>
                  <CardAction>
                    <Badge variant={projectorStatus.active ? "default" : "secondary"}>
                      {projectorStatus.active ? "Online" : "Offline"}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <Field label="Display">
                    <Select
                      value={String(selectedProjectorDisplayId ?? 0)}
                      onValueChange={(value) => api?.controlProjector?.("setDisplay", { displayId: Number(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {projectorDisplays.map((display, index) => (
                          <SelectItem key={display.id} value={String(display.id)}>
                            {displayOptionLabel(display, index, projectorStatus.displayId)}
                          </SelectItem>
                        ))}
                        {projectorDisplays.length === 0 && <SelectItem value="0">Default display</SelectItem>}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() =>
                        projectorStatus.active
                          ? api?.controlProjector?.("close")
                          : api?.controlProjector?.("open", { displayId: selectedProjectorDisplayId })
                      }
                    >
                      <Power />
                      {projectorStatus.active ? "Close" : "Open"}
                    </Button>
                    <Button variant="outline" disabled={!projectorStatus.active} onClick={() => api?.controlProjector?.("fullscreen")}>
                      Fullscreen
                    </Button>
                    <Button variant="outline" disabled={!projectorStatus.active} onClick={() => api?.controlProjector?.("reload")}>
                      Reload
                    </Button>
                    <Button variant="outline" disabled={!projectorStatus.active} onClick={() => api?.controlProjector?.("focus")}>
                      Focus
                    </Button>
                  </div>
                  <Separator />
                  <div className="grid gap-2">
                    <VisibilityRow
                      label="Timer"
                      icon={visibility.showTimer ? <Eye className="size-4" /> : <EyeSlash className="size-4" />}
                      checked={visibility.showTimer}
                      onCheckedChange={(checked) => saveVisibility({ ...visibility, showTimer: checked })}
                    />
                    <VisibilityRow
                      label="Clock"
                      icon={<Clock className="size-4" />}
                      checked={visibility.showClock}
                      onCheckedChange={(checked) => saveVisibility({ ...visibility, showClock: checked })}
                    />
                    <VisibilityRow
                      label="Title"
                      icon={<Timer className="size-4" />}
                      checked={visibility.showTitle}
                      onCheckedChange={(checked) => saveVisibility({ ...visibility, showTitle: checked })}
                    />
                    <VisibilityRow
                      label="Notes"
                      icon={<BellRinging className="size-4" />}
                      checked={visibility.showNotes}
                      onCheckedChange={(checked) => saveVisibility({ ...visibility, showNotes: checked })}
                    />
                    <VisibilityRow
                      label="Progress bar"
                      icon={<SlidersHorizontal className="size-4" />}
                      checked={visibility.showBar}
                      onCheckedChange={(checked) => saveVisibility({ ...visibility, showBar: checked })}
                    />
                  </div>
                  <Separator />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Yellow warning seconds">
                      <Input
                        inputMode="numeric"
                        value={Math.floor((config.settings.wrapUp.yellowMs || 60000) / 1000)}
                        onChange={(event) =>
                          updateSettings({
                            wrapUp: { ...config.settings.wrapUp, yellowMs: Math.max(0, parseNumber(event.target.value)) * 1000 },
                          })
                        }
                      />
                    </Field>
                    <Field label="Red warning seconds">
                      <Input
                        inputMode="numeric"
                        value={Math.floor((config.settings.wrapUp.redMs || 30000) / 1000)}
                        onChange={(event) =>
                          updateSettings({
                            wrapUp: { ...config.settings.wrapUp, redMs: Math.max(0, parseNumber(event.target.value)) * 1000 },
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className="grid gap-2">
                    <VisibilityRow
                      label="Flash on red"
                      icon={<Lightning className="size-4" />}
                      checked={config.settings.wrapUp.flashOnRed}
                      onCheckedChange={(checked) => updateSettings({ wrapUp: { ...config.settings.wrapUp, flashOnRed: checked } })}
                    />
                    <VisibilityRow
                      label="Flash in overtime"
                      icon={<Lightning className="size-4" />}
                      checked={config.settings.wrapUp.flashOnOvertime}
                      onCheckedChange={(checked) => updateSettings({ wrapUp: { ...config.settings.wrapUp, flashOnOvertime: checked } })}
                    />
                    <VisibilityRow
                      label="Sound warnings"
                      icon={<BellRinging className="size-4" />}
                      checked={config.settings.wrapUp.soundOnYellow || config.settings.wrapUp.soundOnRed}
                      onCheckedChange={(checked) =>
                        updateSettings({
                          wrapUp: { ...config.settings.wrapUp, soundOnYellow: checked, soundOnRed: checked },
                        })
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
        <Dialog open={playlistDialogOpen} onOpenChange={setPlaylistDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Playlist Timer</DialogTitle>
              <DialogDescription>Create a runnable show segment with optional production notes.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <Field label="Title">
                <Input
                  value={playlistDraft.title}
                  onChange={(event) => setPlaylistDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Keynote presentation"
                />
              </Field>
              <Field label="Notes">
                <Textarea
                  className="min-h-24 resize-none"
                  value={playlistDraft.notes || ""}
                  onChange={(event) => setPlaylistDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Production cues for this segment..."
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Minutes">
                  <Input
                    inputMode="numeric"
                    value={playlistDraft.minutes}
                    onChange={(event) => setPlaylistDraft((current) => ({ ...current, minutes: parseNumber(event.target.value) }))}
                  />
                </Field>
                <Field label="Seconds">
                  <Input
                    inputMode="numeric"
                    value={playlistDraft.seconds}
                    onChange={(event) => setPlaylistDraft((current) => ({ ...current, seconds: parseNumber(event.target.value) }))}
                  />
                </Field>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPlaylistDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={addPlaylistItem}>
                <FloppyDisk />
                Save to Playlist
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={authRequired} onOpenChange={(open) => setAuthRequired(open)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Unlock Remote Control</DialogTitle>
              <DialogDescription>Enter the production PIN shown on the host controller.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <Input
                value={pinDraft}
                inputMode="numeric"
                maxLength={4}
                className="h-16 text-center font-mono text-3xl tracking-[0.4em]"
                placeholder="0000"
                onChange={(event) => setPinDraft(event.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && pinDraft.length === 4) api?.register?.(pinDraft)
                }}
              />
              {authError && <div className="text-sm text-destructive">{authError}</div>}
            </div>
            <DialogFooter>
              <Button disabled={pinDraft.length !== 4} onClick={() => api?.register?.(pinDraft)}>
                Unlock
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}
