#![deny(clippy::unwrap_used)]

mod commands;

use clap::{ArgAction, Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "lumenflow",
    version,
    about = "Art-Net 4 diagnostic CLI for monitoring, discovery, and introspection"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Listen for incoming Art-Net packets on UDP port 6454
    Listen {
        /// Filter by 15-bit universe port-address
        #[arg(short, long)]
        universe: Option<u16>,

        /// Output packets as newline-delimited JSON
        #[arg(long)]
        json: bool,
    },

    /// Send ArtPoll broadcast and discover Art-Net devices
    Poll {
        /// Discovery timeout in seconds
        #[arg(short, long, default_value_t = 3)]
        timeout: u64,

        /// Print per-bind port rows (PollReply PortTypes / Good* / addresses)
        #[arg(long)]
        ports: bool,

        /// Print JSON (device list, or port rows with `--ports`)
        #[arg(long)]
        json: bool,
    },

    /// Print version, build info, and available network interfaces
    Info,

    /// Send ArtPollReply so LumenFlow discovers a mock node (Devices view)
    MockNode {
        /// Target address (127.0.0.1 for loopback)
        #[arg(short, long, default_value = "127.0.0.1")]
        target: String,
    },

    /// Send ArtDmx packets for hardware-free LumenFlow testing
    Send {
        /// Number of universes to send (0..N-1)
        #[arg(long, default_value_t = 1)]
        universes: u16,

        /// Packets per second
        #[arg(short, long, default_value_t = 44)]
        rate: u32,

        /// Target address (127.0.0.1 for loopback, 255.255.255.255 for broadcast)
        #[arg(short, long, default_value = "255.255.255.255")]
        target: String,

        /// DMX pattern: sine, chase, strobe, static, gradient
        #[arg(short, long, default_value = "sine")]
        pattern: String,
    },

    /// Virtual console: sends ArtDmx and responds to ArtPoll (testing without hardware)
    VirtualConsole {
        /// Short name for ArtPollReply (max 18 chars)
        #[arg(long, default_value = "Virtual Console")]
        name: String,

        /// IP address to advertise in ArtPollReply
        #[arg(long, default_value = "192.168.1.10")]
        ip: String,

        /// Number of universes to send (0..N-1)
        #[arg(long, default_value_t = 8)]
        universes: u16,

        /// Packets per second
        #[arg(short, long, default_value_t = 44)]
        rate: u32,

        /// DMX pattern: sine, chase, strobe, static, gradient
        #[arg(short, long, default_value = "sine")]
        pattern: String,

        /// Target address (127.0.0.1 for loopback, 255.255.255.255 for broadcast)
        #[arg(short, long, default_value = "127.0.0.1")]
        target: String,

        /// Physical port (0-3) for merge testing
        #[arg(long, default_value_t = 0)]
        physical: u8,

        /// Bind address (e.g. 127.0.0.2:0 for merge test; source IP = bind IP)
        #[arg(long)]
        bind: Option<String>,

        /// After each DMX batch, send ArtSync to this host:port (e.g. 10.255.255.255:6454)
        #[arg(long)]
        sync_target: Option<String>,

        /// Legacy: send ArtPollReply to `--target` every ~2.5s without ArtPoll (default: off; real nodes only reply to ArtPoll)
        #[arg(long, action = ArgAction::SetTrue)]
        periodic_poll_reply: bool,

        /// Log each packet sent/received
        #[arg(long)]
        verbose: bool,
    },

    /// Send all buildable Art-Net packet types once (for Wireshark compliance validation)
    SendAllPackets {
        /// Target address (127.0.0.1 for loopback capture)
        #[arg(short, long, default_value = "127.0.0.1")]
        target: String,
    },

    /// Virtual node: receives ArtDmx and responds to ArtPoll (testing without hardware)
    VirtualNode {
        /// Simulation profile: `generic` (single PollReply) or `swisson-xnd8` (capture-aligned)
        #[arg(long, default_value = "generic")]
        profile: String,

        /// Short name for ArtPollReply (max 18 chars)
        #[arg(long, default_value = "Virtual Node")]
        name: String,

        /// IP address to advertise in ArtPollReply
        #[arg(long, default_value = "192.168.1.102")]
        ip: String,

        /// Port to bind (6454 = Art-Net default; use 6455 if LumenFlow runs on same machine)
        #[arg(long, default_value_t = 6454)]
        port: u16,

        /// With `--periodic-poll-reply`: destination for unsolicited PollReply (e.g. host.docker.internal)
        #[arg(short, long, default_value = "127.0.0.1")]
        target: String,

        /// Legacy: send ArtPollReply to `--target` every ~2.5s without ArtPoll (default: off; real nodes only reply to ArtPoll)
        #[arg(long, action = ArgAction::SetTrue)]
        periodic_poll_reply: bool,

        /// Log each packet received
        #[arg(long)]
        verbose: bool,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Listen { universe, json } => commands::listen::run(universe, json).await,
        Commands::Poll {
            timeout,
            ports,
            json,
        } => commands::poll::run(timeout, ports, json).await,
        Commands::Info => commands::info::run(),
        Commands::MockNode { target } => commands::mock_node::run(&target).await,
        Commands::Send {
            universes,
            rate,
            target,
            pattern,
        } => commands::send::run(universes, rate, &target, &pattern).await,
        Commands::VirtualConsole {
            name,
            ip,
            universes,
            rate,
            pattern,
            target,
            physical,
            bind,
            sync_target,
            periodic_poll_reply,
            verbose,
        } => {
            commands::virtual_console::run(
                &name,
                &ip,
                bind.as_deref(),
                universes,
                rate,
                &pattern,
                &target,
                physical,
                sync_target.as_deref(),
                periodic_poll_reply,
                verbose,
            )
            .await
        }
        Commands::SendAllPackets { target } => commands::send_all_packets::run(&target).await,
        Commands::VirtualNode {
            profile,
            name,
            ip,
            port,
            target,
            periodic_poll_reply,
            verbose,
        } => {
            let prof = commands::virtual_node::VirtualNodeProfile::parse(&profile)?;
            commands::virtual_node::run(
                prof,
                &name,
                &ip,
                port,
                &target,
                periodic_poll_reply,
                verbose,
            )
            .await
        }
    }
}
