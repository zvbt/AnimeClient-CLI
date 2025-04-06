import fetch from 'node-fetch';
import FeedParser from 'feedparser';
import fs from 'fs-extra';
import path from 'path';
import WebTorrent from 'webtorrent';
import express from 'express';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import dotenv from 'dotenv';
import { Readable } from 'stream';
dotenv.config();

const app = express();
const port = 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function fetchRSSFeed(rssUrl) {
    const res = await fetch(rssUrl);
    const body = await res.text();

    if (!res.ok || !body.includes('<?xml')) {
        console.error("Not valid RSS feed, received:", body.slice(0, 200));
    }

    return body;
}


async function searchAnime(rssUrl, animeName) {
    const rssData = await fetchRSSFeed(rssUrl);
    const feedparser = new FeedParser();
    const animeList = [];

    return new Promise((resolve, reject) => {
        feedparser.on('error', (err) => {
            console.error('FeedParser error:', err);
            reject(err);
        });

        feedparser.on('data', (item) => {
            if (item.title.toLowerCase().includes(animeName.toLowerCase())) {
                animeList.push(item);
            }
        });

        feedparser.on('end', () => {
            resolve(animeList);
        });

        // Wrap string into a stream
        const stream = Readable.from([rssData]);
        stream.pipe(feedparser);
    });
}


// stream the torrent file using webtorrent
async function streamTorrent(magnetLink) {
    const client = new WebTorrent({ utp: false });
    const downloadPath = './downloads';
    fs.mkdirSync(downloadPath, { recursive: true });

    const selectedEpisode = '01';  // Example: dynamically set this based on user input

    client.add(magnetLink, { path: downloadPath }, (torrent) => {
        // console.log("Torrent files:", torrent.files.map(file => file.name));

        let episodeFile = torrent.files.find(file => {
            const episodePattern = new RegExp(`(?:\\D|^)${selectedEpisode}(?:\\D|$)`, 'i');
            return episodePattern.test(file.name);
        });

        // If no file was found, select the first video file as a fallback
        if (!episodeFile) {
            episodeFile = torrent.files.find(file => file.name.match(/\.(mkv|mp4|avi|webm)$/i));
        }

        if (episodeFile) {
            console.log(`Found episode file: ${episodeFile.name}`);

            torrent.files.forEach(file => {
                if (file === episodeFile) {
                    file.select();
                } else {
                    file.deselect();
                }
            });

            // Variable to track if the stream has started
            let started = false;

            // Open the torrent in mpv when enough data is available
            episodeFile.createReadStream()
                .on('data', (chunk) => {
                    // Once we have received the first chunk, open the video in mpv
                    if (!started) {
                        started = true;
                        console.log('Torrent started streaming, opening in video player...');
                        openInExternalPlayer(`http://localhost:${port}/stream`);
                    }
                })
                .on('end', () => {
                    console.log('Torrent finished downloading');
                });

            // app.get('/player', (req, res) => {
            //     res.sendFile(path.join(__dirname, 'index.html'));
            // });

            app.get('/stream', (req, res) => {
                const extname = path.extname(episodeFile.name).toLowerCase();
                let contentType = 'video/mp4';

                if (extname === '.mkv') {
                    contentType = 'video/x-matroska';
                } else if (extname === '.avi') {
                    contentType = 'video/x-msvideo';
                } else if (extname === '.webm') {
                    contentType = 'video/webm';
                }

                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                res.writeHead(200, { 'Content-Type': contentType });

                const videoStream = episodeFile.createReadStream();
                videoStream.pipe(res);

                res.on('close', () => {
                    console.log('Client disconnected or stream closed');
                    videoStream.destroy();
                });

                res.on('error', (err) => {
                    videoStream.destroy(err);
                });

                videoStream.on('error', (err) => {
                    res.end();
                });
            });
        } else {
            console.log(`Episode ${selectedEpisode} not found in this torrent.`);
        }
    });
}


// handle user interaction for selecting anime and episodes
function showResolutionMenu(animeList) {
    return new Promise((resolve) => {
        console.clear();
        console.log('Select anime and episode:');
        animeList.forEach((anime, index) => {
            console.log(`${index + 1}. ${anime.title}`);
        });

        rl.question('Choose an anime (number): ', (answer) => {
            const selectedIndex = parseInt(answer);
            const selectedAnime = animeList[selectedIndex - 1];

            // display episodes if the anime has a range
            const episodeRange = selectedAnime.title.match(/(\d{2}) ~ (\d{2})/);
            if (episodeRange) {
                const startEpisode = parseInt(episodeRange[1]);
                const endEpisode = parseInt(episodeRange[2]);

                console.log('Select an episode:');
                for (let i = startEpisode; i <= endEpisode; i++) {
                    console.log(`${i}. Episode ${i}`);
                }

                rl.question('Choose an episode (number): ', (episodeAnswer) => {
                    const selectedEpisode = parseInt(episodeAnswer);

                    // use the link as is (without appending episode number)
                    const episodeLink = selectedAnime.link;  // direct torrent link no episode number

                    resolve(episodeLink);  // resolve with the full link to the selected episode
                });
            } else {
                resolve(selectedAnime.link);  // if no range resolve with the full anime link
            }
        });
    });
}

function openInExternalPlayer(videoUrl) {
    // first try using mpv
    try {
        exec(`mpv --no-terminal ${videoUrl}`, (err, stdout, stderr) => {
            if (err) {
                // if mpv fails, try vlc as a fallback
                console.error(`mpv error: ${stderr}, trying VLC...`);
                exec(`vlc ${videoUrl}`, (errVlc, stdoutVlc, stderrVlc) => {
                    if (errVlc) {
                        console.error(`Error opening VLC: ${stderrVlc}`);
                    }
                });
            }
        })
    } catch (error) {
        console.log(`Neither mpv/vlc was found, try opening this link in a video player of your choice ${videoUrl}`);
    }
}
async function startApp() {
    const username = process.env.NYAA_USERNAME;
    let animeName = process.argv[2];

    while (!animeName) {
        animeName = await askQuestion("Enter anime name: ");
        if (!animeName) {
            console.log("No anime name provided. Exiting...");
            return;
        }

        const query = encodeURIComponent(animeName);
        const rssUrl = `https://nyaa.si/?page=rss&u=${username}&c=1_0&f=2&q=${query}`;

        const animeList = await searchAnime(rssUrl, animeName);
        if (animeList.length === 0) {
            console.log("No results found. Please try again.");
            animeName = null;
        } else {
            const selectedAnimeLink = await showResolutionMenu(animeList);
            console.log(`Found anime: ${selectedAnimeLink}`);
            await streamTorrent(selectedAnimeLink);

            app.listen(port, () => {});

            break;
        }
    }
}

function askQuestion(question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

startApp();


const downloadsFolder = "./downloads"
async function deleteAllFilesInDownloads() {
    try {
        const files = await fs.readdir(downloadsFolder);

        for (const file of files) {
            const filePath = path.join(downloadsFolder, file);

            if (await fs.pathExists(filePath)) {
                console.log(`Deleting file: ${filePath}`);
                await fs.remove(filePath);
            }
        }
    } catch (err) {
    }
}


process.on('exit', async () => {
    await deleteAllFilesInDownloads();
});

process.on('SIGINT', async () => {
    await deleteAllFilesInDownloads();
    process.exit();
});