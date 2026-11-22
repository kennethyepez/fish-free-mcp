FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2
RUN apt-get update && apt-get upgrade -y --no-install-recommends && apt-get install -y --no-install-recommends squid ca-certificates && rm -rf /var/lib/apt/lists/*
COPY squid.conf /etc/squid/squid.conf
USER 13:13
CMD ["squid","-N","-f","/etc/squid/squid.conf"]
