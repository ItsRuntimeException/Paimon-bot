const PREFIX = "?";
const ytdl = require('ytdl-core');
const ytpl = require('ytpl');
const YouTube = require("discord-youtube-api");
const Discord = require("discord.js");
const filestream = require("fs");
const client = new Discord.Client();
const DICE = 6;

/* native token file */
const BOT_TOKEN = readTextFile('./tokens/bot_token.txt');
const youtube = new YouTube(readTextFile('./tokens/youtube_api_key.txt')); /* Personal Youtube-API key */

/* music variables */
var servers = {};

/* bot online */
client.on("ready", () => {
    console.log("\nOne freshly baked Paimon. Now ready to serve!");
    console.log("\n\nLOGGING STARTED:\n");
});

/* initial message after getting invited to a new server */
client.on("guildCreate", guild => {
    let channelID;
    let channels = guild.channels;
    channelLoop:
        for (var c of channels) {
            let channelType = c[1].type;
            if (channelType === "text") {
                channelID = c[0];
                break channelLoop;
            }
        }
    let channel = client.channels.get(guild.systemChannelID || channelID);
    channel.send("I'm online & ready to meme!");
});

client.on("message", async message => {
    /* initialize music queue */
    if (message.guild != null) {
        if (!servers[message.guild.id]) {
            servers[message.guild.id] = {
                queue: [],
                cached_video_info: [],
                volume: 0.05,
                skipAmount: 1,
                loop: false,
                skip: false,
                local: false,
                playToggle: false,
                dispatcher: undefined,
                embedMessage: undefined
            }
        }
    }
    /* if a user mentioned the bot, reply back to the user */
    if (message.isMentioned(client.user)) {
        message.reply("If you need help from Paimon, please try ?help");
    }

    /* Ignore messages that don"t start with prefix or written by bot */
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;
    const args = message.content.slice(PREFIX.length).split(/ +/);
    const command = args.shift().toLowerCase();
    /* Voice only works in guilds, if the message does not come from a guild, then ignore it */
    if (!message.guild) return;

    /* commands & voice */
    switch (command) {
        case "help":
            userHelp(message)
            break;
        case "join":
            join(message);
            break;
        case "play":
            var server = servers[message.guild.id];
            /* string logic: */
            var search_string = args.toString().replace(/,/g,' ');
            /* VALIDATE ARG NOT undefined */
            console.log(search_string);
            /* FOUND EDGE-CASE: search_string.startsWith('?') fix -> TypeError: Cannot read property 'substr' of null */
            if (search_string == '' || search_string.startsWith('?')) {
                return message.channel.send(`${message.author}.`
                    +"\nThis command plays your specified Youtube-link or keyword searched."
                    +"\n\nUsage: " + "?play [Link | Keywords]"
                    +"\n\nLink example:\n"
                        +"\t\tyoutube.com/watch?v=oHg5SJYRHA0"
                    +"\n\nKeywords example:\n"
                        +"\t\tPekora bgm music 1 hour").then(console.log(`${message.member.user.tag} requested for a specific bot functions.`));;
            }
            /* IN-CHANNEL CHECK */
            if (!message.member.voiceChannel) {
                return message.reply("please join a voice channel first!", {files: ['./moji/PaimonCookies.gif']});
            }
            if (server.local && server.queue.length > 0) {
                return message.channel.send('Please finish local playlist first!');
            }

            /** Queue Logic
             *    0  = no song; queue then play
             *    1  = playing; queue
             *    1+ = queue
             */
            if (server.queue.length == 0) {
                server.playToggle = true;
                server.local = false;
                queueLogic(message, search_string);
            }
            else if (server.queue.length >= 1) {
                server.playToggle = false;
                server.local = false;
                queueLogic(message, search_string);
            }
            break;
        case "playlocal":
            var search_string = args.toString().replace(/,/g,' ');
            if (search_string == '' || search_string.startsWith('?')) {
                return message.channel.send(`${message.author}.`
                    +"\nThis command plays local_folder music, given a specified category."
                    +"\n\nUsage: " + "?playLocal [Category]"
                    +"\n\nCategory example:\n"
                        +"\t\tAnime | Persona3 | Persona4 | Persona5").then(console.log(`${message.member.user.tag} requested for a specific bot functions.`));;
            }

            var server = servers[message.guild.id];
            if (server.dispatcher != undefined) {
                return message.channel.send('Please wait until all local music has been finished playing OR ?Stop.');
            }
            if (!server.local && server.queue.length > 0) {
                return message.channel.send('Please finish stream playlist first!');
            }

            server.playToggle = true;
            server.local = true;
            /* https://regexr.com/ */
            if (search_string.match(/anime/gi)) {
                queueLogic(message, './anime_music/');
            }
            else if (search_string.match(/persona/gi)) {
                if (!search_string.match(/[3-5]/g)) {
                    message.channel.send('Please specify: 3|4|5');
                }
                else if (search_string.match(/3/gi))
                    queueLogic(message, './persona3_music/');
                else if (search_string.match(/4/gi))
                    queueLogic(message, './persona4_music/');
                else if (search_string.match(/5/gi))
                    queueLogic(message, './persona5_music/');
            }
            else if (search_string == undefined) {
                console.log('playLocal: User did not specify category');
                return message.channel.send('Please specify Category! (Anime, Persona, etc...)').then(newMessage => newMessage.delete(5000));
            }
            else {
                console.log('playLocal: Category does not exist!');
                return message.channel.send('Please specify Category! (Anime, Persona, etc...)').then(newMessage => newMessage.delete(5000));
            }
            break;
        case "shuffle":
            var server = servers[message.guild.id];
            console.log(`[Server: ${message.guild.id}] Queue Shuffle Requested.`);
            /* Fisher–Yates Shuffle Algorithm */
            var n = server.queue.length;
            var que_index = 1; /* currentSong playing is always at [0] -> [currentSong, 1, 2, 3, ..., n] */
            for (var i = n-1; i > que_index; i--) {
                /* random index */
                let r = rand(que_index,i);
                /* swap */
                let temp = server.queue[i];
                server.queue[i] = server.queue[r];
                server.queue[r] = temp;
                temp = server.cached_video_info[i];
                server.cached_video_info[i] = server.cached_video_info[r];
                server.cached_video_info[r] = temp;
            }
            if (n > 1) {
                console.log(server.queue);
                message.channel.send('Queue Shuffle Complete!');
                /* delete old embedMessage */
                if (server.embedMessage != undefined)
                    server.embedMessage.delete();
                queueInfo(message);
            }
            else {
                message.channel.send('There is nothing to shuffle!');
            }
            break;
        case "queue":
            queueInfo(message, args[0]);
            break;
        case "musicinfo":
            musicInfo_Lookup(message);
            break;
        case "vol":
            vol_music(message, args[0]);
            break;
        case "loop":
            loop_music(message, args[0]);
            break;
        case "pause":
            pause_music(message);
            break;
        case "resume":
            resume_music(message);
            break;
        case "skip":
            /* IN-CHANNEL CHECK */
            if (!message.member.voiceChannel) {
                return message.reply("please join a voice channel first!", {files: ['./moji/PaimonCookies.gif']});
            }
            skip_music(message, args[0]);
            break;
        case "stop":
            var server = servers[message.guild.id];
            if (server.dispatcher != undefined) {
                stop_music(message);
                message.channel.send('Music stopped.');
            }
            else {
                message.channel.send('There is nothing to stop.');
            }
            console.log('[Server: '+message.guild.id+'] [tag: ' + message.member.user.tag + ' | uid: ' + message.author + '] requested to skip music.');
            break;
        case "leave":
            leave(message);
            break;
        case "source":
            source_send(message);
            break;
        case "reset":
            resetVoice(message);
            break;
        case "roll":
            roll(message);
            break;
        case "maplestory":
            guildLink(message);
            break;
        case "valorant":
            vSens(message, args[0], args[1]);
            break;
        case "gcreate":
            create_genshin_table(message);
            break;
        case "gshowtable":
            showtable(message);
            break;
        case "gpity":
            genshin_pity_calculation(message);
            break;
        case "gwish":
            wishCount(message, args[0], args[1], args[2]);
            break;
        case "greset":
            wishReset(message, args[0]);
            break;
        default:
            /* super commands, etc... */
            if (command.match(/clean|clear/gi)) {
                if (is_superAccess(message)) {
                    return clean_messages(message, args[0]);
                }
            } else if (command.match(/shutdown|kill/gi)) {
                if (is_superAccess(message)) {
                    return emergency_food_time(message);
                }
            } else if (command.match(/add/gi)) {
                const command2 = args.shift();
                if (command2 != undefined) {
                    if (command2.match(/superaccess|super/)) {
                        if (is_superAccess(message)) {
                            return add_superAccess(message, args[0]);
                        }
                    }
                }
                else {
                    message.channel.send(`${message.author}. You didn't provide a VALID function argument!`);
                }
            } else if (command.match(/remove/gi)) {
                const command2 = args.shift();
                if (command2 != undefined) {
                    if (command2.match(/superaccess|super/)) {
                        if (is_superAccess(message)) {
                            return remove_superAccess(message, args[0]);
                        }
                    }
                }
                else {
                    message.channel.send(`${message.author}. You didn't provide a VALID function argument!`);
                }
            } else
                message.channel.send(`${message.author}. You didn't provide a VALID function argument!`);
                break;
    }
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////// HELP DISPLAY ///////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function userHelp(message) {
    console.log(`${message.member.user.tag} requested for a general list of bot functions.`);
    message.author.send({embed: {
        author: {
            name: 'Paimon-chan\'s Embedded Info',
            icon_url: client.user.avatarURL,
            url: 'https://github.com/ItsRuntimeException/SimpleDiscordBot'
        },
        title: "COMMANDS",
        description: `[Currently Hosting from ${process.cwd()}]\nMusic Support Enabled!`,
        fields: [{
            name: "?Help",
            value: "Display a general list of commands."
          },
          {
            name: "?Join|Leave",
            value: "Paimon will join/leave your voice channel!"
          },
          {
            name: "?Play [YouTube-Link|Keyword]",
            value: "1: Play audio from the user's provided link.\n2: Perform a search on the user's provided keyword."
          },
          { name: "?PlayLocal [Category]",
            value: "Play host's local audio files."
          },
          {
            name: "?Queue",
            value: "Display server's current music queue."
          },
          {
            name: "?MusicInfo",
            value: "Fetch details of current song."
          },
          {
            name: "?Pause|Resume|Skip|Stop|Loop|Shuffle",
            value: "Music Control Logic."
          },
          {
            name: "?Vol [Percent]",
            value:"Set the current music volume."
          },
          {
            name: "?Source",
            value: "Paimon's delicious sauce code~"
          },
          {
            name: "?Roll",
            value: "Random Number between 1-6."
          },
          {
            name: "?MapleStory",
            value: "MapleStory guild page."
          },
          {
            name: "?g[Create|Showtable|Pity|Wish|Reset]",
            value: "Genshin Impact's manual \'Gacha Count-Table\'."
          },
          {
            name: "?Valorant [GameCode] [Sensitivity]",
            value: "Convert other games' sensitivity ↦ Valorant's."
          }
        ],
        timestamp: new Date(),
        footer: {
            icon_url: client.user.avatarURL,
            text: '© Rich Embedded Frameworks'
        }
    }});
    message.author.send({embed: {
        author: {
            name: 'Paimon-chan\'s Embedded Info',
            icon_url: client.user.avatarURL,
            url: 'https://github.com/ItsRuntimeException/SimpleDiscordBot'
        },
        title: "SUPER ACCESS COMMANDS",
        description: `Can be used if 'SuperAccess' is granted by the owner | exisiting admin w/ 'SuperAcess'`,
        fields: [
          {
            name: "?add Super|SuperAccess [@userTag]",
            value: "Add a user as one of paimon's masters!"
          },
          {
            name: "?remove Super|SuperAccess [@userTag]",
            value: "Remove a user from one of paimon's masters!"
          },
          {
            name: "?Shutdown|Kill",
            value: "Paimon shall be served as food T^T"
          },
          {
            name: "?Clean|Clear",
            value: "Paimon will clean up your mess!"
          }
        ],
        timestamp: new Date(),
        footer: {
            icon_url: client.user.avatarURL,
            text: '© Rich Embedded Frameworks'
        }
    }});
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////// MAIN FUNCTIONS /////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
async function join(message) {
    const { voiceChannel } = message.member;
    if (!voiceChannel) {
        return message.reply("please join a voice channel first!");
    }
    else {
        message.member.voiceChannel.join();
    }
}

async function leave(message) {
    let clientVoiceConnection = message.guild.voiceConnection;
    if (clientVoiceConnection == undefined){
        message.channel.send("I'm not in a channel!", {files: ['./moji/PaimonAngry.png']});
    }
    /* valid compare */
    else if (clientVoiceConnection.channel != undefined) {
        stop_music(message);
        clientVoiceConnection.disconnect();
        message.channel.send("I have left the voice channel.");
    }
}

async function queueLogic(message, search_string) {
    var server = servers[message.guild.id];
    if (server.local) {
        let soundPath = search_string;
        /* create directory if not exist */
        if (!filestream.existsSync(soundPath)) {
            filestream.mkdirSync(soundPath);
            console.log(`New ${soundPath.replace(/\/|\./g,'')} folder created!`);
        }
        /* push files into queue -> play */
        filestream.readdir(soundPath, function (err, files) {
            if (err) {
                console.log(err);
                return;
            }
            for (var i = 0; i < files.length; i++) {
                /* push into queue if filetype matches '.mp3' format */
                if (files[i].match(/.mp3/gi))
                    server.queue.push(files[i]);
            }
            if (server.queue[0] != undefined) {
                console.log(server.queue);
                play_music(message, soundPath);
            }
            else {
                /*    USE:    https://regexr.com/ to help build a regex    */
                /*    GOAL:       get rid of './' or '/'                   */
                /*    RESULT:    ./local_music/   ----->  'local_music'    */
                console.log(`${soundPath.replace(/\/|\./g,'')} folder currently has no music files!`);
                return message.channel.send(`${soundPath.replace(/\/|\./g,'')} folder currently has no music files!`);
            }
        });
    }
    else {
        /* queue the search_string only, only fetch metadata upon playing */
        let validateURL = ytdl.validateURL(search_string);
        let validate_playlist = ytpl.validateID(search_string);
        if (!validate_playlist) {
            /* PRELOAD */
            try {
                var video = await youtube.searchVideos(search_string);
            } catch (error) {
                console.log(error);
                return message.channel.send('Something went wrong!\n\n' + error);
            }
            /* cache the video data for faster lookup */
            server.queue.push(video.url);
            server.cached_video_info.push({
                title: video.title,
                url: video.url,
                duration: sec_Convert(video.durationSeconds),
                data: video.data,
                thumbnail: video.thumbnail
            });
            console.log(server.queue);
        }
        else if (validate_playlist) {
            /* PRELOAD PLAYLIST */
            try {
                message.channel.send(`Fetching only up to 50 videos, please be patient if this takes awhile...`).then(newMessage => newMessage.delete(5000));
                var yt_playlist = await youtube.getPlaylist(search_string);
            } catch (error) {
                console.log(error);
                return message.channel.send('Something went wrong!\n\n' + error);
            }
            /* LOAD PLAYLIST VIDEOS */
            for (var i = 0; i < yt_playlist.length; i++) {
                /* PRELOAD */
                try {
                    var video = await youtube.getVideo(yt_playlist[i].url);
                } catch (error) {
                    console.log(error);
                    return message.channel.send('Something went wrong!\n\n' + error);
                }
                /* cache the video data for faster lookup */
                server.queue.push(video.url);
                server.cached_video_info.push({
                    title: video.title,
                    url: video.url,
                    duration: sec_Convert(video.durationSeconds),
                    data: video.data,
                    thumbnail: video.thumbnail
                });
            }
            console.log(server.queue);
        }
        if (server.queue.length > 1) {
            if (!validate_playlist) {
                if (!validateURL) {
                    message.channel.send(`Your query: '${search_string}' have been queued.\n`);
                }
                else if (validateURL) {
                    message.channel.send(`Your link have been queued.\n`);
                }
            }
            else if (validate_playlist) {
                message.channel.send(`Your playlist have been queued.\n`);
            }
        }
        /* 
        *  server.queue only seems to have updated inside this function instead of client.on(...), 
        *  call play_music here to avoid playing [undefined] song.
        */
        if (server.playToggle) {
            play_music(message, '');
        }
    }
}

async function play_music(message, soundPath) {
    var server = servers[message.guild.id];
    var connection = await message.member.voiceChannel.join();

    if (server.local) {
        if (server.queue[0] != undefined) {
            let song = soundPath + server.queue[0];
            let songName = server.queue[0].split('.mp3')[0];
            server.dispatcher = connection.playStream(song, {volume: server.volume});
            console.log('[Local-Mode][Server: '+message.guild.id+'] Now Playing: ' + songName);
            queueInfo(message);
        }
    }
    else {
        /* PLAY MUSIC */
        var stream = ytdl(server.queue[0], { filter: 'audioonly' });
        server.dispatcher = connection.playStream(stream, {volume: server.volume});
        console.log(`[Stream-Mode][Server: ${message.guild.id}] Now Playing: ${server.cached_video_info[0].title}\nDuration: ${server.cached_video_info[0].duration}\n`);
        queueInfo(message);
        musicInfo_Lookup(message);
    }

    server.dispatcher.on('end', function() {
        /* delete old embedMessage */
        if (server.embedMessage != undefined)
            server.embedMessage.delete();
        /* music 'end' logic */
        if (server.skip) {
            server.skip = false;
            var count = 0;
            for (var i = 0; i < server.skipAmount; i++) {
                if (server.queue.length > 0) {
                    server.queue.shift();
                    server.cached_video_info.shift();
                    count++;
                }
                else
                    break; /* stop unnecessary iteration */
            }
            console.log(`[Server: ${message.guild.id}] Skipped ${((server.queue) ? server.skipAmount : count)} songs.`);
            message.channel.send(`Skipped ${((server.queue) ? server.skipAmount : count)} songs.`);
        }
        else if (server.loop) {
            console.log('Loop Mode: ON, replaying song.');
        }
        else
            if (server.queue.length > 0) {
                server.queue.shift();
                server.cached_video_info.shift();
            }

        if (server.queue.length > 0) {
            if (server.local) {
                play_music(message, soundPath);
            }
            else {
                play_music(message, '');
            }
        }
        else if (server.queue.length == 0) {
            server.dispatcher = undefined;
            leave(message); /* leave: leave channel -> stop: server.dispatcher = undefined & flush queue */
        }
    })
}

function musicInfo_Lookup(message) {
    var server = servers[message.guild.id];
    if (!server.local) {
        var cached = server.cached_video_info;
        message.channel.send({embed: {
            author: {
                name: 'Paimon-chan\'s Embedded Info',
                icon_url: client.user.avatarURL,
                url: 'https://github.com/ItsRuntimeException/SimpleDiscordBot'
            },
            title: cached[0].title,
            url: cached[0].url,
            thumbnail: cached[0].thumbnail,
            fields:
            [{
                name: "Duration",
                value: cached[0].duration
            }],
            timestamp: new Date(),
            footer:{
                icon_url: client.user.avatarURL,
                text: '© Rich Embedded Frameworks'
            }
        }}).then(newMessage => newMessage.delete(10000));
    }
    else
        return message.channel.send('Local Music does not support Info-Lookup');
}

async function queueInfo(message, qNum = 10) {
    var server = servers[message.guild.id];
    var cached = server.cached_video_info;
    var queueString = '';
    var playString = 'None';

    /* playString */
    if (server.queue[0] != undefined) {
        if (ytdl.validateURL(server.queue[0])) /* check link validity */
            playString = cached[0].title;
        else
            playString = server.queue[0].split('.mp3')[0];
    }
    /* queueString */
    for (var i = 1; i < server.queue.length; i++) {
        if (qNum <= 25) {
            if (i <= qNum) {
                /* check link validity */
                if (ytdl.validateURL(server.queue[i]))
                    queueString += i+'.) '+cached[i].title+'\n'; /* Ex: 1. [songName]... */
                else
                    queueString += i+'.) '+server.queue[i].split('.mp3')[0]+'\n'; /* Ex: 1. [songName]... */
                
            }
            else break;
        }
        else {
            return message.channel.send('Max queue display is 20 songs!');
        }
    }
    /* send new embed */
    message.channel.send({embed: {
        author: {
            name: 'Paimon-chan\'s Embedded Info',
            icon_url: client.user.avatarURL,
            url: 'https://github.com/ItsRuntimeException/SimpleDiscordBot'
        },
        description: `[Server: ${message.guild.name}]\n\tvolume: ${(server.volume*100)}%`,
        thumbnail: ((server.local) ? undefined : cached[0].thumbnail),
        fields: [{
            name: "Now Playing:",
            value: playString
        },
        {
            name: "In the Queue:",
            value: ((server.queue.length >= 2) ? queueString : 'None')
        }
        ],
        timestamp: new Date(),
        footer: {
            icon_url: client.user.avatarURL,
            text: '© Rich Embedded Frameworks'
        }
    }}).then(newMessage => server.embedMessage = newMessage);
}

function vol_music(message, num) {
    var server = servers[message.guild.id];
    if (num == undefined) {
        console.log(`[Server: ${message.guild.id}] Current volume: ${server.volume*100}%`);
        return message.channel.send(`Current volume: ${server.volume*100}%`).then(newMessage => newMessage.delete(5000));
    }
    var percentage = parseFloat(num);
    if (isNaN(percentage)) {
        console.log(`${message.member.user.tag} requested for [Server: ${message.guild.id}] volume change, but reached INVALID number.`);
        return message.channel.send(`${message.author}. You need to supply a VALID number!`);
    }
    if (server.dispatcher != undefined) {
        /* Sets the volume relative to the input stream - i.e. 1 is normal, 0.5 is half, 2 is double. */
        server.volume = percentage / 100;
        if (server.volume <= 1) {
            server.dispatcher.setVolume(server.volume);
            console.log(`[Server: ${message.guild.id}] Volume set to ${percentage}%`);
            message.channel.send(`Volume set to ${percentage}%`).then(newMessage => newMessage.delete(5000));
        }
        else {
            console.log(`[Server: ${message.guild.id}] Cannot set volume greater than 100%`);
            message.channel.send(`Cannot set volume greater than 100%`).then(newMessage => newMessage.delete(5000));
        }
    }
    else {
        message.channel.send('Music is not playing.').then(newMessage => newMessage.delete(5000));
    }
}

function loop_music(message, switcher) {
    var server = servers[message.guild.id];
    if (switcher == undefined) {
        if (server.loop) {
            return message.channel.send('Loop Mode Status: ON').then(newMessage => newMessage.delete(5000));
        }
        else {
            return message.channel.send('Loop Mode Status: OFF').then(newMessage => newMessage.delete(5000));
        }
    }

    switcher = switcher.toLowerCase();
    switch (switcher) {
        case 'on':
            server.loop = true;
            console.log(`[Server: ${message.guild.id}] Loop Mode is turned ON`);
            message.channel.send('Loop Mode is turned ON');
            break;
        case 'off':
            server.loop = false;
            console.log(`[Server: ${message.guild.id}] Loop Mode is turned OFF`);
            message.channel.send('Loop Mode is turned OFF');
            break;
        default:
            message.channel.send('Usage: ?loop ON|OFF');
            break;
    }
}

function pause_music(message) {
    let server = servers[message.guild.id];
    if (server.dispatcher != undefined) {
        server.dispatcher.pause();
        message.channel.send('Music paused.');
    }
    else {
        message.channel.send('There is nothing to pause.');
    }
    console.log('[tag: ' + message.member.user.tag + ' | uid: ' + message.author + '] requested to pause music.');
}

function resume_music(message) {
    let server = servers[message.guild.id];
    if (server.dispatcher != undefined) {
        server.dispatcher.resume();
        message.channel.send('Music resume.');
    }
    else {
        message.channel.send('There is nothing to resume.');
    }
    console.log('[tag: ' + message.member.user.tag + ' | uid: ' + message.author + '] requested to resume music.');
}

function skip_music(message, sNum) {
    let server = servers[message.guild.id];
    server.skip = true;
    if (sNum == undefined) {
        sNum = 1;
    }
    server.skipAmount = sNum;
    if (server.dispatcher != undefined) {
        server.dispatcher.end();
    }
    else {
        message.channel.send('There is nothing to skip.');
    }
}

function stop_music(message) {
    let server = servers[message.guild.id];
    if (server.dispatcher != undefined) {
        /* clear queue */
        while (server.queue.length > 0) {
            server.queue.shift();
            server.cached_video_info.shift();
        }
        server.dispatcher.end();
    }
    /* base case: do nothing */
}

function resetVoice(message) {
    var server = servers[message.guild.id];
    /* clear server.queue & set server.dispatcher = undefined */
    while (server.queue.length > 0) {
        server.queue.shift();
        server.cached_video_info.shift();
    }
    server.dispatcher = undefined
    server.volume = 0.50;
    server.loop = false;
    server.skip = false;
    server.skipAmount = 1;

    console.log(`[Server: ${message.guild.id}] requested to reset variables!`);
    message.channel.send('Bot Reset Complete!');
}

function source_send(message) {
    var paimon = 'https://github.com/ItsRuntimeException/SimpleDiscordBot';
    message.channel.send(`Paimon's delicious source code: ${paimon}`);
    console.log(`${message.member.user.tag} requested Paimon as food!`);
}

async function clean_messages(message, numline) {
    /* Checks if the `amount` parameter is a number. If not, the command throws an error */
    if (numline == undefined) {
        /* continue */
    }
    else if (isNaN(numline))
        return message.reply('The amount parameter isn`t a number!');
    /* Checks if the `numline` integer is bigger than 100 */
    else if (numline > 99)
        return message.reply('Maximum of clearing **99 messages** at once!');
    /* Checks if the `numline` integer is smaller than 1 */
    else if (numline < 1)
        return message.reply('You must delete **at least 1 message!**');

    /* Fetching the execution command and sweep that first, catch any errors.
    *  Fetch the given number of messages to sweeps: numline+1 to include the execution command
    *  Sweep all messages that have been fetched and are not older than 14 days (due to the Discord API), catch any errors.
    */
    var bulkMessages = ((numline == undefined) ? await message.channel.fetchMessages() : await message.channel.fetchMessages( {limit: ++numline}));
    message.channel.bulkDelete(bulkMessages, true).then(console.log('message cleaning requested!'));
    servers[message.guild.id].embedMessage = undefined;
    console.log(`Cleaned ${bulkMessages.array().length-1} messages.`);
}

function emergency_food_time(message) {
    /* channel reply */
    message.channel.send('Nooooooooooo! Paimon is turning into fooooooood!', {files:['moji/PaimonLunch.jpg']})
    .then(console.log(`${message.member.user.tag} killed Paimon as food~`));
    
    /* fix error: 'Request to use token, but token was unavailable to the client' */
    setTimeout(function(err) {
        if (err) throw err;
        client.destroy();
    }, 1000);
}

function guildLink(message) {
    message.reply("I welcome you to Ensemble HQ!"
                     +`\nhttps://ensemble-hq.herokuapp.com/`)
    .then(console.log(`${message.member.user.tag} requested for MapleStory guild link.`));
}

function vSens(message, gameCode, sens) {
    if (gameCode == undefined || sens == undefined) {
        console.log(`\n    gameCode = ${gameCode}, sensitivity = ${sens}\n\n`);
        return message.channel.send(`${message.author}.`
            +"\nThis command converts your CSGO sensitivity to Valorant."
            +"\n\nUsage: " + "Valorant [GameCode] [Sensitivity]"
            +"\n\nGameCode:\n"
                +"\t\t[A]: APEX LEGEND\n"
                +"\t\t[B]: RAINBOW SIX\n"
                +"\t\t[C]: CSGO\n"
                +"\t\t[O]: OVERWATCH"
            +"\n\nSensitivity:\n"
                +"\t\t[A Decimal Number]").then(console.log(`${message.member.user.tag} requested for a specific bot functions.`));;
    }

    gameCode = gameCode.toLowerCase();
    var sensitivity = parseFloat(sens);
    /* is Not a Number */
    if (isNaN(sensitivity))
        return message.channel.send(`${message.author}. You need to supply a VALID sensitivity!`)
        .then(console.log(`${message.member.user.tag} requested for VALORANT sensitivity conversion, but reached INVALID sensitivity.`));
    else {
        var convertedSens = 0;
        var gameName = undefined;
        switch (gameCode) {
            case "a":
                convertedSens = (sensitivity / 3.18181818);
                gameName = "APEX LEGEND";
                break;
            case "b":
                convertedSens = (sensitivity * 1.2);
                gameName = "RAINBOW SIX";
                break;
            case "c":
                convertedSens = (sensitivity / 3.18181818);
                gameName = "CSGO";
                break;
            case "o":
                convertedSens = (sensitivity / 10.6);
                gameName = "OVERWATCH";
                break;
            default: 
                return message.channel.send(`${message.author}. Unsupported GameCode, cannot determine your sensitivity.`)
                .then(console.log(`${message.member.user.tag} requested for VALORANT sensitivity conversion, but reached INVALID GameCode.`));
        }

        console.log(`\n${message.member.user.tag} requested for VALORANT sensitivity conversion.`);
        console.log(`\n    Converted ${message.member.user.tag}'s game sensitivity.`);
        console.log(`    [${gameName} ↦ VALORANT] : [${sensitivity} ↦ ${convertedSens.toFixed(5)}]\n`);
        message.channel.send(`Converting your sensitivity: [ ${gameName} ↦ VALORANT ]`)
        message.channel.send(`${message.author}. Your VALORANT game sensitivity = ${convertedSens.toFixed(5)}`);
    }
}

function create_genshin_table(message) {
    var path = './json_data/genshin_wish_tables.json';
    var text = readTextFile(path);
    var array_Obj = JSON.parse(text);

    var new_userdata = {
        uid: message.author.id,
        username: message.member.user.tag,
        bannerTypes: { event:0, weapon:0, standard:0 }
    };

    if (objLength(array_Obj.users) == 0) {
        array_Obj.users.push(new_userdata);
    }
    if (objLength(array_Obj.users) > 0) {
        /* this is inefficient if the # of users gets too large, would be nice to convert it into a database to filter duplicates. */
        for (var i = 0; i < objLength(array_Obj.users); i++) {
            /* this user table already exist. */
            if (array_Obj.users[i].uid === message.author.id) {
                /* check if this user has recently changed his/her userTag. */
                update_genshin_userTag(array_Obj, i);
                /* terminal logging */
                console.log('Genshin Gacha Table for user: [tag: ' + message.member.user.tag + ' | uid: ' + message.author + '] already EXIST!');
                /* channel reply */
                message.channel.send(`${message.author}. Your Genshin Gacha Table aready exist!`);
                return;
            }
        }
        /* if this user does does not have an existing table, create a default table for this user. */
        array_Obj.users.push(new_userdata);
    }

    /* update JSON Data */
    setTimeout(function(err) {
        if (err) throw err;
        save_as_JSON(array_Obj, path);
    }, 1000);

    /* display message */
    console.log('Finished creating Genshin Gacha Table for user: [tag: ' + message.member.user.tag + ' | uid: ' + message.author + '].');
    console.log(new_userdata);
    message.channel.send(`${message.author}. Your Genshin Gacha Table has been created!`);
}

function showtable(message) {
    var text = readTextFile('./json_data/genshin_wish_tables.json');
    var array_Obj = JSON.parse(text);
    for (var i = 0; i < objLength(array_Obj.users); i++) {
        if (array_Obj.users[i].uid === message.author.id) {
	        message.channel.send(`${message.author}. Your Genshin Gacha Table is being fetched...`);
            /* check if this user has recently changed his/her userTag. */
            update_genshin_userTag(array_Obj, i);
            /* terminal logging */
            console.log('Genshin Gacha Table for user: [tag: ' + message.member.user.tag + ' | uid: ' + message.author + '] requested!');
            console.log(array_Obj.users[i]);
            /* channel reply */
            var bannerObj = array_Obj.users[i].bannerTypes;
            return message.channel.send({embed: {
                    author: {
                        name: message.member.user.tag,
                        icon_url: message.member.user.avatarURL,
                    },
                    fields: [{
                        name: "Character Event Banner",
                        value: `Currently at: ${bannerObj.event} ${((bannerObj.event > 1) ? 'wishes' : 'wish')}`
                    },
                    {
                        name: "Weapon Banner",
                        value: `Currently at: ${bannerObj.weapon} ${((bannerObj.weapon > 1) ? 'wishes' : 'wish')}`
                    },
                    {
                        name: "Standard Permanent Banner",
                        value: `Currently at: ${bannerObj.standard} ${((bannerObj.standard > 1) ? 'wishes' : 'wish')}`
                    }
                    ],
                    timestamp: new Date(),
                    footer: {
                        icon_url: client.user.avatarURL,
                        text: '© Rich Embedded Frameworks'
                    }
            }});
        }
    }
    /* this user table already exist. */
    message.channel.send(`${message.author}. Please initialize your Genshin Gacha Table by using the '${PREFIX}gcreate' function!`);
}

function genshin_pity_calculation(message) {
    var text = readTextFile('./json_data/genshin_wish_tables.json');
    var array_Obj = JSON.parse(text);
    for (var i = 0; i < objLength(array_Obj.users); i++) {
        if (array_Obj.users[i].uid === message.author.id) {
	    message.channel.send(`${message.author}. Calculating your 5-star pity point...`);
            /* check if this user has recently changed his/her userTag. */
            update_genshin_userTag(array_Obj, i);
            /* terminal logging */
            console.log('Genshin Pity Table for user: [tag: ' + message.member.user.tag + ' | uid: ' + message.author + '] requested!');
            console.log('Pity Calculation: ');
            const normal_pity_goal = 90;
            const soft_pity_goal = normal_pity_goal - 15;
            const weapon_pity_goal = normal_pity_goal - 10;
            const primogem_value = 160;
            let hard_pity_table = {
                event: normal_pity_goal - array_Obj.users[i].bannerTypes.event, 
                weapon: weapon_pity_goal - array_Obj.users[i].bannerTypes.weapon, 
                standard: normal_pity_goal - array_Obj.users[i].bannerTypes.standard
            }
            let soft_pity_table = {
                event: soft_pity_goal - array_Obj.users[i].bannerTypes.event, 
                weapon: soft_pity_goal - array_Obj.users[i].bannerTypes.weapon, 
                standard: soft_pity_goal - array_Obj.users[i].bannerTypes.standard
            }
            /* channel reply */
            console.log(pity_table);
            console.log('\n');
            return message.channel.send({embed: {
                author: {
                    name: message.member.user.tag,
                    icon_url: message.member.user.avatarURL,
                },
                fields: [{
                    name: "Character Event Banner",
                    value: `${hard_pity_table.event} ${((hard_pity_table.event > 1) ? 'wishes' : 'wish')} until hard-pity(90) goal.\n(${hard_pity_table.event*primogem_value} primo-gems)

                    ${soft_pity_table.event} ${((soft_pity_table.event > 1) ? 'wishes' : 'wish')} until soft-pity(75) goal.\n(${soft_pity_table.event*primogem_value} primo-gems)`
                  },
                  {
                    name: "Weapon Banner",
                    value: `${hard_pity_table.weapon} ${((hard_pity_table.weapon > 1) ? 'wishes' : 'wish')} until hard-pity(90) goal.\n(${hard_pity_table.weapon*primogem_value} primo-gems)

                    ${soft_pity_table.weapon} ${((soft_pity_table.weapon > 1) ? 'wishes' : 'wish')} until soft-pity(75) goal.\n(${soft_pity_table.weapon*primogem_value} primo-gems)`
                  },
                  {
                    name: "Standard Permanent Banner",
                    value: `${hard_pity_table.standard} ${((hard_pity_table.standard > 1) ? 'wishes' : 'wish')} until hard-pity(90) goal.\n(${hard_pity_table.standard*primogem_value} primo-gems)
                    
                    ${soft_pity_table.standard} ${((soft_pity_table.standard > 1) ? 'wishes' : 'wish')} until soft-pity(75) goal.\n(${soft_pity_table.standard*primogem_value} primo-gems)`
                  }
                ],
                timestamp: new Date(),
                footer: {
                    icon_url: client.user.avatarURL,
                    text: '© Rich Embedded Frameworks'
                }
            }});
        }
    }
    /* this user table already exist. */
    message.channel.send(`${message.author}. Please initialize your Genshin Gacha Table by using the '${PREFIX}gcreate' function!`);
}

function wishCount(message, bannerType, commandType, nInc) {
    if (bannerType == undefined || commandType == undefined || nInc == undefined) {
        console.log(`\n    bannerType = ${bannerType}, commandType = ${commandType}, nInc = ${nInc}\n\n`);
        return message.channel.send(`${message.author}.`
            +"\nThis command adds the number of rolls to your current Genshin Gacha Table."
            +"\n\nUsage: " + "gwish [BannerType] [CommandType] [Number]"
            +"\n\nBannerType:\n"
                +"\t\t[Event]: Character Event Banner\n"
                +"\t\t[Weapon]: Weapon Banner\n"
                +"\t\t[Standard]: Standard Permanent Banner"
            +"\n\nCommandType:\n"
                +"\t\t[Add]: Add to the existing count\n"
                +"\t\t[Replace]: Replace the existing count"
            +"\n\nNumber:\n"
                +"\t\t[Integer]").then(console.log(`${message.member.user.tag} requested for a specific bot functions.`));
    }

    bannerType = bannerType.toLowerCase();
    commandType = commandType.toLowerCase();
    var roll_count = parseInt(nInc);
    /* is Not a Number */
    if (isNaN(roll_count))
    {
        return message.channel.send(`${message.author}. You need to supply a VALID count!`)
        .then(console.log(`${message.member.user.tag} requested for Genshin Wish Count, but reached INVALID count.`));
    }
    else {
        /* find user */
        var path = './json_data/genshin_wish_tables.json';
        var text = readTextFile(path);
        var array_Obj = JSON.parse(text);
        for (var i = 0; i < objLength(array_Obj.users); i++) {
            if (array_Obj.users[i].uid === message.author.id) {
                /* check if this user has recently changed his/her userTag. */
                update_genshin_userTag(array_Obj, i);
                /* terminal logging */
                console.log('Genshin Gacha Table for user: [tag: ' + message.member.user.tag + ' | uid: ' + message.author + '] requested!');
                break;
            }
        }
        if (i == objLength(array_Obj.users)) {
            /* this user table already exist. */
            return message.channel.send(`${message.author}. Please initialize your Genshin Gacha Table by using the '${PREFIX}gcreate' function`);
        }

        /* edit GGachaTable */
        if ( !(commandType === "add" || commandType === "replace") ) {
            return message.channel.send(`${message.author}. Unsupported CommandType, cannot edit your gacha data.`)
            .then(console.log(`${message.member.user.tag} requested for Genshin Wish Count, but reached INVALID commandType.`));
        }
        if (commandType === "add") {
            switch (bannerType) {
                case "event":
                    array_Obj.users[i].bannerTypes.event += roll_count;
                    break;
                case "weapon":
                    array_Obj.users[i].bannerTypes.weapon += roll_count;
                    break;
                case "standard":
                    array_Obj.users[i].bannerTypes.standard += roll_count;
                    break;
                default: 
                    console.log(`${message.member.user.tag} requested for Genshin Wish Count, but reached INVALID bannerType.`);
                    message.channel.send(`${message.author}. Unsupported BannerType, cannot determine your gacha data.`);
            }
        }
        if (commandType === "replace") {
            switch (bannerType) {
                case "event":
                    array_Obj.users[i].bannerTypes.event = roll_count;
                    break;
                case "weapon":
                    array_Obj.users[i].bannerTypes.weapon = roll_count;
                    break;
                case "standard":
                    array_Obj.users[i].bannerTypes.standard = roll_count;
                    break;
                default: 
                    console.log(`${message.member.user.tag} requested for Genshin Wish Count, but reached INVALID bannerType.`);
                    return message.channel.send(`${message.author}. Unsupported BannerType, cannot determine your gacha data.`);
            }
        }

        /* save data back to json */
        setTimeout(function(err) {
            if (err) throw err;
            save_as_JSON(array_Obj, path);
        }, 1000);
        
        /* display message */
        console.log('Genshin Gacha Table for user: [tag: ' + message.member.user.tag + ' | uid: ' + message.author + '] updated!');
        console.log(array_Obj.users[i]);
        message.channel.send(`${message.author}. Your Genshin Gacha Table has been updated!`);
        var bannerObj = array_Obj.users[i].bannerTypes;
        return message.channel.send({embed: {
            author: {
                name: message.member.user.tag,
                icon_url: message.member.user.avatarURL,
            },
            fields: [{
                name: "Character Event Banner",
                value: `Currently at: ${bannerObj.event} ${((bannerObj.event > 1) ? 'wishes' : 'wish')}`
            },
            {
                name: "Weapon Banner",
                value: `Currently at: ${bannerObj.weapon} ${((bannerObj.weapon > 1) ? 'wishes' : 'wish')}`
            },
            {
                name: "Standard Permanent Banner",
                value: `Currently at: ${bannerObj.standard} ${((bannerObj.standard > 1) ? 'wishes' : 'wish')}`
            }
            ],
            timestamp: new Date(),
            footer: {
                icon_url: client.user.avatarURL,
                text: '© Rich Embedded Frameworks'
            }
        }}).then(newMessage => newMessage.delete(5000));
    }
}

function wishReset(message, bannerType) {
    if (bannerType == undefined) {
        console.log(`\n    bannerType = ${bannerType}\n\n`);
        return message.channel.send(`${message.author}.`
            +"\nThis command resets the specified Genshin Gacha BannerType back to 0."
            +"\n\nUsage: " + "gReset [BannerType]"
            +"\n\nBannerType:\n"
                +"\t\t[Event]: Character Event Banner\n"
                +"\t\t[Weapon]: Weapon Banner\n"
                +"\t\t[Standard]: Standard Permanent Banner")
                .then(console.log(`${message.member.user.tag} requested for a specific bot functions.`));
    }

    /* find user */
    var path = './json_data/genshin_wish_tables.json';
    var text = readTextFile(path);
    var array_Obj = JSON.parse(text);
    for (var i = 0; i < objLength(array_Obj.users); i++) {
        if (array_Obj.users[i].uid === message.author.id) {
            /* check if this user has recently changed his/her userTag. */
            update_genshin_userTag(array_Obj, i);
            /* terminal logging */
            console.log('Genshin Gacha Table for user: [tag: ' + message.member.user.tag + ' | uid: ' + message.author + '] requested!');
            break;
        }
    }
    if (i == objLength(array_Obj.users)) {
        /* this user table already exist. */
        return message.channel.send(`${message.author}. Please initialize your Genshin Gacha Table by using the '${PREFIX}gcreate' function`);
    }
    
    bannerType = bannerType.toLowerCase();
    var bannerString = "";
    switch (bannerType) {
        case "event":
            bannerString = "Character Event Banner";
            array_Obj.users[i].bannerTypes.event = 0;
            break;
        case "weapon":
            bannerString = "Weapon Banner";
            array_Obj.users[i].bannerTypes.weapon = 0;
            break;
        case "standard":
            bannerString = "Standard Wish Banner";
            array_Obj.users[i].bannerTypes.standard = 0;
            break;
        default: 
            return message.channel.send(`${message.author}. Unsupported BannerType, cannot reset your gacha data.`)
            .then(console.log(`${message.member.user.tag} requested for Genshin Wish Count, but reached INVALID bannerType.`));
    }

    /* save data back to json */
    setTimeout(function(err) {
        if (err) throw err;
        save_as_JSON(array_Obj, path);
    }, 1000);

    /* display message */
    console.log('Genshin Gacha Table for user: [tag: ' + message.member.user.tag + ' | uid: ' + message.author + '] updated!');
    console.log(array_Obj.users[i]);
    message.channel.send(`${message.author}. Your GGT:${bannerString} has been reset...`);
    var bannerObj = array_Obj.users[i].bannerTypes;
    return message.channel.send({embed: {
        author: {
            name: message.member.user.tag,
            icon_url: message.member.user.avatarURL,
        },
        fields: [{
            name: "Character Event Banner",
            value: `Currently at: ${bannerObj.event} ${((bannerObj.event > 1) ? 'wishes' : 'wish')}`
        },
        {
            name: "Weapon Banner",
            value: `Currently at: ${bannerObj.weapon} ${((bannerObj.weapon > 1) ? 'wishes' : 'wish')}`
        },
        {
            name: "Standard Permanent Banner",
            value: `Currently at: ${bannerObj.standard} ${((bannerObj.standard > 1) ? 'wishes' : 'wish')}`
        }
        ],
        timestamp: new Date(),
        footer: {
            icon_url: client.user.avatarURL,
            text: '© Rich Embedded Frameworks'
        }
    }}).then(newMessage => newMessage.delete(5000));
}

function add_superAccess(message, userTag) {
    if (userTag == undefined) {
        return message.channel.send(`${message.author}.`
        +"\nThis command will let [@userTag] use SuperAccess-commands."
        +"\n\nUsage: " + "?add super|superAccess [@userTag]")
        .then(console.log(`${message.member.user.tag} requested for a specific bot functions.`));
    }
    /* userTag uses <@!user#tag> */
    if (userTag.startsWith('<@!') && userTag.endsWith('>')) {
        userTag = userTag.replace(/[<@!>]/g,'');
    }

    /* Check adminship, then push user_id as admin */
    var this_guild = client.guilds.get(message.guild.id);
    var guildmember = this_guild.member(userTag);
    if (guildmember != null) {
        var path = './json_data/admins.json';
        var servers_Obj = JSON.parse(readTextFile(path));
        var index = -1;

        /* find object index */
        if (servers_Obj.servers.some(item => item.server_id === message.guild.id)) {
            /* try to find if this server is already in the json data */
            var filter_Obj = servers_Obj.servers.find(
                function(item, i) {
                    index = i;
                    return item.server_id === message.guild.id;
                });
        }
        
        /* Check if this server already has this user as admin, if not then add it */
        if (!filter_Obj.admins.includes(userTag)) {
            if (guildmember.user.bot) {
                console.log(`${message.author.tag} tried to grant 'SuperAccess' permission to a bot!`)
                return message.channel.send(`Bots don't need 'SuperAccess'!`);
            }
            servers_Obj.servers[index].admins.push(userTag);
            servers_Obj.servers[index].admins.sort();
            /* update JSON Data */
            setTimeout(function(err) {
                if (err) throw err;
                save_as_JSON(servers_Obj, path);
            }, 1000);
            /* grant admin role to user */
            var admin_role = this_guild.roles.find(role => role.name.match(/admin|Admin/g));
            guildmember.addRole(admin_role);
            /* reply */
            message.channel.send('Admin successfully added!');
            console.log(`Admin successfully added! ${guildmember.user} now have access to SuperAccess-commands!`);
            guildmember.user.send({embed: {
                author: {
                    name: 'Paimon-chan\'s Embedded Info',
                    icon_url: client.user.avatarURL,
                    url: 'https://github.com/ItsRuntimeException/SimpleDiscordBot'
                },
                title: "SUPER ACCESS COMMANDS",
                description: `${message.author.tag} has granted you 'SuperAccess'.\n${guildmember.user}, You can now use SuperAccess-commands!`,
                fields: [
                  {
                    name: "?add Super|SuperAccess",
                    value: "Add a person as one of paimon's masters!"
                  },
                  {
                    name: "?Shutdown|Kill",
                    value: "Paimon shall be served as food T^T"
                  },
                  {
                    name: "?Clean|Clear",
                    value: "Paimon will clean up your mess!"
                  }
                ],
                timestamp: new Date(),
                footer: {
                    icon_url: client.user.avatarURL,
                    text: '© Rich Embedded Frameworks'
                }
            }});
        }
        else {
            message.channel.send('Admin already exist!');
        }
    }
    else {
        message.channel.send(`No such user in [Server: ${this_guild.name}].`);
    }
}

function remove_superAccess(message, userTag) {
    if (userTag == undefined) {
        return message.channel.send(`${message.author}.`
        +"\nThis command will remove [@userTag] from SuperAccess-commands."
        +"\n\nUsage: " + "?remove super|superAccess [@userTag]")
        .then(console.log(`${message.member.user.tag} requested for a specific bot functions.`));
    }
    /* userTag uses <@!user#tag> */
    if (userTag.startsWith('<@!') && userTag.endsWith('>')) {
        userTag = userTag.replace(/[<@!>]/g,'');
    }

    /* Check adminship, then push user_id as admin */
    var this_guild = client.guilds.get(message.guild.id);
    var guildmember = this_guild.member(userTag);
    if (guildmember != null) {
        var path = './json_data/admins.json';
        var servers_Obj = JSON.parse(readTextFile(path));
        var index = -1;

        /* find object index */
        if (servers_Obj.servers.some(item => item.server_id === message.guild.id)) {
            /* try to find if this server is already in the json data */
            var filter_Obj = servers_Obj.servers.find(
                function(item, i) {
                    index = i;
                    return item.server_id === message.guild.id;
                });
        }
        
        /* Check if this server already has this user as admin, if found then remove it */
        if (filter_Obj.admins.includes(userTag)) {
            /* exceptions */
            if (guildmember.user.bot) {
                console.log(`${message.author.tag} tried to grant 'SuperAccess' permission to a bot!`);
                return message.channel.send(`Bots don't need 'SuperAccess'!`);
            }
            if (guildmember.user.id === message.author.id) {
                console.log(`You cannot remove 'SuperAccess' from yourself!`);
                return message.channel.send(`You cannot remove 'SuperAccess' from yourself!`);
            }
            if (guildmember.user.id === this_guild.ownerID) {
                console.log(`${message.author.tag} tried to remove 'SuperAccess' permission from server admin!`);
                return message.channel.send(`You cannot remove 'SuperAccess' from [Server Admin: ${this_guild.owner}]!`);
            }
            /* remove from 'SuperAccess' */
            let temp_index = servers_Obj.servers[index].admins.indexOf(userTag);
            servers_Obj.servers[index].admins.splice(temp_index, 1);
            /* update JSON Data */
            setTimeout(function(err) {
                if (err) throw err;
                save_as_JSON(servers_Obj, path);
            }, 1000);
            /* grant admin role to user */
            var admin_role = this_guild.roles.find(role => role.name.match(/admin|Admin/g));
            try {
                guildmember.removeRole(admin_role);
            } catch (error) {
                console.log(error);
            }
            /* reply */
            message.channel.send('Admin successfully removed!');
            console.log(`Admin successfully removed! ${guildmember.user} no longer has access to SuperAccess-commands!`);
        }
        else {
            message.channel.send(`This user does not have 'SuperAccess' permission!`);
        }
    }
    else {
        message.channel.send(`No such user in [Server: ${this_guild.name}].`);
    }
}
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////// HELPER FUNCTIONS ////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function is_superAccess(message) {
    var moji_array = ['moji/PaimonAngry.png', 'moji/PaimonNani.png', 'moji/PaimonCookies.gif', 'moji/PaimonLunch.jpg', 'moji/PaimonNoms.gif', 'moji/PaimonSqueezy.jpg', 'moji/PaimonThonks.jpg'];
    var rand = Math.floor(Math.random() * Math.floor(objLength(moji_array)));
    var servers_Obj = undefined;
    /* create file if not exist */
    var path = './json_data/admins.json';
    if (!filestream.existsSync(path)) {
        servers_Obj = {
            servers: [
                {
                    server_id : message.guild.id,
                    admins: []
                }
            ]
        };
        /* update JSON Data */
        setTimeout(function(err) {
            if (err) throw err;
            save_as_JSON(servers_Obj, path);
        }, 1000);
        console.log(`New ${path.replace(/\/|\./g,'')} json-file created!`);
    }
    /** 
    *  Object Overview:
    *  servers_Obj = { server[ a list of specific guild objects -> {server_id, admin_arr: [a list of admin_id]} ] }
    */
    var filter_Obj = undefined;
    servers_Obj = JSON.parse(readTextFile(path));
    var index = -1;
    if (servers_Obj.servers.some(item => item.server_id === message.guild.id)) {
        /* try to find if this server is already in the json data */
        filter_Obj = servers_Obj.servers.find(
            function(item, i) {
                index = i;
                return item.server_id === message.guild.id;
            });
    }
    else {
        /* if not found, create one */
        filter_Obj = {
            server_id : message.guild.id,
            admins: []
        };
        /* index = servers_Obj.servers.length()-1; */
        servers_Obj.servers.push(filter_Obj);
        index += objLength(servers_Obj.servers);
    }
    /* check for adminship */
    if (!servers_Obj.servers[index].admins.includes(message.author.id)) {
        console.log('[tag: ' + message.member.user.tag + ' | uid: ' + message.author + '] tried to access an admin command.');
        message.channel.send(`${message.author}. Only Paimon's masters may access this command! `, {files: [ moji_array[rand] ]});
        return false;
    }
    return true;
}

function objLength(obj) {
    return Object.keys(obj).length;
}

function rand(min, max) {
    return min + Math.floor(Math.random()*max);
}

function roll(message) {
    var diceNum1 = rand(1, DICE);
    var diceNum2 = rand(1, DICE);
    message.channel.send(`${message.author}. You rolled (${diceNum1}, ${diceNum2}) on a pair of dice.\nTotal: ${diceNum1+diceNum2}`)
    .then(console.log(`${message.member.user.tag} rolled (${diceNum1}, ${diceNum2}) on a pair of dice. Total: ${diceNum1+diceNum2}`));
}

function readTextFile(filepath)
{
    var text = filestream.readFileSync(filepath).toString('utf-8');
    return text;
}

function save_as_JSON(JSON_Obj, path) {
    /* save data back to json */
    var tableString = JSON.stringify(JSON_Obj, undefined, 2);
    filestream.writeFile(path, tableString, 'utf-8', function(err) {
        if (err) throw err;
    });
}

function sec_Convert(sec_string) {
    /* time variable decl */
    var seconds = Math.floor(parseInt(sec_string));
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);

    /* re-factor minutes and seconds */
    for (var i = 0; i < hours; i++) {
        minutes -= 60;
        seconds -= 3600;
    }
    for (var i = 0; i < minutes; i++) {
        seconds -= 60;
    }

    /* string variable */
    var time_string = `${seconds} secs`;
    if (minutes > 0)
        time_string = `${minutes} mins : ` + time_string;
    if (hours > 0) {
        time_string = `${hours} hrs : ` + time_string;
    }
    return time_string;
}

function update_genshin_userTag(array_Obj, cached_index) {
    var path = './json_data/genshin_wish_tables.json';
    var uniqueID = array_Obj.users[cached_index].uid;
    var current_userTag = client.users.get(uniqueID).tag;
    var cached_userTag = array_Obj.users[cached_index].username;

    if (cached_userTag !== current_userTag) {
        array_Obj.users[cached_index].username = current_userTag;
    }
    /* update JSON Data */
    setTimeout(function(err) {
        if (err) throw err;
        save_as_JSON(array_Obj, path);
    }, 1000);
}

client.login(BOT_TOKEN);