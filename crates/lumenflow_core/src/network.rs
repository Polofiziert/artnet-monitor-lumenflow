use std::net::SocketAddr;

use socket2::{Domain, Protocol, Socket, Type};
use tokio::net::UdpSocket;

use crate::artnet::ART_NET_PORT;

pub mod interfaces;
pub use interfaces::{
    default_spec_broadcast_targets, derive_cidr_24_from_ip, get_network_interfaces,
    resolve_interface_for_cidr, InterfacesError, NetworkInterface,
};

const DEFAULT_RECV_BUF_SIZE: usize = 8 * 1024 * 1024; // 8 MB

#[derive(Debug, thiserror::Error)]
pub enum NetworkError {
    #[error("failed to create socket: {0}")]
    SocketCreate(std::io::Error),

    #[error("failed to set SO_REUSEADDR: {0}")]
    SetReuseAddr(std::io::Error),

    #[error("failed to set SO_RCVBUF to {size} bytes: {source}")]
    SetRecvBuf { size: usize, source: std::io::Error },

    #[error("failed to bind to {addr}: {source}")]
    Bind { addr: SocketAddr, source: std::io::Error },

    #[error("failed to convert to async socket: {0}")]
    AsyncConvert(std::io::Error),

    #[error("recv error: {0}")]
    Recv(std::io::Error),

    #[error("failed to set SO_BROADCAST: {0}")]
    SetBroadcast(std::io::Error),

    #[error("send error: {0}")]
    Send(std::io::Error),
}

/// A configured Art-Net UDP socket with enlarged OS buffers and SO_REUSEADDR.
///
/// Uses `socket2` for low-level configuration, then converts to a
/// `tokio::net::UdpSocket` for async I/O.
pub struct ArtNetSocket {
    socket: UdpSocket,
    recv_buf: Vec<u8>,
}

impl ArtNetSocket {
    /// Creates and binds an Art-Net UDP socket on the given address.
    ///
    /// Configures `SO_REUSEADDR` and sets `SO_RCVBUF` to 8 MB to prevent
    /// kernel-level packet drops during traffic spikes.
    ///
    /// # Errors
    /// Returns `NetworkError` if socket creation, configuration, or binding fails.
    pub async fn bind(bind_addr: SocketAddr) -> Result<Self, NetworkError> {
        let raw = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))
            .map_err(NetworkError::SocketCreate)?;

        raw.set_reuse_address(true)
            .map_err(NetworkError::SetReuseAddr)?;

        raw.set_broadcast(true)
            .map_err(NetworkError::SetBroadcast)?;

        raw.set_recv_buffer_size(DEFAULT_RECV_BUF_SIZE)
            .map_err(|e| NetworkError::SetRecvBuf {
                size: DEFAULT_RECV_BUF_SIZE,
                source: e,
            })?;

        raw.set_nonblocking(true)
            .map_err(NetworkError::SocketCreate)?;

        raw.bind(&bind_addr.into())
            .map_err(|e| NetworkError::Bind {
                addr: bind_addr,
                source: e,
            })?;

        let std_socket: std::net::UdpSocket = raw.into();
        let socket =
            UdpSocket::from_std(std_socket).map_err(NetworkError::AsyncConvert)?;

        tracing::info!(
            addr = %bind_addr,
            recv_buf_bytes = DEFAULT_RECV_BUF_SIZE,
            "Art-Net socket bound"
        );

        Ok(Self {
            socket,
            recv_buf: vec![0u8; 2048],
        })
    }

    /// Binds to the default Art-Net address `0.0.0.0:6454`.
    ///
    /// # Errors
    /// See [`Self::bind`].
    pub async fn bind_default() -> Result<Self, NetworkError> {
        let addr = SocketAddr::from(([0, 0, 0, 0], ART_NET_PORT));
        Self::bind(addr).await
    }

    /// Receives a single UDP datagram, returning the payload slice and sender address.
    ///
    /// The returned slice borrows from an internal buffer and is valid until the
    /// next call to `recv`.
    ///
    /// # Errors
    /// Returns `NetworkError::Recv` on I/O failure.
    pub async fn recv(&mut self) -> Result<(&[u8], SocketAddr), NetworkError> {
        let (len, addr) = self
            .socket
            .recv_from(&mut self.recv_buf)
            .await
            .map_err(NetworkError::Recv)?;
        Ok((&self.recv_buf[..len], addr))
    }

    /// Sends a UDP datagram to the specified address.
    ///
    /// # Errors
    /// Returns `NetworkError::Send` on I/O failure.
    pub async fn send_to(&self, data: &[u8], addr: SocketAddr) -> Result<(), NetworkError> {
        self.socket
            .send_to(data, addr)
            .await
            .map_err(NetworkError::Send)?;
        Ok(())
    }

    /// Sends a UDP datagram to Art-Net directed broadcast addresses.
    ///
    /// Per Art-Net 4 spec, controllers poll both the primary (`2.255.255.255:6454`)
    /// and secondary (`10.255.255.255:6454`) subnets. Additionally sends to loopback
    /// broadcast (`127.255.255.255:6454`) for local testing on loopback-only setups.
    ///
    /// # Errors
    /// Returns `NetworkError::Send` only if sending to all three addresses fails.
    /// On loopback-only systems, 2.x and 10.x may fail; loopback succeeds.
    pub async fn send_directed_broadcast(&self, data: &[u8]) -> Result<(), NetworkError> {
        let targets = interfaces::default_spec_broadcast_targets(ART_NET_PORT);
        self.send_to_targets(data, &targets).await
    }

    /// Sends a UDP datagram to each of the given broadcast/unicast targets.
    ///
    /// Used for configurable discovery: spec targets, subnet-derived, and custom.
    /// Returns `Ok` if at least one send succeeds; returns `Err` only if all fail.
    ///
    /// # Errors
    /// Returns `NetworkError::Send` only if sending to every address fails.
    pub async fn send_to_targets(
        &self,
        data: &[u8],
        targets: &[SocketAddr],
    ) -> Result<(), NetworkError> {
        if targets.is_empty() {
            return Err(NetworkError::Send(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "no discovery targets configured",
            )));
        }
        let mut last_err = None;
        let mut any_success = false;
        for addr in targets {
            match self.send_to(data, *addr).await {
                Ok(()) => any_success = true,
                Err(e) => {
                    tracing::debug!(%addr, "Discovery send failed: {e}");
                    last_err = Some(e);
                }
            }
        }
        if any_success {
            Ok(())
        } else {
            Err(last_err.expect("targets non-empty but all sends failed"))
        }
    }

    /// Returns a reference to the underlying tokio `UdpSocket`.
    pub fn inner(&self) -> &UdpSocket {
        &self.socket
    }
}

/// Builds an 18-byte ArtPoll broadcast packet per Art-Net 4 spec.
///
/// The packet solicits `ArtPollReply` responses from all Art-Net nodes
/// on the network. Flags: 0x06 = TalkToMe (0x02) + Send diagnostics (0x04).
/// DiagPriority 0x10 = DpLow (request all diagnostic levels).
///
/// `target_top` and `target_bottom` define a port-address range for
/// targeted polling (Art-Net 4). Set both to `0x0000` for non-targeted
/// mode (all nodes reply), which is backward-compatible with Art-Net 3.
///
/// # Wire Layout
/// | Offset | Size | Field                  | Value         |
/// |--------|------|------------------------|---------------|
/// | 0      | 8    | ID                     | `"Art-Net\0"` |
/// | 8      | 2    | OpCode (LE)            | `0x2000`      |
/// | 10     | 1    | ProtVerHi              | `0x00`        |
/// | 11     | 1    | ProtVerLo              | `0x0e`        |
/// | 12     | 1    | Flags                  | `0x06`        |
/// | 13     | 1    | DiagPriority           | `0x10`        |
/// | 14     | 2    | TargetPortAddressTop   | LE            |
/// | 16     | 2    | TargetPortAddressBottom| LE            |
pub fn build_art_poll() -> [u8; 18] {
    build_art_poll_targeted(0x0000, 0x0000)
}

/// Builds an 18-byte targeted ArtPoll packet per Art-Net 4 spec.
///
/// Only nodes with port-addresses in the range `[target_bottom, target_top]`
/// will reply. Both values are 15-bit port-addresses (Net:SubNet:Universe).
///
/// # Errors
/// This function is infallible; invalid ranges simply get no replies.
pub fn build_art_poll_targeted(target_top: u16, target_bottom: u16) -> [u8; 18] {
    let mut pkt = [0u8; 18];
    pkt[0..8].copy_from_slice(b"Art-Net\0");
    pkt[8..10].copy_from_slice(&0x2000u16.to_le_bytes());
    pkt[10] = 0x00;
    pkt[11] = 0x0e;
    pkt[12] = 0x06; // TalkToMe (0x02) + Send diagnostics (0x04)
    pkt[13] = 0x10; // DpLow - request all diagnostic levels
    pkt[14..16].copy_from_slice(&target_top.to_le_bytes());
    pkt[16..18].copy_from_slice(&target_bottom.to_le_bytes());
    pkt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_socket_bind_on_random_port() {
        let addr = SocketAddr::from(([127, 0, 0, 1], 0));
        let socket = ArtNetSocket::bind(addr).await;
        assert!(socket.is_ok());
    }

    #[tokio::test]
    async fn test_socket_send_recv_loopback() {
        let addr = SocketAddr::from(([127, 0, 0, 1], 0));
        let mut receiver = ArtNetSocket::bind(addr).await.unwrap_or_else(|e| {
            panic!("test setup: bind failed: {e}");
        });
        let local_addr = receiver.inner().local_addr().unwrap_or_else(|e| {
            panic!("test setup: local_addr failed: {e}");
        });

        let sender_addr = SocketAddr::from(([127, 0, 0, 1], 0));
        let sender = ArtNetSocket::bind(sender_addr).await.unwrap_or_else(|e| {
            panic!("test setup: sender bind failed: {e}");
        });

        let test_data = b"Art-Net\0test";
        sender.send_to(test_data, local_addr).await.unwrap_or_else(|e| {
            panic!("test: send failed: {e}");
        });

        let (data, _from) = receiver.recv().await.unwrap_or_else(|e| {
            panic!("test: recv failed: {e}");
        });
        assert_eq!(data, test_data);
    }

    #[test]
    fn test_build_art_poll_format() {
        let pkt = build_art_poll();
        assert_eq!(&pkt[0..8], b"Art-Net\0");
        assert_eq!(u16::from_le_bytes([pkt[8], pkt[9]]), 0x2000);
        assert_eq!(pkt[10], 0x00);
        assert_eq!(pkt[11], 0x0e);
        assert_eq!(pkt[12], 0x06);
        assert_eq!(pkt[13], 0x10); // DpLow - request all diagnostic levels
        assert_eq!(u16::from_le_bytes([pkt[14], pkt[15]]), 0x0000);
        assert_eq!(u16::from_le_bytes([pkt[16], pkt[17]]), 0x0000);
        assert_eq!(pkt.len(), 18);
    }

    #[test]
    fn test_build_art_poll_has_valid_header() {
        let pkt = build_art_poll();
        assert_eq!(&pkt[0..8], crate::artnet::ART_NET_HEADER.as_slice());
        let opcode = u16::from_le_bytes([pkt[8], pkt[9]]);
        assert!(crate::artnet::OpCode::from_u16(opcode).is_ok());
    }

    #[test]
    fn test_build_art_poll_targeted() {
        let pkt = build_art_poll_targeted(0x7FFF, 0x0100);
        assert_eq!(u16::from_le_bytes([pkt[14], pkt[15]]), 0x7FFF);
        assert_eq!(u16::from_le_bytes([pkt[16], pkt[17]]), 0x0100);
        assert_eq!(pkt.len(), 18);
    }
}
