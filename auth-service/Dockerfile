FROM rust:1.90-slim-bookworm AS builder

WORKDIR /app

COPY auth-service/Cargo.toml auth-service/Cargo.lock ./auth-service/
RUN mkdir -p auth-service/src && echo "fn main() {}" > auth-service/src/main.rs
RUN cargo build --manifest-path auth-service/Cargo.toml --release

COPY auth-service ./auth-service
RUN cargo build --manifest-path auth-service/Cargo.toml --release

FROM debian:bookworm-slim

RUN useradd --create-home --uid 10001 sounduncloud

COPY --from=builder /app/auth-service/target/release/sounduncloud-auth-service /usr/local/bin/sounduncloud-auth-service

ENV PORT=10000

USER sounduncloud
EXPOSE 10000

CMD ["sounduncloud-auth-service"]
