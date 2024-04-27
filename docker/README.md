**BUILD**  
podman build -t stremio-seed .  
**PULL**  
podman pull vancengvn/stremio-seed  
**RUN**  
podman run -d -p 11470:11470 -p 12470:12470 -p 13470:13470 -e INTERVAL_CHECK={param} -e CUSTOM_CACHE_SIZE={param} ... stremio-seed  
**STREMIO SERVER**  
port:  
- http: 11470  
- https: 12470  

**QBITTORRENT**  
port: `13470`  
username: `admin`  
password: `admin123`  