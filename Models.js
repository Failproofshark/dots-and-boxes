var _ = require("lodash");
var Promise = require("bluebird");
var mongoose = Promise.promisifyAll(require("mongoose"));

var Models = {};

Models.UserSchema = mongoose.Schema({userName: String,
                                     tempId: String
                                    });

Models.VertexSchema = mongoose.Schema({id: Number,
                                       relationalCoordinates: {x: Number,
                                                               y: Number},
                                       adjacencyList: [Number]
                                      });
Models.GameTableSchema = mongoose.Schema({
    socketRoomId: String,
    isLocked: Boolean,
    currentTurn: Number,
    gridDimensions: Number,
    squares: Number,
    gameState: Number,
    completedSquares: Number,
    currentTurn: Number,
    numberOfRows: Number,
    ownerName: String,
    verticies: [Models.VertexSchema],
    abandoned: Boolean,
    password: String,
    players: [{tempId: String,
               userName: String,
               score: Number
              }]
});
Models.GameTableSchema.methods.incrementTurn = function() {
    if (this.players[this.currentTurn + 1]) {
        this.currentTurn += 1;
    } else {
        this.currentTurn = 0;
    }
};
Models.GameTableSchema.methods.removePlayer = function(tempId) {
    _.each(this.players, function(player) {
        if (player.tempId === tempId) {
            player.remove();
        }
    });
};
Models.GameTableSchema.methods.addPlayerToTable = function(tempId, playerName) {
    this.players.push({tempId: tempId,
                       userName: playerName,
                       score: 0
                      });
};

module.exports = Models;
