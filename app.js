var Config = require(__dirname + "/config.js");

var _ = require("lodash");
var express = require("express");
var app = express();

var server = require("http").createServer(app);
var Promise = require("bluebird");

var io = require("socket.io").listen(server);
var mongoose = Promise.promisifyAll(require("mongoose"));
mongoose.connect("mongodb://localhost/Dotboxes");
var db = mongoose.connection;

var Models = require(__dirname + "/Models.js");

app.use("/static", express.static(__dirname+"/static"));
app.set('view engine', 'jade');
app.set('views', (__dirname + '/templates'));

var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());

var session = Promise.promisifyAll(require('express-session'));
var MongoStore = require('connect-mongo')(session);
var sessionMiddleware = session({
    store: new MongoStore({mongooseConnection: db}),
    secret: Config.sessionSecret,
    saveUninitialized:false,
    resave:false
});
app.use(sessionMiddleware);

var Models = require(__dirname + '/Models.js');

var Users = mongoose.model("User", Models.UserSchema);
var GameTable = mongoose.model("GameTable", Models.GameTableSchema);
/* http/https get method from node js does not follow standard callback protocol
 * Code taken from this blog post https://jaxbot.me/articles/new-nocaptcha-recaptcha-with-node-js-express-12-9-2014
 * In short, https.get is basically a http.request call that automically has an 'end' callback and sets 
 * to get. http.get/http.request return a http.ClientRequest, which implements a readable stream which in return
 * waits accepts a signal called data, which in turn holds the response from the server.
 */
var Https = require("https");
var getRequest = Promise.method(function(options) {
    return new Promise(function(resolve, reject) {
        var request = Https.get(options, function(response) {
            response.on('data',function(chunk) {
                resolve(JSON.parse(chunk.toString()));
            });
            response.on('error',function(error) { reject("Could not complete HTTPS request"); });
        });
    });
});

app.get("/", function(req, res, next) {
    var literals = {siteKey:Config.recaptcha.siteKey};
    if (req.query.error) {
        switch (req.query.error) {
        case "enameused":
            literals.error = "The name you have chosen is currently in use";
            break;
        case "enoname":
            literals.error = "Please enter the nick name you wish to use";
            break;
        case "erecaptcha":
            literals.error = "Recaptcha mismatch. Please complete it properly";
            break;
        default:
            literals.error = "There seems to be a problem with the sign in process please try again later";
            break;
        }
    }
    res.render('playerRegistration', literals);
});

app.post('/registerName', function(req,res,next) {
    if (!req.body.userName) {
        res.redirect("/?error=enoname");
    } else {
        getRequest("https://www.google.com/recaptcha/api/siteverify?secret="+Config.recaptcha.secretKey+"&response="+req.body["g-recaptcha-response"])
            .then(function(results) {
                if (results["success"]) {
                    return Users.findOneAsync({userName: req.body.userName});
                } else {
                    throw new Error("erecaptcha");
                }
            })
            .then(function(user) {
                if (user) {
                    throw new Error("enameused");
                } else {
                    var tempId = chance.guid();
                    var newUser = new Users({userName: req.body.userName, tempId: tempId});
                    return Promise.all([newUser.saveAsync(), tempId]);
                }
            })
            .spread(function(newUser, tempId) {
                if (newUser) {
                    req.session.userName = req.body.userName;
                    req.session.tempId = tempId;
                    req.session.userValidated = true;
                    return req.session.saveAsync();
                } else {
                    throw new Error("could not create new member");
                }
            })
            .then(function() {
                res.redirect('/game');
            })
            .catch(function(error) {
                if (error.message && error.message.match(/(enameused|erecaptcha)/i)) {
                    res.redirect("/?error="+error.message);
                } else {
                    console.log(error);
                }
            });
    }
});

app.get("/game", function(req, res) {
    if (_.isEmpty(req.session.tempId) && _.isEmpty(req.session.userName)) {
        res.redirect("/");
    } else {
        res.render('game', {userName: req.session.userName});
    }
});

io.use(function(socket, next) {
    sessionMiddleware(socket.request, socket.request.res, next);
});

var Chance = require("chance");
var chance = new Chance();
io.on("connection", function(socket) {
    socket.on("request-initial-table-list", function(data) {
        if (socket.request.session.userName) {
            GameTable.findAsync({abandoned:false, isLocked:false})
                .then(function(tables) {
                    console.log(tables.length);
                    var tablesList = {};
                    if (tables) {
                        console.log("constructing list");
                        _.each(tables, function(table) {
                            if (table.players.length === 1) {
                                var tableObject = {};
                                var needsPassword = (_.isEmpty(table.password)) ? false : true;
                                tablesList[table.socketRoomId] = { tableOwner: table.ownerName,
                                                                   dimensions: table.gridDimensions,
                                                                   needsPassword: needsPassword
                                                                 };
                            }
                        });
                        console.log("emitting signal");
                        socket.emit("fresh-table-list", {tableList: tablesList});
                    }
                })
                .catch(function(error) {
                    io.emit("server-error", error.message);
                    console.log(error.message);
                });
        } else {
            socket.emit("server-error", {errorCode: "ENOTREGISTERED"});
            console.log("ENOTREGISTERED");
        }
    });
    socket.on("create-table", function(data) {
        var tableId = chance.guid();
        var password = (data.password) ? data.password : "";
        var newGameTable = new GameTable({
            socketRoomId: tableId,
            isLocked:false,
            currentTurn: 0,
            gridDimensions: data.dimensions,
            squares: Math.pow(Number(data.dimensions),2),
            password: password,
            completedSquares: 0,
            gameState: 0,
            numberOfRows: Number(data.dimensions) + 1,
            ownerName: socket.request.session.userName,
            verticies: [],
            abandoned: false,
            players: []
        });
        var x = 0;
        var y = 0;
        for (var i = 0; i < (Math.pow(newGameTable.numberOfRows, 2)); i++) {
            if (x === newGameTable.numberOfRows) {
                x = 0;
                y += 1;
            }
            newGameTable.verticies.push({id:i,
                                         relationalCoordinates:{x:x,
                                                                y:y},
                                         adjacency: []});
            x += 1;
        };
        socket.request.session.currentTable = tableId;
        newGameTable.addPlayerToTable(socket.request.session.tempId, socket.request.session.userName);
        Promise.all([newGameTable.saveAsync(),
                     socket.request.session.saveAsync()
                    ])
            .spread(function(newGameTable, sessionSave) {
                socket.join(tableId);
                socket.emit("joined-table", {table: _.omit(newGameTable[0].toJSON(), "_id", "socketRoomId")});
                var newTableObject = {};
                var needsPassword = (_.isEmpty(newGameTable[0].password)) ? false : true;
                newTableObject[newGameTable[0].socketRoomId] = {tableOwner: newGameTable[0].ownerName,
                                                                dimensions: newGameTable[0].gridDimensions,
                                                                needsPassword: needsPassword};
                io.emit("table-opened", {newTable: newTableObject});
            })
            .catch(function(err) {
                socket.io.emit("server-error", {code: "EGENERAL"});
                console.log(err);
            });
    });
    
    socket.on("join-table", function(data) {
        /* We employ a two pass table membership method to ensure no extra members remain. While it is fine for a player to join right
         * before a table lock, we do not want the table to exceed it's capacity. Given the asynchronous realtime nature of this application
         * A race condition exists when two users click join before the list is updated. As such, if the limit is exceeded after the write
         * we check if the user is within the first N members, where N is the table capacity */
        GameTable.findOneAsync({socketRoomId: data.tableId})
            .then(function(tableInstance) {
                if (tableInstance) {
                    if (!tableInstance.isLocked && tableInstance.players.length < 2) {
                        var canJoin = true;
                        if (!_.isEmpty(tableInstance.password) && tableInstance.password !== data.password) {
                            canJoin = false;
                        }
                        if (canJoin) {
                            tableInstance.addPlayerToTable(socket.request.session.tempId, socket.request.session.userName);
                        } else {
                            throw new Error("EWRONGPASSWORD");
                        }
                        return Promise.props({tableId: tableInstance.socketRoomId, saveCallResult: tableInstance.saveAsync()});
                    } else {
                        var errorCode = (tableInstance.isLocked) ? "ETABLELOCKED" : "ETABLEFULL";
                        throw new Error(errorCode);
                    }
                } else {                    
                    throw new Error("ENOTABLE");
                }
            })
            .then(function(results) {
                return GameTable.findOneAsync({socketRoomId: data.tableId});
            })
            .then(function(tableInstance) {
                var promise = {};
                if (tableInstance) {
                    if (tableInstance.players.length >= 2) {
                        io.emit("table-closed", {tableId: tableInstance.socketRoomId});
                    }
                    //If that entered is actually the second player
                    if(!tableInstance.isLocked && !tableInstance.isAbandoned && _.findIndex(tableInstance.players.toObject(), {'tempId':socket.request.session.tempId}) === 1) {
                        promise.succeed = true;
                        promise.table = tableInstance;
                        tableInstance.isLocked = true;
                        tableInstance.gameState = 1;
                    } else {
                        (_.find(tableInstance.players.toObject(), {'tempId':socket.request.session.tempId})).remove();
                        promise.succeed = false;
                    }
                    promise.saveAction = tableInstance.saveAsync();
                } else {
                    throw new Error("ENOTABLE");
                }
                return promise;
            })
            .then(function(results) {
                if (results.succeed) {
                    socket.request.session.currentTable = data.tableId;
                    return Promise.all([results,
                                        socket.request.session.saveAsync()
                                       ]);
                } else {
                    throw new Error("ETABLEFULL");
                }
            })
            .spread(function(results, sessionSaveResult) {
                socket.join(results.table.socketRoomId);
                socket.emit("joined-table", {table: _.omit(results.table.toJSON(), "_id", "socketRoomId")});
                socket.to(results.table.socketRoomId).emit("another-player-joined-table", {newPlayer: socket.request.session.userName});
                io.to(results.table.socketRoomId).emit("start-game", {});
            })
            .catch(function(err) {
                console.log(err);
                var code = "EGENERAL";
                if (err.message.match(/(ENOTABLE|ETABLEFULL|EWRONGPASSWORD|ETABLELOCKED)/i)) {
                    code = err.message;
                }
                socket.emit("server-error", {errorCode: code});
            });        
    });

    socket.on("record-move", function(data) {
        var determineCompletedSquare = function(vertexPair, vertexCollection, numberOfRows) {
            console.log("determining...");
            var completedSquareIndicies = [];
            var addCompletedSquare = function(topLeftCoordinate, bottomRightCoordinate) {
                if (_.contains(topLeftCoordinate.adjacencyList, topLeftCoordinate.id+1) &&
                    _.contains(topLeftCoordinate.adjacencyList, topLeftCoordinate.id+numberOfRows) &&
                    _.contains(bottomRightCoordinate.adjacencyList, bottomRightCoordinate.id-numberOfRows) &&
                    _.contains(bottomRightCoordinate.adjacencyList, bottomRightCoordinate.id-1)) {
                    completedSquareIndicies.push(topLeftCoordinate);
                }                
            };
            if (vertexPair[0].relationalCoordinates.y === vertexPair[1].relationalCoordinates.y) {
                //Top square Check
                if (vertexCollection[(vertexPair[0].id-numberOfRows)]) {
                    addCompletedSquare(vertexCollection[(vertexPair[0].id-numberOfRows)],vertexCollection[vertexPair[1].id]);
                }
                //Bottom squareCheck
                if (vertexCollection[(vertexPair[0].id+numberOfRows)]) {
                    addCompletedSquare(vertexCollection[vertexPair[0].id], vertexCollection[(vertexPair[1].id+numberOfRows)]);
                }
            } else {
                if (vertexCollection[(vertexPair[0].id-1)]) {
                    addCompletedSquare(vertexCollection[(vertexPair[0].id-1)], vertexCollection[vertexPair[1].id]);
                }
                if (vertexCollection[(vertexPair[0].id+1)]) {
                    addCompletedSquare(vertexCollection[vertexPair[0].id], vertexCollection[(vertexPair[1].id+1)]);
                }
            }
            return completedSquareIndicies;
        };
        GameTable.findOneAsync({socketRoomId:socket.request.session.currentTable})
            .then(function(table) {
                if (!table) {
                    throw new Error("ENOTABLE");
                } else if (table.players[table.currentTurn].tempId !== socket.request.session.tempId) {
                    throw new Error("ENOTTURN");
                } else {
                    table.verticies[data.verticies[0].id].adjacencyList.push(data.verticies[1].id);
                    table.verticies[data.verticies[1].id].adjacencyList.push(data.verticies[0].id);
                    var newSquares = determineCompletedSquare(data.verticies, table.verticies, table.numberOfRows);
                    table.completedSquares += newSquares.length;
                    table.players[table.currentTurn].score += newSquares.length;

                    table.incrementTurn();

                    var promises = {};

                    if (table[0].completedSquares === table[0].squares) {
                        table.gameState = 2;
                        if (table[0].players[0].score === table[0].players[1].score) {
                            promises.winner = -1;
                        } else {
                            promises.winner = (table[0].players[0].score > table[0].players[1].score) ? table[0].players[0].userName : table[0].players[1].userName;
                        }
                    }                    

                    promises.savedTable = table.saveAsync();
                    promises.newSquares = newSquares;
                    
                    return Promise.props(promises);
                }
            })
            .spread(function(results) {
                var returnData = {nextTurn: results.savedTable[0].currentTurn,
                                  connectedVerticies: [results.savedTable[0].verticies[data.verticies[0].id],
                                                       results.savedTable[0].verticies[data.verticies[1].id]],
                                  newSquares: results.newSquares,
                                  completedSquares: results.savedTable[0].completedSquares,
                                  updatedPlayerRoster: results.savedTable[0].players
                                 };
                if (results.winner) {
                    returnData.winner = results.winner;
                }
                
                io.to(results.savedTable[0].socketRoomId).emit("new-move", returnData);
            })
            .catch(function(error) {
                console.log(error.stack);
            });
    });

    var playerLeave = function(signOut) {
        GameTable.findOneAsync({"socketRoomId": socket.request.session.currentTable})
            .then(function(table) {
                var promises = {};
                if (table) {
                    table.removePlayer();
                    
                    if(table.gameState === 1) {
                        socket.to(socket.request.session.currentTable).emit("give-up");
                    }
                    
                    socket.leave(socket.request.session.currentTable);
                    socket.request.session.currentTable = "";
                    table.isLocked = true;
                    promises.savedTable = table.saveAsync();
                }

                if (signOut) {
                    promises.removeUser = Users.findOneAndRemoveAsync({userName: socket.request.session.userName});                    
                    socket.request.session.tempId = "";
                    socket.request.session.userName = "";
                }
                
                promises.sessionSave = socket.request.session.saveAsync();                    
                return Promise.props(promises);
            })
            .then(function(results) {
                if (results.savedTable) {
                    io.emit("table-closed", {roomId: results.savedTable[0].socketRoomId});
                }
                if (!signOut) {
                    socket.emit("return-to-lobby");
                }
            })
            .catch(function(error) {
                socket.emit("server-error", "leaveError");
                console.log(error.stack);
            });
    };
    socket.on("leave-table", playerLeave);
    socket.on("disconnect", playerLeave.bind(this, true));

});

server.listen(8080);
console.log("Listening");
