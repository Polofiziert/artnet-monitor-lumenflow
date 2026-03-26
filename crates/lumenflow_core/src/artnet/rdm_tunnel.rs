//! Minimal ArtRdm (0x8300) helpers for virtual device simulation: respond to a narrow
//! **GET Supported Parameters** probe with a canned capture-derived payload (Swisson DMXW_03).

/// Canned **ArtRdm** response (91 bytes UDP payload) from
/// `Network_A2R_Swisson_DMXW_03_ConformenceTest.pcapng` frame 640 — **GET_RESPONSE** for
/// **Supported Parameters** (PID 0x0050). Used only when the incoming request matches
/// the same PID/command at fixed offsets (49-byte request shape).
pub const ART_RDM_GET_SUPPORTED_PARAMS_RESPONSE: &[u8] = &[
    0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 0x00, 0x83, 0x00, 0x0e, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x42, 0x53, 0x79, 0x00, 0x00, 0x00, 0x00,
    0x53, 0x47, 0xe4, 0x1b, 0xf3, 0x9f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21, 0x00, 0x50, 0x2a, 0x00,
    0x82, 0x00, 0x81, 0x00, 0xe0, 0x00, 0xe1, 0x02, 0x00, 0x02, 0x01, 0x00, 0x80, 0x04, 0x00, 0x00,
    0x51, 0x05, 0x01, 0x05, 0x00, 0x00, 0x90, 0x10, 0x01, 0x86, 0x26, 0x86, 0x31, 0x01, 0x20, 0x01,
    0x21, 0x01, 0x22, 0x80, 0x60, 0x86, 0x25, 0x86, 0x20, 0x0d, 0xe5,
];

/// Returns a **GET Supported Parameters** **ArtRdm** response if `payload` looks like a matching
/// request (Art-Net header, OpCode 0x8300, RDM **GET** + PID 0x0050 at bytes 43–45).
///
/// This is intentionally narrow: other PIDs are ignored (return `None`).
pub fn try_build_art_rdm_response_get_supported_parameters(payload: &[u8]) -> Option<Vec<u8>> {
    if payload.len() < 46 {
        return None;
    }
    if &payload[0..8] != super::ART_NET_HEADER.as_slice() {
        return None;
    }
    if u16::from_le_bytes([payload[8], payload[9]]) != 0x8300 {
        return None;
    }
    if payload[43] != 0x20 || payload[44] != 0x00 || payload[45] != 0x50 {
        return None;
    }
    let mut out = ART_RDM_GET_SUPPORTED_PARAMS_RESPONSE.to_vec();
    if payload.len() > 38 && out.len() > 38 {
        out[38] = payload[38];
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canned_response_len_matches_capture() {
        assert_eq!(ART_RDM_GET_SUPPORTED_PARAMS_RESPONSE.len(), 91);
    }
}
