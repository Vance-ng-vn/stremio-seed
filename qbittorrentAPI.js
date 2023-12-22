const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const ParseTorrent = require('parse-torrent');

const DEFAULT_TRACKER = [
    "udp://47.ip-51-68-199.eu:6969/announce",
    "udp://9.rarbg.me:2940",
    "udp://9.rarbg.to:2820",
    "udp://exodus.desync.com:6969/announce",
    "udp://explodie.org:6969/announce",
    "udp://ipv4.tracker.harry.lu:80/announce",
    "udp://open.stealth.si:80/announce",
    "udp://opentor.org:2710/announce",
    "udp://opentracker.i2p.rocks:6969/announce",
    "udp://retracker.lanta-net.ru:2710/announce",
    "udp://tracker.cyberia.is:6969/announce",
    "udp://tracker.dler.org:6969/announce",
    "udp://tracker.ds.is:6969/announce",
    "udp://tracker.internetwarriors.net:1337",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://tracker.tiny-vps.com:6969/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://valakas.rollo.dnsabr.com:2710/announce",
    "udp://www.torrent.eu.org:451/announce",
    "http://nyaa.tracker.wf:7777/announce"
];

class qbittorrentAPI {
    constructor(baseURl, username, password, {...options}) {
        this.baseURl = baseURl;
        this.auth = `username=${username}&password=${password}`;
        this.cookie = null;
        this.up_limit = options.UPLOAD_LIMIT;
        this.ratio = options.RATIO_LIMIT;
        this.include_trackers = options.INCLUDE_TRACKER;
        this.block_dl = options.BLOCK_DOWNLOAD;
        this.skip_check = options.SKIP_CHECKING;
    }

    async login() {
        return await axios.get(this.baseURl + '?' + this.auth,
        {
            headers: {
                Referer: this.baseURl
            }
        }).then(res => {
            if(res.status == 200) {
                this.cookie = res.headers.get('set-cookie')?.join(';');
                if(this.cookie)
                console.log('Login to qbittorrent success!');
                return true;
            }
            else {
                return false;
            }
        }).catch(err => {
            throw new Error('fetch: unknow error on login!', err);
        })
    }

    request(urlPath, options = {}) {
        options.headers = {
            'Cookie': this.cookie,
            ...options.headers
        }

        return axios(this.baseURl + '/api/v2' + urlPath, options);
    }

    async getTorrentList(options = {
        filter: null,
        catgory: null,
        tag: null,
        sort: null,
        reverse: false,
        limit: null,
        offset: null,
        hashes: []
    }) {
        let data = [];
        if(options.filter) data.push('filter=' + options.filter);
        if(options.catgory) data.push('category=' + options.catgory);
        if(options.tag) data.push('tag=' + options.tag);
        if(options.sort) data.push('sort=' + options.sort);
        if(options.reverse) data.push('reverse=' + options.reverse);
        if(options.limit) data.push('limit=' + options.limit);
        if(options.offset) data.push('offset=' + options.offset);
        if(options.hashes?.length) data.push('hashes=' + options.hashes.join('|'));

        return await this.request('/torrents/info?' + encodeURI(data.join('&')))
        .then(res => {
            if(res.status == 200) {
                return res.data;
            }
            else {
                console.log('Get TorrentList Failed!', res.status)
                return false;
            }
        })
        .catch(err => {
            console.error(err);
        })
    }
    async addTorrentFile(pathFile, saveDir, rename) {
        const formData = new FormData();

        formData.append('torrents', fs.createReadStream(pathFile));
        formData.append('savepath', saveDir);
        formData.append('category', 'Stremio Seeds');
        formData.append('firstLastPiecePrio', 'true');
        if(rename) formData.append('rename', rename);
        if(this.up_limit) formData.append('upLimit', this.up_limit);
        if(this.ratio) formData.append('ratioLimit', this.ratio);
        if(this.block_dl) formData.append('dlLimit', 1024); //qBittorrent only allow set DL Limit to 1KiB/s
        if(this.skip_check) formData.append('skip_checking', 'true'); //skip check the torrent hash when added, for performance!
        //console.log(formData)

        return await this.request('/torrents/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'multipart/form-data'
            },
            data: formData
        }).then(async res => {
            if(res.status == 200) {

                if(this.include_trackers) {
                    const _torrent = ParseTorrent(fs.readFileSync(pathFile));
                    const _hashes = _torrent.infoHash;
                    await this.addTrackers(_hashes, DEFAULT_TRACKER);
                };

                console.log('Add Susceess!');
                return true;
            }
            else {
                console.log('Add failed', res.status)
                return false;
            }
        }).catch(err => {
            console.error(err);
        })
    }

    async removeTorrents(hashes = Array, deleteFile) {
        if(!hashes.length) return;
        return await this.request('/torrents/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: 'hashes=' + hashes.join('|') + deleteFile ? '&deleteFiles=true' : '&deleteFiles=false'
        })
        .then(res => {
            if(res.status == 200) {
                console.log('Delete Susceess!');
                return true;
            }
            else {
                console.log('Delete Failed!', res.status)
                return false;
            }
        })
        .catch(err => {
            console.error(err);
        })
    }

    async addTrackers(hashes, trackers = Array) {
        if(!trackers.length) return;
        return await this.request('/torrents/addTrackers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: `hash=${hashes}&urls=${trackers.join('\%0A')}`,
        }).then(res => {
            if(res.status == 200) {
                console.log('AddTracker Susceess!');
                return true;
            }
            else {
                console.log('AddTracker Failed!', res.status)
                return false;
            }
        }).catch(err => {
            console.error(err);
        })
    }
}

module.exports = qbittorrentAPI;