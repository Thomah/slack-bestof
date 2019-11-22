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
            extractMessages(res.messages, limit, 0, () => {
                setTimeout(function() {
                    getHistory(channel, limit, res.messages[messages.length - 1].ts);
                }, 1000);
            });
        }
    })();
}

function extractMessages(messages, limit, index, callback) {
    if (index < messages.length) {
        message = messages[index];
        var date = new Date(message.ts * 1000);
        var dateReach = false;
        dateReach = date.getTime() < limit.getTime();
        if (!dateReach && message.reactions != undefined) {
            logger.log("Date limite non atteinte et réactions présentes");
            message.nbReactions = 0;
            for (var i = 0; i < message.reactions.length; i++) {
                message.nbReactions += message.reactions[i].count;
            }
            db.insert("messages", message, (data) => {
                var reactions = message.reactions;
                extractReactions(data.insertedId, reactions, 0, () => {
                    extractMessages(messages, limit, index + 1, callback);
                });
            });
        } else if (!dateReach) {
            logger.log("Date limite non atteinte");
            extractMessages(messages, limit, index + 1, callback);
        }
    } else {
        logger.log("Fin des messages de la liste");
        callback();
    }
}

function extractReactions(messageId, reactions, numReaction, callback) {
    logger.log(`Extraction des réactions : ${messageId} : ${numReaction} / ${reactions.length}`);
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
                    extractReactions(messageId, reactions, numReaction + 1, callback);
                })
            } else {
                var entry = {
                    messageId: messageId,
                    name: reaction.name,
                    usage: emoji.usage + reaction.count
                }
                db.update("emojis", { name: reaction.name }, entry, () => {
                    extractReactions(messageId, reactions, numReaction + 1, callback);
                })
            }
        });
    } else {
        callback();
    }
}