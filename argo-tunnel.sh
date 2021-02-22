#!/bin/bash
cloudflared --origincert /data/cert.pem --config /data/config.yml tunnel run -p http2 logcollector
