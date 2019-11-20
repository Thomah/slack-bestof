require('dotenv').config();

const mongodb = require("mongodb");
const MONGODB_URI = process.env.MONGODB_URI;
var dbo;

exports.init = function(callback) {
    mongodb.MongoClient.connect(
        MONGODB_URI, { useNewUrlParser: true },
        function(err, database) {
            if (err) throw err;
            var dbNameSplit = MONGODB_URI.split('/');
            dbo = database.db(dbNameSplit[dbNameSplit.length - 1]);
            callback();
        }
    );
};

exports.mongodb = function() {
    return mongodb;
}

exports.delete = function(collection, id, callback) {
    dbo
        .collection(collection)
        .deleteOne({ _id: new mongodb.ObjectId(id) }, function(err, result) {
            if (err) throw err;
            callback(result);
        });
};

exports.read = function(collection, match, callback) {
    dbo.collection(collection).findOne(match, function(err, result) {
        if (err) throw err;
        callback(result);
    });
};

exports.update = function(collection, condition, content, callback) {
    delete content._id;
    dbo
        .collection(collection)
        .updateOne(condition, { $set: content }, function(
            error,
            results
        ) {
            if (error) throw error;
            callback(results);
        });
};

exports.updateByName = function(collection, name, content) {
    dbo.collection(collection).updateOne({ name: name }, {
            $set: content
        },
        function(error) {
            if (error) throw error;
        }
    );
};

exports.upsert = function(collection, condition, content, callback) {
    dbo.collection(collection).updateOne(
        condition, {
            $set: content
        }, { upsert: true },
        (error, result) => {
            if (error) throw error;
            callback(result);
        }
    );
};

exports.insert = function(collection, content, callback) {
    dbo.collection(collection).insertOne(content, function(error, result) {
        if (error) throw error;
        if (callback !== undefined) {
            callback(result);
        }
    });
};

exports.insertMany = function(collection, content, callback) {
    dbo.collection(collection).insertMany(content, function(error, result) {
        if (error) throw error;
        if (callback !== undefined) {
            callback(result);
        }
    });
};

exports.list = function(collection, sort, callback) {
    dbo
        .collection(collection)
        .find({})
        .sort(sort)
        .toArray(function(err, result) {
            if (err) throw err;
            callback(result, collection);
        });
};

exports.close = function() {
    dbo.close();
};