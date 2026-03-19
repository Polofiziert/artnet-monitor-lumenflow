// Fuzzing target for Art-Net DMX parser
// 
// This fuzzer tests the robustness of the Art-Net parser against
// malformed and random packet data. 100% branch coverage required.
//
// Run with: cargo fuzz run artnet_dmx_parser

#![no_main]
use libfuzzer_sys::fuzz_target;
use lumenflow_core::artnet::ArtNetParser;

fuzz_target!(|data: &[u8]| {
    // The parser should never panic, even on invalid input
    let _ = ArtNetParser::parse(data);
});
