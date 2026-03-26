//! Criterion benchmarks for the LumenFlow hot path.
//!
//! Targets the critical operations that run at 22,000 packets/sec:
//! parsing, buffer updates, store lookups, and full pipeline throughput.

use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};
use lumenflow_core::{ArtNetPacket, ArtNetParser, UniverseBuffer, UniverseStore};

fn build_artdmx_packet(universe: u16, sequence: u8, dmx_data: &[u8]) -> Vec<u8> {
    let len = dmx_data.len() as u16;
    let mut pkt = Vec::with_capacity(18 + dmx_data.len());
    pkt.extend_from_slice(b"Art-Net\0");
    pkt.extend_from_slice(&0x5000u16.to_le_bytes());
    pkt.push(0x00);
    pkt.push(0x0e);
    pkt.push(sequence);
    pkt.push(0x00);
    pkt.extend_from_slice(&universe.to_le_bytes());
    pkt.extend_from_slice(&len.to_be_bytes());
    pkt.extend_from_slice(dmx_data);
    pkt
}

fn bench_parse_artdmx(c: &mut Criterion) {
    let mut group = c.benchmark_group("hot_path/parse");
    let packet = build_artdmx_packet(0x0001, 1, &[128u8; 512]);

    group.throughput(Throughput::Elements(1));
    group.bench_function("artdmx_512ch", |b| {
        b.iter(|| ArtNetParser::parse(black_box(&packet)))
    });
    group.finish();
}

fn bench_universe_buffer_update(c: &mut Criterion) {
    let mut group = c.benchmark_group("hot_path/buffer_update");
    let buf = UniverseBuffer::new(0x0001);
    let data = [128u8; 512];

    group.throughput(Throughput::Bytes(512));
    group.bench_function("512_bytes", |b| {
        b.iter(|| buf.update(black_box(&data), black_box(1)))
    });
    group.finish();
}

fn bench_universe_store_update(c: &mut Criterion) {
    let mut group = c.benchmark_group("hot_path/store_update");
    let store = UniverseStore::new();
    for i in 0..500u16 {
        store.update(i, &[0u8; 512], 0, 0, 0, false);
    }
    let data = [128u8; 512];

    group.throughput(Throughput::Elements(1));
    group.bench_function("existing_universe_500_warm", |b| {
        b.iter(|| {
            store.update(
                black_box(42),
                black_box(&data),
                black_box(1),
                0x0A000001,
                0,
                false,
            )
        })
    });
    group.finish();
}

fn bench_full_pipeline(c: &mut Criterion) {
    let mut group = c.benchmark_group("hot_path/full_pipeline");
    let store = UniverseStore::new();
    for i in 0..500u16 {
        store.update(i, &[0u8; 512], 0, 0, 0, false);
    }
    let packet = build_artdmx_packet(0x0042, 1, &[128u8; 512]);

    group.throughput(Throughput::Elements(1));
    group.bench_function("parse_and_store", |b| {
        b.iter(|| {
            if let Ok(ArtNetPacket::Dmx { header, dmx_data }) =
                ArtNetParser::parse(black_box(&packet))
            {
                store.update(
                    header.port_address(),
                    dmx_data,
                    header.sequence,
                    0x0A000001,
                    header.physical,
                    false,
                );
            }
        })
    });
    group.finish();
}

fn bench_snapshot(c: &mut Criterion) {
    let mut group = c.benchmark_group("hot_path/snapshot");
    let store = UniverseStore::new();
    for i in 0..500u16 {
        store.update(i, &[128u8; 512], 1, 0, 0, false);
    }
    let mut out = [0u8; 512];

    group.throughput(Throughput::Bytes(512));
    group.bench_function("single_universe", |b| {
        b.iter(|| store.snapshot(black_box(42), black_box(&mut out)))
    });
    group.finish();
}

criterion_group!(
    benches,
    bench_parse_artdmx,
    bench_universe_buffer_update,
    bench_universe_store_update,
    bench_full_pipeline,
    bench_snapshot,
);
criterion_main!(benches);
