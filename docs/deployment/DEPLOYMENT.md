# Deployment Guide

## Release Strategy

LumenFlow follows semantic versioning and a 3-tier release process:

- **Pre-release (Alpha/Beta):** Features still in development
- **Stable Release:** Production-ready versions
- **Long-Term Support (LTS):** Maintenance versions for critical patches

## Building for Distribution

### Desktop Application (Tauri)

```bash
# Build release binaries for current platform
pnpm run build

# Output locations:
# macOS: dist/LumenFlow_x.x.x_x64.dmg
# Windows: dist/LumenFlow_x.x.x_x64_en-US.msi
# Linux: dist/lumenflow_x.x.x_amd64.AppImage
```

### Configuration Before Distribution

**1. Update Version Numbers**

```bash
# In package.json
"version": "0.2.0"

# In crates/lumenflow_ui/src-tauri/tauri.conf.json
"package": {
  "version": "0.2.0"
}

# Cargo.toml workspace package
[workspace.package]
version = "0.2.0"
```

**2. Code Signing (macOS)**

```bash
# Export signing certificate
# Xcode → Security → Create certificate

# Configure signing in tauri.conf.json
"bundle": {
  "macOS": {
    "signingIdentity": "Your Team ID",
    "entitlements": "src-tauri/entitlements.plist"
  }
}
```

**3. Windows Code Signing**

```bash
# Obtain EV certificate from DigiCert/GlobalSign

# In tauri.conf.json
"bundle": {
  "windows": {
    "certificateThumbprint": "THUMBPRINT_HERE",
    "timestamp": "http://timestamp.digicert.com"
  }
}
```

## Platform-Specific Considerations

### macOS

**System Requirements:**

- macOS 10.13+ (Intel)
- macOS 11.0+ (Apple Silicon via Rosetta 2)
- 100MB free disk space

**Notarization (Apple Gatekeeper):**

```bash
# Automated via tauri-action in CI/CD
# Requires: APPLE_CERTIFICATE + APPLE_CERTIFICATE_PASSWORD

xcrun altool --notarize-app \
  -f LumenFlow_0.2.0_x64.dmg \
  -p "$APPLE_PASSWORD" \
  -u "$APPLE_ID"
```

### Windows

**System Requirements:**

- Windows 10 21H2+
- Visual C++ Redistributable 2019+
- 150MB free disk space

**Installer Features:**

- Auto-update capability (Tauri native)
- Uninstaller registry entry
- Start menu shortcuts

### Linux

**Distribution Packages:**

```bash
# AppImage (universal, works on most distros)
# Already built in dist/

# Deb package (Debian/Ubuntu)
cargo deb -p lumenflow_ui

# RPM package (RedHat/Fedora)
cargo rpm build -p lumenflow_ui

# Flatpak (sandboxed)
# Requires: flatpak manifest (.yml)
flatpak-builder build-dir com.lumenflow.Lumenflow.yml
flatpak build-export export build-dir
```

## Docker Deployment

### CLI Daemon in Container

```bash
# Build image
docker build -f Dockerfile -t lumenflow:0.2.0 .

# Run daemon
docker run -d \
  --name lumenflow \
  -p 6454:6454/udp \
  -v /var/log/lumenflow:/var/log/lumenflow \
  -e RUST_LOG=info \
  lumenflow:0.2.0
```

### Docker Compose (Development + CLI)

```bash
docker-compose up -d

# View logs
docker-compose logs -f lumenflow-cli

# Stop
docker-compose down
```

## Cloud Deployment (Optional)

### AWS Deployment

**EC2 Instance (for FOH monitoring system):**

```bash
# Launch t3.large instance (2 vCPU, 8GB RAM)
# AMI: Ubuntu 22.04 LTS

# SSH into instance
ssh -i lumenflow.pem ubuntu@instance-ip

# Install runtime
sudo apt-get install libssl3 ca-certificates

# Deploy CLI
wget https://github.com/lumenflow/lumenflow/releases/download/v0.2.0/lumenflow-linux-x64
chmod +x lumenflow-linux-x64
./lumenflow-linux-x64 --listen 0.0.0.0:6454
```

**Security Group (firewall):**

```
UDP 6454: Art-Net (from: your network)
TCP 22: SSH (from: your admin IP only)
```

### Kubernetes Deployment (Future)

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lumenflow-daemon
spec:
  replicas: 1
  selector:
    matchLabels:
      app: lumenflow
  template:
    metadata:
      labels:
        app: lumenflow
    spec:
      containers:
        - name: lumenflow
          image: lumenflow:0.2.0
          ports:
            - name: artnet
              containerPort: 6454
              protocol: UDP
          resources:
            requests:
              memory: "64Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "2000m"
```

## Auto-Update Configuration

### Tauri Updater Setup

**1. Generate Keys**

```bash
cargo tauri signer generate -w ~/.tauri/update
```

**2. Configure in tauri.conf.json**

```json
{
  "tauri": {
    "updater": {
      "active": true,
      "endpoints": ["https://releases.lumenflow.dev/updates.json"],
      "dialog": true,
      "pubkey": "YOUR_PUBLIC_KEY"
    }
  }
}
```

**3. Sign Release**

```bash
cargo tauri signer sign "dist/LumenFlow_0.2.0_x64.dmg"
```

**4. Publish Update Manifest** (updates.json)

```json
{
  "version": "0.2.0",
  "notes": "Bug fixes and performance improvements",
  "pub_date": "2024-03-15T00:00:00Z",
  "platforms": {
    "darwin": {
      "signature": "...",
      "url": "https://releases.lumenflow.dev/LumenFlow_0.2.0_x64.dmg"
    },
    "win32": {
      "signature": "...",
      "url": "https://releases.lumenflow.dev/LumenFlow_0.2.0_x64_en-US.msi"
    },
    "linux": {
      "signature": "...",
      "url": "https://releases.lumenflow.dev/lumenflow_0.2.0_amd64.AppImage"
    }
  }
}
```

## Config File Locations (Tauri app_config_dir)

LumenFlow uses Tauri's platform-specific paths. The app identifier is `dev.lumenflow.app`.

| Platform    | Config directory                                                          | Network config |
| ----------- | ------------------------------------------------------------------------- | -------------- |
| **macOS**   | `~/Library/Application Support/dev.lumenflow.app/`                        | `network.json` |
| **Linux**   | `~/.config/dev.lumenflow.app/` (or `$XDG_CONFIG_HOME/dev.lumenflow.app/`) | `network.json` |
| **Windows** | `%APPDATA%\dev.lumenflow.app\`                                            | `network.json` |

## Backup Strategy

```bash
# Backup network config (platform-specific paths)
# macOS:
rsync -av ~/Library/Application\ Support/dev.lumenflow.app/network.json /backup/

# Linux:
rsync -av ~/.config/dev.lumenflow.app/network.json /backup/

# Windows (PowerShell):
Copy-Item "$env:APPDATA\dev.lumenflow.app\network.json" -Destination C:\backup\
```

## Disaster Recovery

### Restore from Backup

```bash
# Restore network config
# macOS:
mkdir -p ~/Library/Application\ Support/dev.lumenflow.app
cp /backup/network.json ~/Library/Application\ Support/dev.lumenflow.app/

# Linux:
mkdir -p ~/.config/dev.lumenflow.app
cp /backup/network.json ~/.config/dev.lumenflow.app/

# Windows (PowerShell):
New-Item -ItemType Directory -Force "$env:APPDATA\dev.lumenflow.app"
Copy-Item C:\backup\network.json -Destination "$env:APPDATA\dev.lumenflow.app\"
```

### Fresh Install Recovery

If local data corrupted:

```bash
# macOS: Remove config directory
rm -rf ~/Library/Application\ Support/dev.lumenflow.app

# Linux:
rm -rf ~/.config/dev.lumenflow.app

# Windows (PowerShell):
Remove-Item -Recurse -Force "$env:APPDATA\dev.lumenflow.app"

# Re-launch LumenFlow — defaults regenerated on startup
```

## Monitoring Production Deployments

### Health Checks

```bash
# Check daemon responsiveness
lumenflow --health

# Expected output:
# {
#   "status": "healthy",
#   "uptime_seconds": 3600,
#   "packets_received": 158400,
#   "active_universes": 8
# }
```

### Log Aggregation

```bash
# View logs
journalctl -u lumenflow -f

# Filter for errors
grep ERROR /var/log/lumenflow/app.log

# Ship to centralized logging
# Configure rsyslog:
```

**rsyslog configuration** (`/etc/rsyslog.d/lumenflow.conf`):

```
:programname, isequal, "lumenflow" @@central-logging.internal:514
```

## Rollback Procedure

### If Deployment Goes Wrong

```bash
# 1. Stop current version
systemctl stop lumenflow

# 2. Revert to previous release
wget https://github.com/lumenflow/lumenflow/releases/download/v0.1.0/lumenflow-linux-x64

# 3. Restart
systemctl start lumenflow

# 4. Verify
lumenflow --health
```

## Release Checklist

Before releasing a new version:

- [ ] All tests pass (`pnpm run test && cargo test`)
- [ ] No security warnings (`cargo audit`)
- [ ] Performance benchmarks stable or improved
- [ ] Documentation updated
- [ ] Version numbers synced (package.json, Cargo.toml, tauri.conf.json)
- [ ] CHANGELOG.md entry written
- [ ] Code signed (macOS + Windows)
- [ ] GitHub release drafted with notes
- [ ] Auto-update manifest generated
- [ ] Announcements posted (GitHub, Discord, etc)

## Support & Maintenance

### Bug Report Triage

Issues labeled `bug`:

1. Severity assessment (critical/high/medium/low)
2. Reproducibility check
3. Assign to maintainer
4. Target release cycle

### Feature Requests

Process:

1. RFC discussion (GitHub Discussions)
2. Design review
3. Implementation planning
4. Backlog prioritization

### LTS Release Cycle

- v1.0 LTS: Security patches for 2 years
- v2.0 LTS: Security patches for 2 years (if v1.0 released)
- Minimum: 12 months support from release

---

**Next Steps:**

- [CHANGELOG.md](../../CHANGELOG.md) - Version history
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Developer onboarding
