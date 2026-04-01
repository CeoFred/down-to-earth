
# **Down To Earth — Countdown & Stage Timer**

A modern, dual-screen countdown timer designed for events, churches, studios, moderators, speakers, and stage managers.
Control the timer from your main screen while projecting a clean, fullscreen display to a second monitor.

---

## ✨ **Features**

### 🎛 **Modern Controller Interface**

* Stylish, intuitive UI
* Start, Pause, Reset controls
* Clear running/paused indicators
* Preset buttons (5, 10, 15, 30, 45 min)
* Smooth and responsive design

Given the current base of your **Countdown Projector**, here are some premium features that would take it to the next level, categorized by where they would have the most impact:

### 1. 🎨 Visual & Immersive Effects (Projector Side)
*   **Dynamic Backgrounds**: Instead of a flat black background, add support for subtle video loops (clouds, particles) or smooth animated gradients that shift as the time runs out.
*   **Urgency Visuals**: When the timer hits the last 60 seconds, the display could start a subtle "pulse" animation. Once it hits **Overtime**, you could add a "glitch" or "shake" effect to catch everyone's attention.
*   **Progress Rings**: Add a circular or linear progress bar that slowly depletes. It provides a quick visual cue for those who don't want to read the numbers.

### 2. 🎛️ Control & Workflow (Controller Side)
*   **Sequence/Playlist Mode**: Define a series of timers (e.g., "Intro: 5m", "Sermon: 30m", "Closing: 10m") and have them transition automatically or with a single "Next" click.
*   **Preset Management**: Allow users to save their own custom presets directly from the UI, instead of just the hardcoded ones.
*   **Sound Notifications**: Add a library of high-quality "chimes" or "gongs" that play when the timer hits zero. You could even integrate **Text-to-Speech** to announce "5 minutes remaining."

### 3. 🌐 Advanced Integrations
*   **OBS Overlay Mode**: Provide a "green screen" or transparent background mode for the projector window, making it easy to use as a source in OBS for live streams.
*   **Lower Thirds Integration**: Allow the "Title" to be displayed as a professional broadcast-style lower third that slides in and out.
*   **Dark/Light Mode Sync**: Automatically sync the controller and projector themes to match the lighting of your venue (e.g., "Stage Mode" vs. "Bright Office Mode").

### 📱 Remote Experience
*   **QR Code Discovery**: Display a QR code on the controller window so anyone can just scan it with their phone to join the remote session instantly.
*   **Vibration Alerts**: For mobile remote controllers, vibrate the phone when the timer is almost up to alert the person on stage discreetly.

**Which of these sounds most exciting to you?** I can help you implement any of them—starting with the **QR Code** or **Urgency Visuals** might be a great next step!

### 🖥️ **Full-Screen Projector Display**

* Automatically opens on the second monitor
* Clean and distraction-free
* “TIME UP” alert when countdown hits zero
* Negative time (overtime) tracking in red
* Perfect for speakers, choir directors, stage coordinators, event hosts, etc.

### ⏱️ **Smart Timing Logic**

* Accurate countdown
* Seamless transition into overtime
* Live syncing between controller and projector
* Multi-window IPC communication

### 💻 **Cross-Platform Binaries**

* **macOS:** ZIP containing `.app` bundle
* **Windows:** Portable `.exe` (no installer needed)

---

## 🚀 **Getting Started**

### **Windows**

1. Download the portable `.exe`
2. Double-click to run
3. If SmartScreen warns, click **More info → Run anyway**

### **macOS**

1. Download the `.zip`
2. Unzip it and open the `.app`
3. If macOS blocks it:

   * Go to **System Settings → Privacy & Security → Open Anyway**

---

## 📦 **Project Structure**

```
Down-To-Earth/
│
├── main.js
├── preload.js
├── renderer.html
├── renderer.js
├── projector.html
├── projector.js
├── package.json
└── assets/
```

---

## 🛠️ **Development Setup**

```bash
npm install
npm start
```

### Build binaries

#### macOS:

```bash
npm run dist:mac
```

#### Windows:

```bash
npm run dist:win
```

---

## 🎨 **Branding Assets**

* App icon (`.ico` + `.icns`)
* High-resolution banner (for GitHub Releases)

> Provided in this release as downloadable assets.

---

## 🧭 **Roadmap**

* Audio alerts when time is up
* Editable presets
* Theme customization
* Schedules
* Optional network sync
* Hotkey support
* Screensaver-like “soft dimming” warning near end of countdown

---

## 🤝 **Contributing**

Pull requests and feature suggestions are welcome!

---

## 📄 License

MIT License

---

## 🙌 Acknowledgements

Thanks to everyone using Down To Earth in events, churches, studios, and conferences. Your feedback makes it better.

