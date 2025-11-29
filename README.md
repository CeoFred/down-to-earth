
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

