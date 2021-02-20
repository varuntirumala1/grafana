#!/bin/bash
cloudflared --origincert /config/cert.pem --config /config/config.yml tunnel run logcollector
