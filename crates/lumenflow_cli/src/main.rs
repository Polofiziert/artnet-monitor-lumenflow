#![deny(clippy::unwrap_used)]

mod commands;

use clap::{Parser, Subcommand};

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
        /// Short name for ArtPollReply (max 18 chars)
        #[arg(long, default_value = "Virtual Node")]
        name: String,

        /// IP address to advertise in ArtPollReply
        #[arg(long, default_value = "192.168.1.102")]
        ip: String,

        /// Port to bind (6454 = Art-Net default; use 6455 if LumenFlow runs on same machine)
        #[arg(long, default_value_t = 6454)]
        port: u16,

        /// Target for periodic ArtPollReply (LumenFlow address for discovery)
        #[arg(short, long, default_value = "127.0.0.1")]
        target: String,

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
        Commands::Poll { timeout } => commands::poll::run(timeout).await,
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
            verbose,
        } => commands::virtual_console::run(
            &name,
            &ip,
            bind.as_deref(),
            universes,
            rate,
            &pattern,
            &target,
            physical,
            verbose,
        )
        .await,
        Commands::SendAllPackets { target } => {
            commands::send_all_packets::run(&target).await
        }
        Commands::VirtualNode {
            name,
            ip,
            port,
            target,
            verbose,
        } => commands::virtual_node::run(&name, &ip, port, &target, verbose).await,
    }
}
