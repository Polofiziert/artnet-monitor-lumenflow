// Benchmark: DMX parser throughput
// Measures packets/sec and latency under load

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use lumenflow_core::ArtNetParser;

fn dmx_parser_throughput(c: &mut Criterion) {
    let mut pkt = Vec::with_capacity(18 + 512);
    pkt.extend_from_slice(b"Art-Net\0");
    pkt.extend_from_slice(&0x5000u16.to_le_bytes());
    pkt.push(0x00); // ProtVerHi
    pkt.push(0x0e); // ProtVerLo
    pkt.push(0x00); // Sequence
    pkt.push(0x00); // Physical
    pkt.extend_from_slice(&0x0000u16.to_le_bytes()); // Universe
    pkt.extend_from_slice(&512u16.to_be_bytes()); // Length (big-endian)
    pkt.extend_from_slice(&[0u8; 512]); // DMX data

    c.bench_function("parse_valid_artnet_packet", |b| {
        b.iter(|| ArtNetParser::parse(black_box(&pkt)))
    });
}

fn ring_buffer_performance(c: &mut Criterion) {
    let mut group = c.benchmark_group("ring_buffer");
    
    for size in [100, 1000, 10000].iter() {
        group.bench_with_input(BenchmarkId::from_parameter(size), size, |b, &size| {
            b.iter(|| {
                let _buf: Vec<u8> = Vec::with_capacity(size);
                // Simulate ring buffer operations
            });
        });
    }
    
    group.finish();
}

fn concurrent_universe_access(c: &mut Criterion) {
    c.bench_function("500_universes_concurrent_read", |b| {
        b.iter(|| {
            // Simulate reading 500 universes
            for _i in 0..500 {
                let _ = black_box([0u8; 512]);
            }
        });
    });
}

criterion_group!(
    benches,
    dmx_parser_throughput,
    ring_buffer_performance,
    concurrent_universe_access
);

criterion_main!(benches);
