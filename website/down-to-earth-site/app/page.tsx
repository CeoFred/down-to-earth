import {
  AppleLogo,
  ArrowRight,
  Broadcast,
  CheckCircle,
  ClockCountdown,
  DownloadSimple,
  Gauge,
  GlobeHemisphereWest,
  LockKey,
  MonitorPlay,
  PlugsConnected,
  ShieldCheck,
  Sparkle,
  WindowsLogo,
} from "@phosphor-icons/react/dist/ssr"
import Image from "next/image"

import { Button } from "@/components/ui/button"

const version = "1.1.0"
const releaseDownloadBase = "https://github.com/CeoFred/down-to-earth/releases/latest/download"

const downloads = {
  macUniversal: {
    label: "Download for macOS",
    detail: "Universal DMG for Apple Silicon and Intel Macs",
    size: "202 MB",
    href: `https://github.com/CeoFred/down-to-earth/releases/download/1.5.0/Down.to.Earth-1.1.0-mac-universal.zip`,
  },
  macArm: {
    label: "Apple Silicon DMG",
    detail: "Smaller build for M-series Macs",
    size: "114 MB",
    href: `https://github.com/CeoFred/down-to-earth/releases/download/1.5.0/Down.to.Earth-1.0.0-arm64-mac.zip`,
  },
  windows: {
    label: "Download for Windows",
    detail: "Windows x64 installer",
    size: "96 MB",
    href: `https://github.com/CeoFred/down-to-earth/releases/download/1.5.0/Down.to.Earth-1.1.0-win-x64.exe`,
  },
}

const screenshots = {
  controller: {
    src: "/product/controller.png",
    width: 3382,
    height: 2084,
  },
  projector: {
    src: "/product/projector.png",
    width: 3452,
    height: 2160,
  },
}

const features = [
  {
    title: "Projector-first timing",
    copy: "Run a clean, high-contrast stage display with countdown, clock, title, notes, and progress bar controls that can be shown independently.",
    icon: MonitorPlay,
  },
  {
    title: "Remote room control",
    copy: "Share a local controller link or public tunnel, protect it with a PIN, and monitor connected phones, tablets, browsers, and projector clients.",
    icon: GlobeHemisphereWest,
  },
  {
    title: "Show-ready rundown",
    copy: "Build playlist items, attach production notes, run next or previous segments, and keep active progress visible while the room keeps moving.",
    icon: Broadcast,
  },
  {
    title: "Precise wrap-up cues",
    copy: "Set yellow and red thresholds, flash behavior, overtime warnings, title reads, TTS reminders, and item-level preset overrides.",
    icon: ClockCountdown,
  },
  {
    title: "Fast operator workflow",
    copy: "Quick presets, custom saved timers, live notes, reusable stage messages, timeline scrubbing, and reset-safe controls keep operation calm.",
    icon: Gauge,
  },
  {
    title: "Local-first by design",
    copy: "The app runs from your machine, serves devices on your network, and keeps the projector usable even when internet access is not part of the plan.",
    icon: ShieldCheck,
  },
]

const workflow = [
  "Open the desktop app on the production computer.",
  "Send the projector window to the room display or external screen.",
  "Share the controller link with trusted operators or keep it on the host machine.",
  "Build a rundown, start a timer, and send title or notes live as the program changes.",
]

const specs = [
  ["Platforms", "macOS universal DMG, macOS Apple Silicon DMG, Windows x64 installer"],
  ["Current version", version],
  ["Display modes", "Countdown, overtime, clock, title, notes, progress bar, focus mode"],
  ["Remote access", "Local network controller, optional tunnel, PIN protection, device blocking"],
  ["Best fit", "Church services, conferences, rehearsals, live rooms, streaming teams, event production"],
]

const faqs = [
  {
    question: "Does the projector need internet?",
    answer:
      "No. Local projector and controller workflows run on the host machine and local network. Internet is only needed for optional public tunnel sharing.",
  },
  {
    question: "Can multiple people control the timer?",
    answer:
      "Yes. Remote controllers can connect from phones, tablets, and browsers. The host can require a PIN and block devices when needed.",
  },
  {
    question: "What should Mac users download?",
    answer:
      "Most Mac users should choose the universal DMG. Apple Silicon users who want the smaller file can use the Apple Silicon DMG.",
  },
  {
    question: "Is this build signed?",
    answer:
      "The current beta artifacts may still show operating-system trust prompts until final code signing and notarization are configured.",
  },
]

function PlatformDownload({
  icon: Icon,
  title,
  detail,
  size,
  href,
  primary,
}: {
  icon: typeof AppleLogo
  title: string
  detail: string
  size: string
  href: string
  primary?: boolean
}) {
  return (
    <div className="flex min-h-56 flex-col justify-between rounded-lg border bg-card p-5 shadow-sm">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex size-11 items-center justify-center rounded-md bg-secondary">
            <Icon className="size-6" weight="duotone" />
          </div>
          <span className="rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground">
            {size}
          </span>
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
        </div>
      </div>
      <Button asChild className="mt-6 h-11 w-full" variant={primary ? "default" : "outline"}>
        <a href={href}>
          <DownloadSimple className="size-4" weight="bold" />
          Download
        </a>
      </Button>
    </div>
  )
}

export default function Page() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 lg:px-6">
          <a href="#top" className="flex min-w-0 items-center gap-3">
            <Image
              src="/brand/down-to-earth-logo.png"
              alt="Down to Earth"
              width={36}
              height={36}
              loading="eager"
              style={{ width: "36px", height: "36px" }}
              className="size-9 rounded-md object-cover"
            />
            <span className="truncate text-sm font-semibold">Down to Earth</span>
          </a>
          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#preview" className="hover:text-foreground">
              Preview
            </a>
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#workflow" className="hover:text-foreground">
              Workflow
            </a>
            <a href="#downloads" className="hover:text-foreground">
              Downloads
            </a>
            <a href="#faq" className="hover:text-foreground">
              FAQ
            </a>
          </div>
          <Button asChild size="sm">
            <a href="#downloads">
              <DownloadSimple className="size-4" weight="bold" />
              Download
            </a>
          </Button>
        </nav>
      </header>

      <section
        id="top"
        className="relative isolate overflow-hidden border-b bg-[#050604] text-white"
      >
        <Image
          src={screenshots.projector.src}
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 z-[-2] object-cover opacity-70"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[-1] bg-[linear-gradient(90deg,rgba(0,0,0,0.94)_0%,rgba(0,0,0,0.82)_42%,rgba(0,0,0,0.48)_76%,rgba(0,0,0,0.28)_100%)]"
        />
        <div className="mx-auto flex min-h-[calc(88svh-4rem)] w-full max-w-7xl items-center px-4 py-16 lg:px-6">
          <div className="max-w-3xl space-y-8">
            <div className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-1 text-sm text-white/75 backdrop-blur">
              <Sparkle className="size-4 text-[#8b6b2f]" weight="fill" />
              Version {version} for production teams
            </div>
            <div className="space-y-5">
              <h1 className="text-5xl font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
                Down to Earth
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-white/72 sm:text-xl">
                A calm, reliable countdown and projector controller for live rooms that need timing,
                titles, notes, reminders, and remote operation without drama.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-12 px-5 text-base">
                <a href={downloads.macUniversal.href}>
                  <AppleLogo className="size-5" weight="fill" />
                  Download macOS
                </a>
              </Button>
              <Button
                asChild
                className="h-12 border-white/25 bg-white/5 px-5 text-base text-white hover:bg-white/10 hover:text-white"
                variant="outline"
              >
                <a href={downloads.windows.href}>
                  <WindowsLogo className="size-5" weight="fill" />
                  Download Windows
                </a>
              </Button>
            </div>
            <div className="grid max-w-2xl gap-3 text-sm text-white/70 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="size-4 text-[#6dbe78]" weight="fill" />
                Local-first
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="size-4 text-[#6dbe78]" weight="fill" />
                Remote PIN control
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="size-4 text-[#6dbe78]" weight="fill" />
                Stage projector ready
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="preview" className="border-b py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div>
              <p className="text-sm font-medium text-[#8b6b2f]">Real app preview</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                A focused controller for operators, a bold display for the room.
              </h2>
            </div>
            <p className="text-sm leading-7 text-muted-foreground">
              The controller keeps timing, rundown, messages, appearance, output, and settings close
              at hand. The projector strips everything back to what the room needs to see: title,
              timer, clock, and progress.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
            <figure className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3 px-2 pb-3 pt-1">
                <figcaption>
                  <h3 className="font-semibold">Controller</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The main production surface for timer, playlist, messages, appearance, and output.
                  </p>
                </figcaption>
                <span className="hidden rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
                  Operator view
                </span>
              </div>
              <Image
                src={screenshots.controller.src}
                alt="Down to Earth controller showing timer controls, rundown, quick presets, and live status."
                width={screenshots.controller.width}
                height={screenshots.controller.height}
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="aspect-[3382/2084] w-full rounded-md object-cover"
              />
            </figure>

            <figure className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3 px-2 pb-3 pt-1">
                <figcaption>
                  <h3 className="font-semibold">Projector</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    High-contrast stage output with timer, current title, clock, and progress bar.
                  </p>
                </figcaption>
                <span className="hidden rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
                  Stage view
                </span>
              </div>
              <Image
                src={screenshots.projector.src}
                alt="Down to Earth projector display showing an introduction title, large countdown timer, current clock, and progress bar."
                width={screenshots.projector.width}
                height={screenshots.projector.height}
                sizes="(min-width: 1024px) 34vw, 100vw"
                className="aspect-[3452/2160] w-full rounded-md object-cover"
              />
            </figure>
          </div>
        </div>
      </section>

      <section id="features" className="border-b py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-[#6f7f4c]">Built for live operation</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything the room needs, visible when it matters.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-lg border bg-card p-5 shadow-sm">
                <feature.icon className="size-7 text-[#50633d]" weight="duotone" />
                <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-b py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[0.8fr_1.2fr] lg:px-6">
          <div>
            <p className="text-sm font-medium text-[#8b6b2f]">Simple setup</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              From closed laptop to live projector in minutes.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              Down to Earth keeps the control surface organized for repeated use: start the desktop app,
              open the stage display, share control only when needed, and operate the rundown from one place.
            </p>
          </div>
          <div className="grid gap-3">
            {workflow.map((step, index) => (
              <div key={step} className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-[48px_1fr]">
                <div className="flex size-12 items-center justify-center rounded-md bg-secondary font-semibold">
                  {index + 1}
                </div>
                <div>
                  <h3 className="font-medium">{step}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {index === 0 &&
                      "The host app serves the controller, projector, socket updates, and saved production settings."}
                    {index === 1 &&
                      "The projector window can be opened, focused, reloaded, and controlled from the settings surface."}
                    {index === 2 &&
                      "Remote clients can require a PIN, and connected devices can be monitored or blocked."}
                    {index === 3 &&
                      "Titles, notes, warning colors, messages, and wrap-up behavior stay synchronized across displays."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="downloads" className="border-b bg-secondary/40 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
            <div>
              <p className="text-sm font-medium text-[#50633d]">GitHub release downloads</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Choose your platform and install.
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                These buttons redirect to the matching GitHub Release asset instead of storing large
                installers inside this repository. For macOS, the universal build is the safest default;
                the Apple Silicon build is smaller for M-series Macs.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <PlatformDownload
                icon={AppleLogo}
                title={downloads.macUniversal.label}
                detail={downloads.macUniversal.detail}
                size={downloads.macUniversal.size}
                href={downloads.macUniversal.href}
                primary
              />
              <PlatformDownload
                icon={WindowsLogo}
                title={downloads.windows.label}
                detail={downloads.windows.detail}
                size={downloads.windows.size}
                href={downloads.windows.href}
                primary
              />
            </div>
          </div>
          <div className="mt-4 max-w-md">
            <PlatformDownload
              icon={AppleLogo}
              title={downloads.macArm.label}
              detail={downloads.macArm.detail}
              size={downloads.macArm.size}
              href={downloads.macArm.href}
            />
          </div>
        </div>
      </section>

      <section className="border-b py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[1fr_1fr] lg:px-6">
          <div>
            <p className="text-sm font-medium text-[#8b6b2f]">Release details</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">What is included.</h2>
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            {specs.map(([label, value]) => (
              <div key={label} className="grid gap-2 border-b p-4 last:border-b-0 sm:grid-cols-[180px_1fr]">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-sm leading-6 text-muted-foreground">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 md:grid-cols-3 lg:px-6">
          <div className="rounded-lg border bg-card p-5">
            <LockKey className="size-7 text-[#50633d]" weight="duotone" />
            <h3 className="mt-4 text-lg font-semibold">PIN-protected remotes</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Keep casual network visitors out while allowing trusted operators to join from their own device.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-5">
            <PlugsConnected className="size-7 text-[#50633d]" weight="duotone" />
            <h3 className="mt-4 text-lg font-semibold">Network-aware control</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Local URLs, projector URLs, QR codes, and optional public tunnel controls stay in one output tab.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-5">
            <ArrowRight className="size-7 text-[#50633d]" weight="duotone" />
            <h3 className="mt-4 text-lg font-semibold">Operator-safe actions</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Reset, pause, next item, visibility, notes, and projector controls are separated clearly for show conditions.
            </p>
          </div>
        </div>
      </section>

      <section id="faq" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-[#50633d]">Questions</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Before you install.</h2>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {faqs.map((item) => (
              <article key={item.question} className="rounded-lg border bg-card p-5">
                <h3 className="font-semibold">{item.question}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/down-to-earth-logo.png"
              alt=""
              width={32}
              height={32}
              loading="eager"
              style={{ width: "32px", height: "32px" }}
              className="size-8 rounded-md object-cover"
            />
            <span>Down to Earth {version}</span>
          </div>
          <div className="flex gap-4">
            <a href="#downloads" className="hover:text-foreground">
              Downloads
            </a>
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#top" className="hover:text-foreground">
              Back to top
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}
