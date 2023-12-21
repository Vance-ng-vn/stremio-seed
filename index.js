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
const WINDOWS_DEFAULT_CACHE_DIR = path.join(os.homedir(), '/AppData/Roaming/stremio/stremio-server/stremio-cache');
const CUSTOM_CACHE_DIR = process.env.CACHE_DIR;

let CacheDir;
if(os.platform() === 'win32')
    CacheDir = WINDOWS_DEFAULT_CACHE_DIR;
if(os.platform() === 'linux')
    CacheDir = LINUX_DEFAULT_CACHE_DIR;
if(CUSTOM_CACHE_DIR)
    CacheDir = CUSTOM_CACHE_DIR;

const CUSTOM_CACHE_SIZE = process.env.CUSTOM_CACHE_SIZE;
if(CUSTOM_CACHE_SIZE) {
    let size = 0;
    if(CUSTOM_CACHE_SIZE?.match(/kb/i)) size = parseFloat(CUSTOM_CACHE_SIZE) * 1024; else
    if(CUSTOM_CACHE_SIZE?.match(/mb/i)) size = parseFloat(CUSTOM_CACHE_SIZE) * 1024 * 1024; else
    if(CUSTOM_CACHE_SIZE?.match(/gb/i)) size = parseFloat(CUSTOM_CACHE_SIZE) * 1024 * 1024 * 1024; else
    if(CUSTOM_CACHE_SIZE?.match(/tb/i)) size = parseFloat(CUSTOM_CACHE_SIZE) * 1024 * 1024 * 1024 * 1024; else
    size = parseInt(CUSTOM_CACHE_SIZE);
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
if(INTERVAL_CHECK?.match(/day/i)) INTERVAL_CHECK = parseFloat(INTERVAL_CHECK) * 24 * 60 * 60 * 1000; else
INTERVAL_CHECK = 5 * 60 * 1000;

const RATIO_LIMIT = parseFloat(process.env.RATIO_LIMIT);
const INCLUDE_TRACKER = process.env.INCLUDE_STREMIO_TRACKER?.match(/true/i) ? true : false;

const qbittorrent = new qt(BASE_URL, USERNAME, PASSWORD, { UPLOAD_LIMIT, RATIO_LIMIT, INCLUDE_TRACKER });

console.log('############### Stremio Seeds ##############');
console.log('OS:', os.platform());
console.log('Cache Dir:', CacheDir);
console.log('INTERVAL CHECK:', INTERVAL_CHECK);
console.log('RATIO LIMIT:', RATIO_LIMIT),
console.log('UPLOAD LIMIT:', UPLOAD_LIMIT);
console.log('INCLUDE TRACKERS:', INCLUDE_TRACKER);
console.log('############# END ##############');

async function main() { 
    const login = await qbittorrent.login().catch(err => console.error(err));
    if(!login) {
        console.error('Login Fail!');
        return setTimeout(() => main(), 10000);
    }

    //CacheDir = process.cwd();
    setInterval(async () => {
        try {
            let dirs = fs.readdirSync(CacheDir)?.filter(_dir => fs.statSync(path.join(CacheDir, _dir)).isDirectory());
            //=console.log(dirs.length);
            const torrentList = await qbittorrent.getTorrentList({
                catgory: 'Stremio Seeds'
            });
            if(!torrentList) return;

            const torrentListHashes = torrentList.map(_torrent => _torrent.hash);

            const expiredTorrentsHash = torrentListHashes.filter(_hash => !checkFolder(path.join(CacheDir, _hash)));
            if(expiredTorrentsHash.length) {
                console.log('Deleting Expired Torrents:', expiredTorrentsHash.length);
                await qbittorrent.removeTorrents(expiredTorrentsHash, true);
                for(const _dir of expiredTorrentsHash) {
                    deleteFolderRecursive(path.join(CacheDir, _dir));
                }
            }

            const validDirs = dirs.filter(dir => !torrentListHashes.find(_hash => _hash === dir));

            for(const dir of validDirs) {
                await addTorrent(path.join(CacheDir, dir));
            }
        }
        catch(err) {
            console.error('Unknow Error!', err.stack);
        }
    }, INTERVAL_CHECK);

}

main()

async function checkFolder(folderPath) {
    const bitfield = path.join(folderPath, 'bitfield');
    const cacheTorrent = path.join(folderPath, 'cache');
    if(!fs.existsSync(bitfield) || !fs.existsSync(cacheTorrent)) return;
    return true;
}

function deleteFolderRecursive(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach((file) => {
            const filePath = path.join(folderPath, file);
    
            if (fs.lstatSync(filePath).isFile()) {
                console.log("deleting file: " + filePath);
                fs.unlinkSync(filePath);
            } else {
                console.log("deleting folder: " + filePath);    
                try {
                    deleteFolderRecursive(filePath);
                }
                catch(err){
                    fs.unlinkSync(filePath);
                    console.log("[ERROR] Cant delete this file: " + filePath);
                }
            }
        });
        fs.rmdirSync(folderPath);
    }
}

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
            const syml = path.join(folderPath, torrent.files[idx].name);
            //console.log(fs.existsSync(syml), syml)
            if(!fs.existsSync(syml) && fs.existsSync(offset)) {
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