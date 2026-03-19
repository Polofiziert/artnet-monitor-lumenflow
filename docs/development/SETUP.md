# Setup Guide

## System Requirements

### macOS

- **OS:** macOS 10.13 Mojave or later
- **CPU:** Intel or Apple Silicon (M1+)
- **Memory:** 8GB RAM (minimum 4GB)
- **Disk:** 5GB free space
- **Network:** Gigabit Ethernet (1000Base-T) or WiFi 5+ (for Art-Net reception)

### Windows

- **OS:** Windows 10 (21H2) or Windows 11
- **CPU:** Intel i5 or AMD Ryzen 5 equivalent
- **Memory:** 8GB RAM
- **Disk:** 5GB free space (.NET dependency ~1GB)
- **Network:** Gigabit Ethernet recommended

### Linux

- **Distribution:** Ubuntu 22.04 LTS, Debian 12, Fedora 38+
- **Desktop:** X11 or Wayland
- **Memory:** 4GB RAM
- **Disk:** 5GB free space
- **Network:** Gigabit Ethernet

## Installation

### macOS (DMG)

1. Download: `LumenFlow_x.x.x_x64.dmg` from [Releases](https://github.com/lumenflow/lumenflow/releases)
2. Open DMG file (auto-mounted)
3. Drag `LumenFlow` icon to `/Applications`
4. Launch from Applications folder or Spotlight

**First Launch:**

- May take 15-30 seconds (Tauri runtime initializes)
- System may ask for network permission (allow UDP port 6454)

**macOS Application Firewall (incoming Art-Net):**

LumenFlow receives Art-Net on UDP port 6454. If the firewall is on and LumenFlow does **not** appear in the firewall list (or discovery from other controllers fails), add it manually:

1. **System Settings** → **Network** → **Firewall** → **Options…**
2. Click the **+** button under the list of apps.
3. Navigate to the app or binary:
   - **Installed app:** `/Applications/LumenFlow.app` (or wherever you installed it).
   - **Development:** add the **binary** that actually runs and binds to 6454 when you run `pnpm dev` / `tauri dev`. From your repo root that is:
     - **Binary:** `<REPO>/target/debug/lumenflow_ui`  
       Example (this machine): `/Users/polo/Documents/code/artnet_Control/target/debug/lumenflow_ui`
     - The binary must exist first: run `pnpm dev` once (or `cargo build -p lumenflow_ui`) so the file is created, then add it in Firewall.
   - **Development (.app bundle):** if you built a dev bundle, `<REPO>/target/debug/bundle/macos/LumenFlow.app` (same path with your repo root).
4. Add it and set **Allow incoming connections** for LumenFlow.
5. Restart LumenFlow so it binds to port 6454 again; other controllers (e.g. Protokoll) should now be able to reach it and discovery should work.

### Windows (MSI)

1. Download: `LumenFlow_x.x.x_x64_en-US.msi`
2. Run installer (Administrator access required)
3. Accept license agreement
4. Choose installation directory (default: `C:\Program Files\LumenFlow`)
5. Select desktop shortcut option
6. Complete installation

**Firewall Setup:**

- Windows Defender may block UDP 6454
- Click "Allow access" when prompted, or manually configure:
  - Windows Defender opened → Advanced settings
  - Inbound Rules → New Rule → Port UDP 6454

### Linux (AppImage)

1. Download: `lumenflow_x.x.x_amd64.AppImage`
2. Make executable: `chmod +x lumenflow_x.x.x_amd64.AppImage`
3. Run: `./lumenflow_x.x.x_amd64.AppImage`

**Native Installation (Ubuntu/Debian):**

```bash
# Download .deb
wget https://github.com/lumenflow/lumenflow/releases/download/vx.x.x/lumenflow_x.x.x_amd64.deb

# Install
sudo dpkg -i lumenflow_x.x.x_amd64.deb

# Or via apt
sudo apt install ./lumenflow_x.x.x_amd64.deb

# Launch
lumenflow
```

## Initial Configuration

### 1. Network Setup

After first launch, LumenFlow will:

- Bind to `0.0.0.0:6454` (receive all Art-Net traffic)
- Scan for Art-Net devices (via ArtPoll)
- Display device list (may take 10-15 seconds)

**Manual Device Discovery:**

- Settings → Network → Force ArtPoll Scan
- Wait 5-10 seconds for device responses

### 2. User Interface Tour

| Section                           | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| **Universe Map** (left)           | Overview of all 32,768 universes (heatmap) |
| **Routing Matrix** (center)       | Node-to-universe connections (drag-drop)   |
| **Channel Inspector** (right)     | Detailed view of selected universe         |
| **Device Registry** (bottom-left) | List of discovered devices                 |

### 3. Saving Workspace Layout

```
File → Save Layout As...
```

Layouts stored in: `~/.lumenflow/layouts/`

## Troubleshooting

### Application Won't Start

**macOS:**

```bash
# Check permissions
xattr -d com.apple.quarantine /Applications/LumenFlow.app

# Run from terminal for debug output
/Applications/LumenFlow.app/Contents/MacOS/LumenFlow
```

**Windows:**

```powershell
# Check VC++ runtime installed
choco install vcredist2019

# Reinstall if corrupted
wmic product where name="LumenFlow" call uninstall /nointeractive
# Re-run installer
```

**Linux:**

```bash
# Check dependencies
ldd ./lumenflow_x.x.x_amd64.AppImage

# Missing libraries? Install:
sudo apt install libssl3 libfuse2
```

### UDP Port 6454 Already in Use

```bash
# Find what's using the port
# macOS/Linux:
lsof -i :6454

# Windows:
netstat -ano | findstr :6454
```

**Solution:** Either:

1. Close the conflicting application
2. Configure LumenFlow on different port: Settings → Network → Port (requires app restart)

### No Art-Net Devices Found

**Diagnostic steps:**

1. Verify devices connected to same network
2. Check devices are powered on
3. In Settings → Network → Verbose Logging, set to DEBUG
4. Restart LumenFlow
5. Check log: `tail -f ~/.lumenflow/logs/app.log`

**Common causes:**

- Different subnets (device on 192.168.1.x, LumenFlow on 192.168.0.x)
- Network firewall blocking UDP 6454
- Devices not supporting Art-Net discovery (older hardware)

### High CPU Usage / Stuttering

**Potential causes & solutions:**

| Symptom       | Solution                                             |
| ------------- | ---------------------------------------------------- |
| CPU >50% idle | Settings → Performance → Reduce refresh rate to 30Hz |
| UI stutters   | Close other applications (memory pressure)           |
| High memory   | Settings → Buffer History → Reduce to 10 frames      |

## Network Configuration

### LAN Setup (Most Common)

```
[Art-Net Device]
    ↓ (Ethernet, Port 6454 UDP)
[Network Switch]
    ↓
[Computer Running LumenFlow]
```

No special configuration needed; LumenFlow listens on UDP 6454.

### Remote Monitoring (Advanced)

To monitor Art-Net from different network (e.g., FOH from backstage monitor):

**Method 1: Network Bridge (Recommended)**

```bash
# Device 1 (FOH workstation with LumenFlow):
# Runs normally, listens on 0.0.0.0:6454

# Device 2 (Remote monitoring):
# SSH tunnel to FOH workstation
ssh -L 6454:127.0.0.1:6454 user@foh-workstation

# Then run LumenFlow on remote, it will connect via tunnel
```

**Method 2: Multicast Relay**

```bash
# On router/gateway, enable UDP forwarding
# Route 239.69.46.10:6454 → all networks
# (Requires router support)
```

## Performance Optimization

### Recommended Settings for Different Scenarios

**Small Theater (< 50 universes):**

- Refresh Rate: 44 Hz (default)
- Buffer History: 50 frames
- Logging Level: Info

**Large Festival (> 200 universes):**

- Refresh Rate: 22 Hz (save CPU)
- Buffer History: 10 frames
- Logging Level: Warn
- Disable Channel Inspector sparklines

**Diagnostics/Troubleshooting:**

- Refresh Rate: 44 Hz
- Buffer History: 100 frames
- Logging Level: Debug
- Enable PCAP recording (to disk)

### Display/Monitor Setup

- **Monitor Refresh Rate:** Set to 60 Hz for smoothest visualization
- **Scale:** 100% (UI designed for 1080p, 1440p, 4K)
- **Resolution:** 1600×900 minimum (higher better for Universe Map)

## Data Archival

### Automatic Backup

```
Settings → Data → Auto-backup
- Enabled (default)
- Interval: Daily
- Location: ~/.lumenflow/backups/
```

### Manual Export

```
File → Export Session
```

Exports:

- Device registry
- Workspace layout
- Device configurations (Art-Address mappings)
- Performance metrics (CSV)

## Updating LumenFlow

### Automatic Updates

LumenFlow checks for updates on launch (can be disabled in Settings).

**Manual update:**

```
Help → Check for Updates
```

### Reinstalling from Scratch

If update fails:

1. **Backup** (optional):

   ```bash
   cp -r ~/.lumenflow ~/lumenflow-backup-$(date +%Y%m%d)
   ```

2. **Uninstall** current version
3. **Download** latest from [Releases](https://github.com/lumenflow/lumenflow/releases)

4. **Install** as per Installation section above

## Getting Help

- **Documentation:** [docs.lumenflow.dev](https://docs.lumenflow.dev)
- **GitHub Issues:** [github.com/lumenflow/lumenflow/issues](https://github.com/lumenflow/lumenflow/issues)
- **Community Discord:** [discord.gg/lumenflow](https://discord.gg/lumenflow)
- **Email:** support@lumenflow.dev

### Providing Diagnostic Info

When reporting issues, include:

1. **System info:**

   ```bash
   # macOS
   system_profiler SPSoftwareDataType SPHardwareDataType

   # Windows (PowerShell)
   Get-WmiObject Win32_ComputerSystemProduct | Format-List SMBIOSVersion

   # Linux
   uname -a && cat /etc/os-release
   ```

2. **LumenFlow version:**
   Help → About LumenFlow

3. **Log file:**
   ~/.lumenflow/logs/app.log (last 50 lines)

4. **Reproduction steps:**
   Detailed walkthrough of the issue

---

**Ready to start monitoring Art-Net?** See [GUIDE.md](../development/GUIDE.md) for first-time usage tips.
