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
        var res = await web.conversations.list({});
        if (res.ok) {

            var limit = new Date("2019-01-01");
            logger.log(`Récupération des messages jusqu'au ${limit.toLocaleDateString()}`);

            getAllChannelsHistory(res.channels, 0, limit);

        }
    })();

});

function getAllChannelsHistory(channels, index, limit) {
    if(index < channels.length) {
        logger.log(`Traitement du channel ${channels[index].name}`);
        setTimeout(function() {
            getHistory(channels, index, limit, Date.now());
        }, 1000);
    } else {
        logger.log("Fin de récupération des messages");
    }
}

function getHistory(channels, index, limit, latest) {
    (async() => {
        var res = await web.conversations.history({ channel: channels[index].id, latest: latest });
        if (res.ok) {
            extractMessages(channels, index, res.messages, limit, 0);
        }
    })();
}

function extractMessages(channels, index, messages, limit, indexMessage) {
    if (indexMessage < messages.length) {
        message = messages[indexMessage];
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
                    extractMessages(channels, index, messages, limit, indexMessage + 1);
                });
            });
        } else if (!dateReach) {
            logger.log("Date limite non atteinte");
            extractMessages(channels, index, messages, limit, indexMessage + 1);
        } else if (dateReach) {
            logger.log("Date limite atteinte");
            getAllChannelsHistory(channels, index + 1, limit)
        }
    } else {
        logger.log("Fin des messages de la liste");
        if(messages[messages.length - 1] != undefined) {
            setTimeout(function() {
                getHistory(channels, index, limit, messages[messages.length - 1].ts);
            }, 1000);
        }
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