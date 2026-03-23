//! ArtTodRequest (0x8000), ArtTodData (0x8100), ArtTodControl (0x8200) — builders and
//! minimal parsers for virtual device simulation (see Art-Net 4 spec).

use super::{ParseError, ART_NET_HEADER};

/// TodFull command in ArtTodRequest / ArtTodData.
pub const TOD_CMD_FULL: u8 = 0x00;
/// AtcFlush — clear TOD (ArtTodControl).
pub const TOD_CTRL_FLUSH: u8 = 0x01;

/// Parsed ArtTodRequest (fixed 56-byte wire form used on Swisson capture).
#[derive(Debug, Clone)]
pub struct ArtTodRequestInfo {
    pub net: u8,
    pub command: u8,
    pub addresses: Vec<u8>,
}

/// Parses ArtTodRequest UDP payload (56 bytes typical; accepts ≥26 bytes).
///
/// Wire layout after the 12-byte Art-Net header: **Filler** (2), **Spare** (8), **Net**,
/// **Command**, **AdCount**, **Address** × AdCount (Swisson DMXW_03 / Wireshark 4.2).
///
/// # Errors
/// Returns `ParseError` if header or opcode is wrong or buffer too short.
pub fn parse_art_tod_request(payload: &[u8]) -> Result<ArtTodRequestInfo, ParseError> {
    if payload.len() < 26 {
        return Err(ParseError::TooShort {
            expected: 26,
            actual: payload.len(),
        });
    }
    if &payload[0..8] != ART_NET_HEADER.as_slice() {
        return Err(ParseError::InvalidHeader);
    }
    if u16::from_le_bytes([payload[8], payload[9]]) != 0x8000 {
        return Err(ParseError::WrongOpCode {
            expected: 0x8000,
            actual: u16::from_le_bytes([payload[8], payload[9]]),
        });
    }
    let net = payload[21];
    let command = payload[22];
    let ad_count = payload[23] as usize;
    let mut addresses = Vec::new();
    if 24 + ad_count <= payload.len() {
        addresses.extend_from_slice(&payload[24..24 + ad_count]);
    }
    Ok(ArtTodRequestInfo {
        net,
        command,
        addresses,
    })
}

/// Parsed ArtTodControl (24-byte wire form).
#[derive(Debug, Clone, Copy)]
pub struct ArtTodControlInfo {
    pub net: u8,
    pub command: u8,
    pub address: u8,
}

/// Parses ArtTodControl.
///
/// # Errors
/// Returns `ParseError` if buffer is too short or header invalid.
pub fn parse_art_tod_control(payload: &[u8]) -> Result<ArtTodControlInfo, ParseError> {
    if payload.len() < 24 {
        return Err(ParseError::TooShort {
            expected: 24,
            actual: payload.len(),
        });
    }
    if &payload[0..8] != ART_NET_HEADER.as_slice() {
        return Err(ParseError::InvalidHeader);
    }
    if u16::from_le_bytes([payload[8], payload[9]]) != 0x8200 {
        return Err(ParseError::WrongOpCode {
            expected: 0x8200,
            actual: u16::from_le_bytes([payload[8], payload[9]]),
        });
    }
    Ok(ArtTodControlInfo {
        net: payload[21],
        command: payload[22],
        address: payload[23],
    })
}

/// Builds ArtTodData (0x8100) with optional RDM UIDs (6 bytes each). Minimum packet 28 bytes
/// when `uids` is empty (matches Swisson capture shape).
///
/// `bind_index` is 1-based (Art-Net). `universe` is the low byte of the 15-bit port address.
///
/// # Errors
/// Infallible; truncates UID list if it would exceed reasonable wire size.
pub fn build_art_tod_data(
    bind_index: u8,
    net: u8,
    universe: u8,
    command_response: u8,
    uids: &[[u8; 6]],
) -> Vec<u8> {
    let uid_count = uids.len().min(200) as u8;
    let uid_total = uid_count as u16;
    let mut pkt = Vec::with_capacity(28 + uid_count as usize * 6);
    pkt.extend_from_slice(ART_NET_HEADER);
    pkt.extend_from_slice(&0x8100u16.to_le_bytes());
    pkt.push(0x00);
    pkt.push(0x0e);
    pkt.push(0x01);
    pkt.push(0x01);
    pkt.extend_from_slice(&[0u8; 6]);
    pkt.push(bind_index);
    pkt.push(net);
    pkt.push(command_response);
    pkt.push(universe);
    pkt.extend_from_slice(&uid_total.to_be_bytes());
    pkt.push(0);
    pkt.push(uid_count);
    for u in uids.iter().take(uid_count as usize) {
        pkt.extend_from_slice(u);
    }
    pkt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_tod_request_frame_18() {
        let hex = "4172742d4e6574000080000e0000000000000000000000010000000000000000000000000000000000000000000000000000000000000000";
        let p = hex_to_bytes(hex);
        let info = parse_art_tod_request(&p).expect("parse");
        assert_eq!(info.net, 0);
        assert_eq!(info.command, TOD_CMD_FULL);
        assert_eq!(info.addresses, vec![0u8]);
    }

    fn hex_to_bytes(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).expect("hex"))
            .collect()
    }

    #[test]
    fn tod_data_roundtrip_len_empty() {
        let v = build_art_tod_data(3, 0, 2, TOD_CMD_FULL, &[]);
        assert_eq!(v.len(), 28);
        assert_eq!(&v[0..8], ART_NET_HEADER.as_slice());
        assert_eq!(u16::from_le_bytes([v[8], v[9]]), 0x8100);
    }
}
