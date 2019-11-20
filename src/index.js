require('dotenv').config();

const { WebClient } = require('@slack/web-api');
const HttpsProxyAgent = require('https-proxy-agent');
const db = require('./db.js');
const logger = require('./logger.js');

const token = process.env.SLACK_TOKEN;
var web;

if (process.env.http_proxy) {
    const proxy = new HttpsProxyAgent(process.env.http_proxy);
    web = new WebClient(token, { agent: proxy });
} else {
    web = new WebClient(token);
}

db.init(() => {

    (async() => {
        var res = await web.channels.list({});
        if (res.ok) {

            var limit = new Date("2019-01-01");
            logger.log(`Récupération des messages jusqu'au ${limit.toLocaleDateString()}`);

            setTimeout(function() {
                getHistory(res.channels[0].id, limit, Date.now());
            }, 1000);
        }
    })();

});

function getHistory(channel, limit, latest) {
    (async() => {
        var res = await web.channels.history({ channel: channel, latest: latest });
        if (res.ok) {
            var message;
            var date;
            var dateReach = false;
            var k = 0;
            while (!dateReach && k < res.messages.length) {
                message = res.messages[k];
                date = new Date(message.ts * 1000);
                dateReach = date.getTime() < limit.getTime();
                if (!dateReach && message.reactions != undefined) {
                    message.nbReactions = 0;
                    console.log(message.reactions);
                    for (var i = 0; i < message.reactions.length; i++) {
                        message.nbReactions += message.reactions[i].count;
                    }
                    db.insert("messages", message, (data) => {
                        var reactions = message.reactions;
                        logger.log(`extractReactions(${data.insertedId}, ${message.reactions}, 0)`);
                        extractReactions(data.insertedId, reactions, 0);
                    });
                }
                k++;
            }
            //logger.log("Emojis");
            //logger.log(JSON.stringify(emojis));
            if (date.getTime() >= limit.getTime()) {
                setTimeout(function() {
                    getHistory(channel, limit, res.messages[k - 1].ts);
                }, 1000);
            }
        }
    })();
}

function extractReactions(messageId, reactions, numReaction) {
    if (reactions != undefined && numReaction < reactions.length) {
        var reaction = reactions[numReaction];
        db.read("emojis", { name: reaction.name }, function(emoji) {
            if (emoji == null) {
                var entry = {
                    messageId: messageId,
                    name: reaction.name,
                    usage: reaction.count
                }
                db.insert("emojis", entry, () => {
                    logger.log(`extractReactions(${messageId}, ${reactions}, ${numReaction + 1})`);
                    extractReactions(messageId, reactions, numReaction + 1);
                })
            } else {
                var entry = {
                    messageId: messageId,
                    name: reaction.name,
                    usage: emoji.usage + reaction.count
                }
                db.update("emojis", { name: reaction.name }, entry, () => {
                    logger.log(`extractReactions(${messageId}, ${reactions}, ${numReaction + 1})`);
                    extractReactions(messageId, reactions, numReaction + 1);
                })
            }
        });
    }
}