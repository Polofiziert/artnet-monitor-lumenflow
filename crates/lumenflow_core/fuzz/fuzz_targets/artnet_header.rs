// Fuzzing target for Art-Net header validation
// Ensures header parsing is robust against corrupted data

#![no_main]
use libfuzzer_sys::fuzz_target;
use lumenflow_core::artnet::ArtNetParser;

fuzz_target!(|data: &[u8]| {
    if data.len() < 8 {
        return; // Art-Net header is 8 bytes minimum
    }
    
    let _ = ArtNetParser::parse(data);
});
