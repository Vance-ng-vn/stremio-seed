const fs = require('fs');
const os = require('os');
const dotenv = require('dotenv');
const qt = require('./qbittorrentAPI');
const parseTorrent = require('parse-torrent');
const path = require('path');

dotenv.configDotenv({
    path: path.join(__dirname, 'stremio-seeds.config')
})

const LINUX_DEFAULT_CACHE_DIR = path.join(os.homedir(), '/.stremio-server/stremio-cache');
const WINDOWS_DEFAULT_CACHE_DIR = path.join(os.homedir(), '/AppData/Roaming/stremio/stremio-server/'); // Fix
const MACOS_DEFAULT_CACHE_DIR = path.join(os.homedir(), '/Application Support/stremio-server/stremio-cache');
const CUSTOM_CACHE_DIR = process.env.CACHE_DIR;

let CacheDir;
if(os.platform() === 'win32')
    CacheDir = WINDOWS_DEFAULT_CACHE_DIR;
if(os.platform() === 'linux')
    CacheDir = LINUX_DEFAULT_CACHE_DIR;
if(os.platform() === 'darwin')
    CacheDir = MACOS_DEFAULT_CACHE_DIR;
if(CUSTOM_CACHE_DIR)
    CacheDir = CUSTOM_CACHE_DIR;

CacheDir = CacheDir.replace(/\/$/, '');

//Allow stremio-server folder
if(CacheDir.split('/').pop()?.includes('stremio-server'))
    CacheDir = path.join(CacheDir, 'stremio-cache');

//Hear about some guy can custom cache folder
if(CacheDir.split('/').pop() != 'stremio-cache' && fs.readdirSync(CacheDir)?.includes('stremio-cache'))
    CacheDir = path.join(CacheDir, 'stremio-cache');

const CUSTOM_CACHE_SIZE = process.env.CUSTOM_CACHE_SIZE;
let _CUSTOM_CACHE_SIZE;
if(CUSTOM_CACHE_SIZE) {
    let size = 0;
    if(CUSTOM_CACHE_SIZE?.match(/kb/i)) size = parseFloat(CUSTOM_CACHE_SIZE) * 1024; else
    if(CUSTOM_CACHE_SIZE?.match(/mb/i)) size = parseFloat(CUSTOM_CACHE_SIZE) * 1024 * 1024; else
    if(CUSTOM_CACHE_SIZE?.match(/gb/i)) size = parseFloat(CUSTOM_CACHE_SIZE) * 1024 * 1024 * 1024; else
    if(CUSTOM_CACHE_SIZE?.match(/tb/i)) size = parseFloat(CUSTOM_CACHE_SIZE) * 1024 * 1024 * 1024 * 1024; else
    size = parseInt(CUSTOM_CACHE_SIZE);
    _CUSTOM_CACHE_SIZE = size;
    if(size) {
        const configFile = path.join(CacheDir, '..', 'server-settings.json');
        const _file = fs.readFileSync(configFile, 'utf-8');
        const _json = JSON.parse(_file);
        _json.cacheSize = size;
        fs.writeFileSync(configFile, JSON.stringify(_json, null, 2));
    }

}

if(!process.env.QT_HOST)  process.env.QT_HOST = 'http://127.0.0.1';
if(!process.env.QT_PORT)  process.env.QT_PORT = '6775';

const BASE_URL = process.env.QT_HOST + ':' + process.env.QT_PORT;
const USERNAME = process.env.USERNAME || 'admin';
const PASSWORD = process.env.PASSWORD || '';
let UPLOAD_LIMIT = process.env.UPLOAD_LIMIT; //bytes
if(UPLOAD_LIMIT?.match(/kb/i)) UPLOAD_LIMIT = parseInt(UPLOAD_LIMIT) * 1024; else
if(UPLOAD_LIMIT?.match(/mb/i)) UPLOAD_LIMIT = parseInt(UPLOAD_LIMIT) * 1024 * 1024; else
if(UPLOAD_LIMIT?.match(/gb/i)) UPLOAD_LIMIT = parseInt(UPLOAD_LIMIT) * 1024 * 1024 * 1024; else
UPLOAD_LIMIT = parseInt(UPLOAD_LIMIT);

let INTERVAL_CHECK = process.env.INTERVAL_CHECK;
if(INTERVAL_CHECK?.match(/sec/i)) INTERVAL_CHECK = parseFloat(INTERVAL_CHECK) * 1000; else
if(INTERVAL_CHECK?.match(/min/i)) INTERVAL_CHECK = parseFloat(INTERVAL_CHECK) * 60 * 1000; else
if(INTERVAL_CHECK?.match(/hour/i)) INTERVAL_CHECK = parseFloat(INTERVAL_CHECK) * 60 * 60 * 1000; else
if(INTERVAL_CHECK?.match(/day/i)) INTERVAL_CHECK = parseFloat(INTERVAL_CHECK) * 24 * 60 * 60 * 1000;

const RATIO_LIMIT = parseFloat(process.env.RATIO_LIMIT);
const BLOCK_DOWNLOAD = process.env.BLOCK_DOWNLOAD?.match(/true/i) ? true : false;
const SKIP_CHECKING = process.env.SKIP_CHECKING?.match(/true/i) ? true : false;
const INCLUDE_TRACKER = process.env.INCLUDE_STREMIO_TRACKER?.match(/true/i) ? true : false;
const KEEP_TORRENT_LOW_SEEDER = process.env.KEEP_TORRENT_LOW_SEEDER?.match(/true/i) ? true : false;

const qbittorrent = new qt(BASE_URL, USERNAME, PASSWORD, { UPLOAD_LIMIT, RATIO_LIMIT, INCLUDE_TRACKER, BLOCK_DOWNLOAD, SKIP_CHECKING });

console.log('############### Stremio Seeds ##############');
console.log('OS:', os.platform());
console.log('Cache Dir:', CacheDir);
if(CUSTOM_CACHE_SIZE) console.log('Cache Size:', CUSTOM_CACHE_SIZE);
console.log('INTERVAL CHECK:', INTERVAL_CHECK);
console.log('RATIO LIMIT:', RATIO_LIMIT),
console.log('UPLOAD LIMIT:', UPLOAD_LIMIT);
console.log('INCLUDE TRACKERS:', INCLUDE_TRACKER);
console.log('############# END ##############');

main();

async function main(){ 
    try {
        const login = await qbittorrent.login().catch(err => console.error(err));
        if(!login) {
            console.error('Login Fail!');
            return setTimeout(() => main(), 10000);
        }

        cleanEmptyCache();
        await Update();
        if(INTERVAL_CHECK) {
            setInterval(async () => {
                await Update();
            }, INTERVAL_CHECK);
        }
    }
    catch(err) {
        console.error(err);
    }
}

async function Update() {
    try {
        if(KEEP_TORRENT_LOW_SEEDER && _CUSTOM_CACHE_SIZE) {
            const currentCacheSize = getFolderSize(CacheDir);
            if((currentCacheSize/_CUSTOM_CACHE_SIZE)*100 >= 90){
                await cleanTorrentsCache(currentCacheSize);
            }
        }

        let dirs = fs.readdirSync(CacheDir)?.filter(_dir => fs.statSync(path.join(CacheDir, _dir)).isDirectory());
        //console.log(dirs.length);
        const torrentList = await qbittorrent.getTorrentList({
            category: 'Stremio Seeds'
        });
        if(!torrentList) return;

        const torrentListHashes = torrentList.map(_torrent => _torrent.hash);

        const expiredTorrentsHash = torrentListHashes.filter(_hash => !checkFolder(path.join(CacheDir, _hash)));
        if(expiredTorrentsHash.length) {
            console.log('Deleting Expired Torrents:', expiredTorrentsHash.length);
            await qbittorrent.removeTorrents(expiredTorrentsHash, true);
            for(const _dir of expiredTorrentsHash) {
                fs.rmSync(path.join(CacheDir, _dir), {recursive: true});
            }
        }

        const validDirs = dirs.filter(dir => !torrentListHashes.find(_hash => _hash === dir));

        for(const dir of validDirs) {
            console.log(path.join(CacheDir, dir))
            await addTorrent(path.join(CacheDir, dir));
        }
    }
    catch(err) {
        console.error('Unknow Error!', err.stack);
    }
}

function cleanEmptyCache() {
    console.log('Cleaning empty folder...');
    const dirs = fs.readdirSync(CacheDir)?.filter(_dir => fs.statSync(path.join(CacheDir, _dir)).isDirectory());
    for(const dir of dirs) {
        const folderPath = path.join(CacheDir, dir);
        if(!checkFolder(folderPath)) {
            console.log('Deleting folder:', folderPath);
            fs.rmSync(folderPath, {recursive: true});
        }
    }
}

async function cleanTorrentsCache(currentSize) {
    console.log('Cleaning torrent, bc cache is full...');
    const dirs = fs.readdirSync(CacheDir)?.filter(_dir => fs.statSync(path.join(CacheDir, _dir)).isDirectory());
    //console.log(dirs.length);
    const torrentList = await qbittorrent.getTorrentList({
        category: 'Stremio Seeds',
        sort: 'num_complete'
    });
    if(!torrentList) return;

    const torrentListHashes = torrentList.map(_torrent => _torrent.hash);

    const _dirs = dirs.map(_dir => {
        return {
            name: _dir,
            time: fs.statSync(path.join(CacheDir, _dir)).birthtimeMs
        }
    })
    .sort((a,b) => b.time - a.time)
    .slice(3); //skip last 3 file newest

    let _removed_size = 0;

    const _remove_size = currentSize - _CUSTOM_CACHE_SIZE*90/100;
    //console.log('will remove', _remove_size)

    //clean Uncompleted Torrents;
    for(const _dir of _dirs.reverse()) {
        const folderPath = path.join(CacheDir, _dir.name);
        if(!checkFolder(folderPath)) continue;
        const bitfield = path.join(folderPath, 'bitfield');
        const cacheTorrent = path.join(folderPath, 'cache');
        const torrent = parseTorrent(fs.readFileSync(cacheTorrent));
        const totalPieces = (torrent.length - torrent.lastPieceLength)/torrent.pieceLength + 1;
        if(!checkBitField(bitfield, totalPieces)) {
            _removed_size += getFolderSize(folderPath);
            console.log('Cache Full: Deleting Folder:', _dir.name);
            fs.rmSync(folderPath, {recursive: true});
        }
        if(_removed_size >= _remove_size) break;
    }

    //clean Completed Torrents
    while(_removed_size < _remove_size && torrentListHashes.length) {
        const shouldDeleteIdx = torrentListHashes.reverse().findIndex(_hash => _dirs.find(_dir => _dir.name === _hash));
        if(shouldDeleteIdx !== -1) {
            const shouldDelete = torrentListHashes.reverse().splice(shouldDeleteIdx, 1)[0];
            const folderPath = path.join(CacheDir, shouldDelete);
            _removed_size += getFolderSize(folderPath);
            console.log('Cache Full: Deleing Torrent + Folder:', shouldDelete);
            await qbittorrent.removeTorrents([shouldDelete], true);
            fs.rmSync(folderPath, {recursive: true});
        } else break;
    }

    console.log('Removed', Math.floor(_removed_size/(1024*1024)), 'MB');
}

function getFolderSize(folderPath) {
    let totalSize = 0;
    const traverse = (currentPath) => {
      const files = fs.readdirSync(currentPath);
      files.forEach(file => {
        const filePath = path.join(currentPath, file);
        const stats = fs.lstatSync(filePath);
        if (stats.isDirectory()) {
          traverse(filePath);
        }
        else if(stats.isSymbolicLink()) {
            try {
                totalSize += stats.size;
            }
            catch(err) {
                console.error('symbolink error:', filePath);
            }
        }
        else {
          totalSize += stats.size;
        }
      });
    };
    traverse(folderPath);
    return totalSize;
}

function checkFolder(folderPath) {
    const bitfield = path.join(folderPath, 'bitfield');
    const cacheTorrent = path.join(folderPath, 'cache');
    if(!fs.existsSync(bitfield) || !fs.existsSync(cacheTorrent)) return false;
    return true;
}

const createDirectories = (filePath) => {
    const directory = path.dirname(filePath);

    if (!fs.existsSync(directory)) {
        createDirectories(directory);
        fs.mkdirSync(directory);
    }
};

async function addTorrent(folderPath) {
    const bitfield = path.join(folderPath, 'bitfield');
    const cacheTorrent = path.join(folderPath, 'cache');
    if(!fs.existsSync(bitfield) || !fs.existsSync(cacheTorrent)) return;
    const torrent = parseTorrent(fs.readFileSync(cacheTorrent));
    console.log(torrent.info.name.toString('utf-8'));

    //Flatpak default folder
    let _folderPath = folderPath;
    if(process.env.FLATPAK_ID) _folderPath = folderPath.replace(os.homedir(), path.join(os.homedir(), '/.var/app/com.stremio.Stremio'));

    let totalPieces = (torrent.length - torrent.lastPieceLength)/torrent.pieceLength + 1;
    if(checkBitField(bitfield, totalPieces)) {
        //make symbol link
        for(const idx in torrent.files) {
            const offset = path.join(_folderPath, idx);
            const syml = path.join(folderPath, torrent.files[idx].path);
            console.log(fs.existsSync(syml), syml)
            if(!fs.existsSync(syml) && fs.existsSync(offset)) {
                createDirectories(syml);
                fs.symlinkSync(offset, syml, 'file');
            }
        }

        //add torrent to qbittorrent
        console.log('Adding torrent at:', folderPath.split('/').pop());
        await qbittorrent.addTorrentFile(cacheTorrent, _folderPath);
    }
}

function checkBitField(bitFieldPath, totalPieces) {
    let pieces = 0;
    const bytes = fs.readFileSync(bitFieldPath);
    for(const byte of bytes) {
        if(byte === 255)
            pieces += 8;
        else {
            let bits = 0;
            for(let i = 7; i >= 0; i--) {
                if(byte & (1 << i)) bits++;
            }
            pieces += bits;
        }
    }
    const percent = (pieces/totalPieces) * 100;
    console.log('   => Pieces:', pieces, 'Percent:', Math.floor(percent * 100)/100 + '%');
    if(percent >= 90) return true;
    return false;
}