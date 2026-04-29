# Release Checklist

## Preflight

- Use Node.js 20.9 or newer. With nvm, run `nvm use` from the project root.
- Run `npm run release:check`.
- Start the app with `npm start`.
- Verify the controller at `http://localhost:8321/`.
- Verify the projector at `http://localhost:8321/projector`.
- Test a remote phone controller on the same network.
- Test PIN unlock, PIN refresh, and blocked device handling.
- Test projector open, fullscreen, reload, and focus controls.
- Quit and relaunch the app to confirm saved settings load correctly.

## Build

- macOS Apple Silicon beta: `npm run release:mac`.
- macOS universal: `npm run release:mac:universal`.
- Windows x64: `npm run release:win`.

## Signing

- macOS distribution should use an Apple Developer ID certificate and notarization.
- Windows distribution should use an Authenticode code signing certificate.
- Unsigned builds are acceptable for private beta, but users will see operating system warnings.

## Release Notes

- Include version, date, supported platforms, known limitations, and install instructions.
- Keep the legacy HTML controller available until the Next controller has completed production soak testing.
