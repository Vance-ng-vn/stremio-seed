#!/bin/sh

/sbin/tini -g -- /entrypoint.sh &

/sbin/tini -g -- /usr/bin/node /stremio/server.js