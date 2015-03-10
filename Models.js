var _ = require("lodash");
var Promise = require("bluebird");
var mongoose = Promise.promisifyAll(require("mongoose"));

var Models = {};

Models.UserSchema = mongoose.Schema({userName: String,
                                     socketId: String
                                    });

Models.GameTableSchema = mongoose.Schema({
    socketRoomId: String,
    isLocked: Boolean,
    currentTurn: Number,
    squares: Number,
    completedSquares: Number,
    verticies: [{id: Number,
                 relationalCoordinates: {x: Number,
                                         y: Number},
                 adjacencyList: [Number]
                }],
    players: [{socketId: String,
               userName: String,
               score: Number
              }]
    
});

module.exports = Models;
