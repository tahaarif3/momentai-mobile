# Maestro smoke flows

[Maestro](https://maestro.mobile.dev/) fits Capacitor/vanilla better than Detox.

```bash
# Install Maestro CLI, then with a running emulator/simulator + debug build:
maestro test maestro/smoke.yaml
maestro test maestro/auth-screen.yaml
maestro test maestro/capture-flow.yaml
```

Flows are shallow UI smokes. Full physical-device matrix: `docs/qa-matrix.md`.
