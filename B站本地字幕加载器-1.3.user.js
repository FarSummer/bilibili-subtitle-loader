// ==UserScript==
// @name         B站本地字幕加载器
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  在B站视频页面加载本地ASS/SRT字幕文件
// @author       FarSummer
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/bangumi/play/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let subtitleOverlay = null;
    let syncHandler = null;

    function createSubtitleOverlay() {
        const existing = document.getElementById('my-subtitle-overlay');
        if (existing) {
            existing.style.display = 'none';
            return existing;
        }

        const overlay = document.createElement('div');
        overlay.id = 'my-subtitle-overlay';
        overlay.style.cssText = `
            position: absolute;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            color: #ffffff;
            font-size: 32px;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.9);
            background: rgba(0,0,0,0.6);
            padding: 6px 18px;
            border-radius: 4px;
            text-align: center;
            pointer-events: none;
            z-index: 99999;
            max-width: 80%;
            white-space: pre-wrap;
            word-break: break-word;
            display: none;
            font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
        `;

        const containers = [
            '.bpx-player-video-wrap',
            '.video-player',
            '#bilibili-player'
        ];

        let playerContainer = null;
        for (const sel of containers) {
            const el = document.querySelector(sel);
            if (el) {
                playerContainer = el;
                break;
            }
        }

        if (!playerContainer) {
            const video = document.querySelector('video');
            if (video && video.parentElement) {
                playerContainer = video.parentElement;
            }
        }

        if (playerContainer) {
            const computed = window.getComputedStyle(playerContainer);
            if (computed.position === 'static') {
                playerContainer.style.position = 'relative';
            }
            playerContainer.appendChild(overlay);
            return overlay;
        }

        document.body.appendChild(overlay);
        return overlay;
    }

    function timeToSeconds(timeStr) {
        const parts = timeStr.replace(',', '.').split(':');
        if (parts.length === 3) {
            return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        }
        return 0;
    }

    function parseASS(content) {
        const subtitles = [];
        const lines = content.split(/\r?\n/);

        for (const line of lines) {
            const match = line.match(/Dialogue:\s*\d+,(\d+:\d+:\d+\.\d+),(\d+:\d+:\d+\.\d+),[^,]*,[^,]*,\d+,\d+,\d+,,(.+)/);
            if (match) {
                const start = timeToSeconds(match[1]);
                const end = timeToSeconds(match[2]);
                const text = match[3].trim();
                if (text) {
                    subtitles.push({ start, end, text });
                }
            }
        }

        return subtitles;
    }

    function parseSRT(content) {
        const lines = content.split(/\r?\n/);
        const subtitles = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i].trim();
            if (line === '') {
                i++;
                continue;
            }

            if (/^\d+$/.test(line)) {
                i++;
            }

            if (i < lines.length && lines[i].includes('-->')) {
                const timeLine = lines[i];
                const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
                if (timeMatch) {
                    const start = timeToSeconds(timeMatch[1]);
                    const end = timeToSeconds(timeMatch[2]);
                    i++;

                    let text = '';
                    while (i < lines.length && lines[i].trim() !== '') {
                        text += lines[i].trim() + '\n';
                        i++;
                    }
                    text = text.trim();

                    if (text) {
                        subtitles.push({ start, end, text });
                    }
                }
            }
            i++;
        }

        return subtitles;
    }

    function setupSubtitleSync(video, subtitles) {
        if (syncHandler) {
            video.removeEventListener('timeupdate', syncHandler);
        }

        const overlay = document.getElementById('my-subtitle-overlay');
        if (!overlay) return;

        syncHandler = function() {
            const currentTime = this.currentTime;
            let found = false;

            for (const sub of subtitles) {
                if (currentTime >= sub.start && currentTime <= sub.end) {
                    overlay.textContent = sub.text;
                    overlay.style.display = 'block';
                    found = true;
                    break;
                }
            }

            if (!found) {
                overlay.style.display = 'none';
            }
        };

        video.addEventListener('timeupdate', syncHandler);
    }

    async function loadSubtitleFile() {
        try {
            if (window.showOpenFilePicker) {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{
                        description: '字幕文件',
                        accept: { 'text/plain': ['.srt', '.ass', '.vtt'] }
                    }]
                });
                const file = await fileHandle.getFile();
                return await file.text();
            } else {
                return new Promise((resolve, reject) => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.srt,.ass,.vtt';
                    input.style.display = 'none';
                    input.onchange = function(e) {
                        const file = e.target.files[0];
                        if (!file) {
                            reject('未选择文件');
                            return;
                        }
                        const reader = new FileReader();
                        reader.onload = function(ev) {
                            resolve(ev.target.result);
                        };
                        reader.onerror = function() {
                            reject('读取文件失败');
                        };
                        reader.readAsText(file, 'UTF-8');
                        document.body.removeChild(input);
                    };
                    document.body.appendChild(input);
                    input.click();
                });
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error(err);
            }
            return null;
        }
    }

    function createButton() {
        if (document.getElementById('my_bt')) return;

        const btn = document.createElement('button');
        btn.id = 'my_bt';
        btn.textContent = '加载字幕';

        const complaint = document.querySelector('.video-complaint');

        if (complaint && complaint.parentElement) {
            btn.style.cssText = `
                background: #fb7299 !important;
                color: #ffffff !important;
                border: none !important;
                border-radius: 4px !important;
                padding: 4px 14px !important;
                margin-left: 20px;
                cursor: pointer;
                font-size: 13px !important;
                line-height: 28px !important;
                height: 28px !important;
                font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
                transition: background 0.2s;
                white-space: nowrap;
                box-shadow: 0 2px 6px rgba(251, 114, 153, 0.4);
                -webkit-appearance: none;
                appearance: none;
            `;
            btn.onmouseover = function() { this.style.setProperty('background', '#fc8aad', 'important'); };
            btn.onmouseout  = function() { this.style.setProperty('background', '#fb7299', 'important'); };

            complaint.parentElement.appendChild(btn);
            console.log('按钮已插入到稿件举报右侧');
        } else {
            btn.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 999999;
                background: #fb7299 !important;
                color: #ffffff !important;
                border: none !important;
                border-radius: 6px !important;
                padding: 8px 16px !important;
                cursor: pointer;
                font-size: 14px !important;
                font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;
            document.body.appendChild(btn);
            console.log('未找到稿件举报按钮，按钮已添加到页面右上角（fallback）');
        }

        btn.onclick = async function() {
            const content = await loadSubtitleFile();
            if (!content) return;

            let subtitles = parseASS(content);
            if (subtitles.length === 0) {
                subtitles = parseSRT(content);
            }
            if (subtitles.length === 0) {
                alert('未能解析出有效的字幕内容，请确认是ASS或SRT格式');
                return;
            }

            if (!subtitleOverlay) {
                subtitleOverlay = createSubtitleOverlay();
            }

            const video = document.querySelector('video');
            if (video) {
                if (syncHandler) {
                    video.removeEventListener('timeupdate', syncHandler);
                }
                setupSubtitleSync(video, subtitles);
                console.log('字幕加载成功，共 ' + subtitles.length + ' 条');
            } else {
                alert('未找到视频元素');
            }
        };
    }

    function init() {
        createButton();
    }

    if (document.readyState === 'complete') {
        setTimeout(init, 1000);
    } else {
        window.addEventListener('load', function() {
            setTimeout(init, 1500);
        });
    }

})();