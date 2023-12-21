**Note**
This extension will auto update files from the Stremio Cache to the qBittorrent client, so make sure you have installed qBittorrent as the client first!

**BEFORE INSTALL**
- And you also need to enable the WebUI feature on qBittorrent.
![image](https://github.com/Vance-ng-vn/Stremio-Seeds/assets/88782390/f672a689-f53e-43c8-a23b-aef06c23c4df)


**INStALL**
1. Extract extensions.zip to the folder have server.js (same directory as Stremio.exe)
2. Open 'server.js' as a text editor
3. Add this line to the begin of server.js:
  `require('./extensions/stremio-seeds/stremio-seeds.js');`
4. Save! Restart Stremio.