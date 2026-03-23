#!/bin/bash
# Spawn virtual Art-Net consoles and nodes for LumenFlow testing.
#
# Usage:
#   ./scripts/spawn-virtual-network.sh [config.yaml]
#   ./scripts/spawn-virtual-network.sh --docker
#
# If config.yaml is omitted, uses scripts/virtual-network.yaml.
# Press Enter to stop all spawned processes (or Ctrl+C).
#
# --docker: Use Docker instead of local processes. Runs docker compose.
#
# Docker options (after --docker):
#   --detach, -d     Run containers in background
#   --project, -p N  Set compose project name (default: lumenflow-vn or $COMPOSE_PROJECT_NAME)
#   --               Pass remaining args to docker compose (e.g. -- --build)
#
# Linux: ensure host.docker.internal resolves (Docker 20.10+); else add to /etc/hosts or use gateway IP.
#
# Examples:
#   ./scripts/spawn-virtual-network.sh
#   ./scripts/spawn-virtual-network.sh my-custom-config.yaml
#   ./scripts/spawn-virtual-network.sh --docker
#   ./scripts/spawn-virtual-network.sh --docker --detach
#   ./scripts/spawn-virtual-network.sh --docker -- --build
#
# For merge testing: Start 2+ consoles with same universes, different IPs.
# LumenFlow's Routing Matrix will show "2 SRC" when both send to same universe.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Handle --docker flag
if [[ "${1:-}" == "--docker" ]]; then
    shift
    DETACH=""
    if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
        export COMPOSE_PROJECT_NAME
    else
        export COMPOSE_PROJECT_NAME="lumenflow-vn"
    fi
    COMPOSE_ARGS=()
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --detach|-d)
                DETACH=1
                shift
                ;;
            --project|-p)
                if [[ -z "${2:-}" ]]; then
                    echo "Error: $1 requires a value"
                    exit 1
                fi
                export COMPOSE_PROJECT_NAME="$2"
                shift 2
                ;;
            --)
                shift
                COMPOSE_ARGS+=("$@")
                break
                ;;
            *)
                COMPOSE_ARGS+=("$1")
                shift
                ;;
        esac
    done
    echo "Starting virtual network via Docker (project: $COMPOSE_PROJECT_NAME)..."
    echo ""
    echo "Run LumenFlow with: pnpm run dev:docker"
    echo "Stop with: docker compose -f docker-compose.virtual-network.yml down"
    echo ""
    UP=(up)
    if [[ -n "$DETACH" ]]; then
        UP+=(--detach)
    fi
    docker compose -f docker-compose.virtual-network.yml "${UP[@]}" "${COMPOSE_ARGS[@]}"
    exit 0
fi

CONFIG="${1:-$SCRIPT_DIR/virtual-network.yaml}"

if [[ ! -f "$CONFIG" ]]; then
    echo "Config not found: $CONFIG"
    exit 1
fi

# Check for yq (optional - for YAML parsing)
if command -v yq &>/dev/null; then
    USE_YQ=1
else
    USE_YQ=0
    echo "Note: yq not found. Using default config (2 consoles, 1 node)."
    echo "Install yq for custom config: https://github.com/mikefarah/yq"
fi

PIDS=()

cleanup() {
    for pid in "${PIDS[@]}"; do
        # Kill children first (e.g. if cargo spawns a child)
        pkill -P "$pid" 2>/dev/null || true
        kill "$pid" 2>/dev/null || true
    done
    echo "Stopped."
}
trap cleanup EXIT INT TERM

spawn_consoles() {
    if [[ $USE_YQ -eq 1 ]]; then
        local count
        count=$(yq '.consoles | length' "$CONFIG" 2>/dev/null || echo "0")
        local target rate
        target=$(yq -r '.target // "127.0.0.1"' "$CONFIG" 2>/dev/null)
        rate=$(yq -r '.rate // 44' "$CONFIG" 2>/dev/null)
        for ((i = 0; i < count; i++)); do
            local name ip universes pattern physical bind_opt
            name=$(yq -r ".consoles[$i].name // \"Desk $((i + 1))\"" "$CONFIG" 2>/dev/null)
            ip=$(yq -r ".consoles[$i].ip // \"127.0.0.$((i + 2))\"" "$CONFIG" 2>/dev/null)
            universes=$(yq -r ".consoles[$i].universes // 8" "$CONFIG" 2>/dev/null)
            pattern=$(yq -r ".consoles[$i].pattern // \"sine\"" "$CONFIG" 2>/dev/null)
            physical=$(yq -r ".consoles[$i].physical // 0" "$CONFIG" 2>/dev/null)
            bind_opt=""
            if [[ "$ip" != "0.0.0.0" && "$ip" != "127.0.0.1" ]]; then
                bind_opt="--bind ${ip}:0"
            fi
            echo "Starting virtual console: $name @ $ip"
            cargo run -p lumenflow_cli -- virtual-console \
                --name "$name" --ip "$ip" --universes "$universes" \
                --rate "$rate" --pattern "$pattern" --target "$target" \
                --physical "$physical" $bind_opt &
            PIDS+=($!)
        done
    else
        # No --bind: 127.0.0.2/3 need "sudo ifconfig lo0 alias 127.0.0.2" etc.
        # Use different --physical for merge test (same IP + different physical = 2 SRC)
        echo "Starting virtual console: Desk A @ 192.168.1.10"
        cargo run -p lumenflow_cli -- virtual-console \
            --name "Desk A" --ip "192.168.1.10" --universes 8 \
            --rate 44 --pattern sine --target 127.0.0.1 --physical 0 &
        PIDS+=($!)
        echo "Starting virtual console: Desk B @ 192.168.1.11 (merge test: physical 1)"
        cargo run -p lumenflow_cli -- virtual-console \
            --name "Desk B" --ip "192.168.1.11" --universes 8 \
            --rate 44 --pattern chase --target 127.0.0.1 --physical 1 &
        PIDS+=($!)
    fi
}

spawn_nodes() {
    if [[ $USE_YQ -eq 1 ]]; then
        local count target
        count=$(yq '.nodes | length' "$CONFIG" 2>/dev/null || echo "0")
        target=$(yq -r '.target // "127.0.0.1"' "$CONFIG" 2>/dev/null)
        for ((i = 0; i < count; i++)); do
            local name ip port
            name=$(yq -r ".nodes[$i].name // \"Node $((i + 1))\"" "$CONFIG" 2>/dev/null)
            ip=$(yq -r ".nodes[$i].ip // \"127.0.0.$((i + 4))\"" "$CONFIG" 2>/dev/null)
            port=$(yq -r ".nodes[$i].port // 6455" "$CONFIG" 2>/dev/null)
            echo "Starting virtual node: $name @ $ip port $port"
            cargo run -p lumenflow_cli -- virtual-node \
                --name "$name" --ip "$ip" --port "$port" --target "$target" &
            PIDS+=($!)
        done
    else
        echo "Starting virtual node: Virtual Node 1 @ 127.0.0.4 port 6455"
        cargo run -p lumenflow_cli -- virtual-node \
            --name "Virtual Node 1" --ip "127.0.0.4" --port 6455 --target 127.0.0.1 &
        PIDS+=($!)
    fi
}

echo "Config: $CONFIG"
echo ""
spawn_consoles
spawn_nodes

sleep 2
echo ""
echo "Spawned ${#PIDS[@]} process(es). PIDs: ${PIDS[*]}"
echo "Start LumenFlow, switch to real mode in Settings."
echo "  - Merge test: 2 consoles → Routing Matrix shows '2 SRC'"
echo "  - Device discovery: Nodes appear in Devices view"
echo ""
read -p "Press Enter to stop all..."
