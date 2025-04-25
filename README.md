# AnimeClient-CLI

AnimeClient-CLI is a command-line tool for streaming anime episodes using torrent files. It fetches torrent links from the Nyaa.si RSS feed and streams the video directly using an external media player like MPV or VLC.

## Prerequisites

Make sure you have the following installed on your system:

- [Node.js](https://nodejs.org/en/) (version 16 or higher)
- [MPV](https://mpv.io/) (optional, but recommended for streaming)
- [VLC](https://www.videolan.org/vlc/) (used as a fallback for streaming)

## Installation

To install AnimeClient-CLI, run the following commands:

```bash
git clone https://github.com/zvbtAnimeClient-CLI.git
cd AnimeClient-CLI
npm install
```

Register animeclient-cli to a gobal command
```bash
npm install -g .
```
After installation, you can start streaming by running:
```bash
animeclient "anime name"
```
![ezgif-898b0439c1c5b2](https://github.com/user-attachments/assets/9926f96f-b679-4706-bf5e-7c949bcf3793)

Note: On your first run, it will ask you to enter a Nyaa.si username from one of your favorite uploaders. The default username is "Erai-Raws" but you can change it in the config file located at ~/.config/animeclient-cli.

## Uninstall
```bash
npm uninstall -g animeclient-cli
```
