FROM docker.io/qbittorrentofficial/qbittorrent-nox

#disable localhost authentication
RUN mkdir -p /config/qBittorrent/config/
COPY qBittorrent.conf /config/qBittorrent/config/

RUN apk --no-cache add nodejs ffmpeg

WORKDIR /stremio

COPY . .

#create default cache folder
RUN mkdir -p /root/.stremio-server/stremio-cache

#qBittorrent require permission to work
RUN chmod 777 /root

# HTTP
EXPOSE 11470

# HTTPS
EXPOSE 12470

# qBittorrent WebUI
EXPOSE 13470

ENV NO_CORS=1

ENV CASTING_DISABLED=1

ENV QBT_WEBUI_PORT=13470

ENTRYPOINT [ "/stremio/entrypoint.sh" ]
