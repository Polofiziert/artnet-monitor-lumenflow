FROM rust:latest AS builder

WORKDIR /workspace

# Copy workspace files
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates

# Build the core library and CLI
RUN cargo build --release -p lumenflow_core -p lumenflow_cli

# Runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    libssl3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /workspace/target/release/lumenflow /usr/local/bin/

EXPOSE 6454/udp

ENTRYPOINT ["lumenflow"]
