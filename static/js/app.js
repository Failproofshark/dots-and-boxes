var app = {};
app.Player = function(name) {
    this.name = name;
    this.score = 0;
};

app.Dot = function(id, relationalX, relationalY, drawX, drawY) {
    this.id = id;

    //Since it's a square we only need one number to describe width and height
    this.size = 10;

    /* The difference between the two is that relational coordinates simply
     * lists it's position in relation to the other dots (useful for error checking diagonal/skipping over
     * a dot) and the draw coordinates is what is actually used for drawing the dot on the canvas (used for collision detection)
     */
    this.relationalCoordinates = {x: relationalX, y: relationalY};
    // This is populated by the game's draw method.
    this.drawCoordinates = {x: drawX, y: drawY};

    this.left = function() { return this.drawCoordinates.x; };
    this.right = function() { return this.drawCoordinates.x + this.size; };
    this.top = function() { return this.drawCoordinates.y; };
    this.bottom = function() { return this.drawCoordinates.y + this.size; };

    // What it's connected to. In this sceneario it can be connected to a maximum of 4 points if it's in the center or two if it's in a corner.
    this.adjacencyList = [];

    this.drawMethod = function(color, context) {
        context.fillStyle = color;
        context.fillRect(this.drawCoordinates.x, this.drawCoordinates.y, this.size, this.size);
    };
    this.hasCollided = function(mouseX, mouseY) {
        var collisionDetected = true;
        //The top and bottom collision may look reversed, but canvas handles things in normal screen coordinates (y increase down)
        if (mouseY < this.top() ||
            mouseY > this.bottom() ||
            mouseX > this.right() ||
            mouseX < this.left()) {
            collisionDetected = false;
        }
        return collisionDetected;
    };
};

app.Table = function(serverSideTable, userName) {
    this.gridDimensions = serverSideTable.gridDimensions;
    this.squares = serverSideTable.squares;
    this.completedSquares = 0;
    this.numberOfRows = serverSideTable.numberOfRows;
    this.currentTurn = serverSideTable.currentTurn;

    this.ownerName = serverSideTable.ownerName;

    this.verticies = [];

    //A temporary buffer were we keep what two verticies we've selected
    this.currentSelection = [];

    this.addToSelection = function(vertex) {
        //Sorting helps not only in drawing but when checking for completed squares
        this.currentSelection.push(vertex);
        this.currentSelection = _.sortBy(this.currentSelection, 'id');
    };

    this.updatePlayerRoster = function(newPlayerData) {
        this.players[0].score = newPlayerData[0].score;
        this.players[1].score = newPlayerData[1].score;
    };

    this.updateVerticies = function(newVertexData) {
        this.verticies[newVertexData[0].id].adjacencyList = newVertexData[0].adjacencyList;
        this.verticies[newVertexData[1].id].adjacencyList = newVertexData[1].adjacencyList;
    };

    this.getPlayerName = function(index) {
        return this.players[index].name;
    };

    var self = this;
    //This is so the dots are not butted up against the edges of the canvas
    var padding = 5;
    this.drawGap = 45;
    _.each(serverSideTable.verticies, function(vertex) {
        var drawY = (vertex.relationalCoordinates.y * self.drawGap + padding);
        var drawX = (vertex.relationalCoordinates.x * self.drawGap + padding);
        self.verticies.push(new app.Dot(vertex.id, vertex.relationalCoordinates.x, vertex.relationalCoordinates.y, drawX, drawY));
    });

    this.isCurrentTurn = function() {
        return (this.players[this.currentTurn].name === userName);
    };

    this.players = _.map(serverSideTable.players, function(player) { return new app.Player(player.userName); });
    this.messages = [];
    this.gameState = 0;
};

app.ViewModel = new function() {
    var vm = {};
    vm.init = function() {
        vm.availableTables = {};
        vm.currentTable;
        vm.clientError = "";
        vm.currentScreen = "lobby";
        vm.socket;
        vm.ClientError = "";
        vm.resetTable = true;

        vm.myName = userName;
        vm.tableNotice = "Waiting for an opponent...";
        // A buffer to determine what needs to be drawn on the canvas
        vm.drawingBuffer = {};
        //Simply binding vm may cause problems so we opt to use a reference like the following
        vm.initializeSocket = function() {
            var eventHandlers = {
                "fresh-table-list": function(data) {
                    _.merge(vm.availableTables, data.tableList);
                },
                "table-opened": function(data) {
                    _.merge(vm.availableTables, data.newTable);
                },
                "table-closed": function(data) {
                    if(vm.availableTables[data.roomId]) {
                        delete vm.availableTables[data.roomId];
                    }
                },
                "return-to-lobby": function(data) {
                    vm.currentScreen = "lobby";
                },            
                "joined-table": function(data) {
                    vm.createGridDimension("");
                    vm.tablePassword("");
                    vm.joinPassword("");
                    vm.prospectiveTableId("");
                    vm.clientError = "" ;
                    vm.isVerifyingPassword = false;
                    vm.tableCreationInProgress = false;
                    vm.currentTable = new app.Table(data.table, vm.myName);
                    vm.currentScreen = "gameTable";
                },
                "give-up": function(data) {
                    if (vm.currentTable) {
                        vm.currentTable.gameState = 3;
                    }
                    vm.tableNotice = "The opponent has left the game. You win by default!";
                },
                "another-player-joined-table": function(data) {
                    vm.currentTable.players.push(new app.Player(data.newPlayer));
                },
                "player-left-table": function(data) {
                    if (data.userName) {
                        _.remove(vm.currentTable.players, function(player) { return player.userName === data.userName; });
                    }
                },
                "new-move": function(data) {
                    vm.currentTable.currentSelection = [];
                    vm.sendingMove = false;
                    
                    vm.currentTable.updatePlayerRoster(data.updatedPlayerRoster);
                    vm.currentTable.updateVerticies(data.connectedVerticies);

                    vm.drawingBuffer = {playerIndex: vm.currentTable.currentTurn,
                                        line: [vm.currentTable.verticies[data.connectedVerticies[0].id],
                                               vm.currentTable.verticies[data.connectedVerticies[1].id]
                                              ]};
                    if (!_.isEmpty(data.newSquares)) {
                        vm.drawingBuffer.squares = data.newSquares;
                    }                    
                    
                    vm.currentTable.currentTurn = data.nextTurn;

                    if (data.winner) {
                        if (vm.currentTable) {
                            vm.currentTable.gameState = 2;
                        }
                        vm.tableNotice = data.winner + " has won";
                    } else {
                        vm.tableNotice = "It's " + vm.currentTable.players[vm.currentTable.currentTurn].name + "'s turn";
                    }
                },
                "start-game": function() {
                    vm.currentTable.gameState = 1;
                    vm.tableNotice = "It's " + vm.currentTable.players[vm.currentTable.currentTurn].name + " turn";
                },
                "server-error": function(data) {
                    switch(data.errorCode) {
                    case "ENOTREGISTERED":
                        window.location = "/";
                        break;
                    case "ENOTABLE":
                        vm.currentScreen = "lobby";
                        vm.clientError = "We could not find the table you were trying to join";
                        break;
                    case "ETABLEFULL":
                        vm.currentScreen = "lobby";                        
                        vm.clientError = "The table you tried to join is full";
                        break;
                    case "EWRONGPASSWORD":
                        vm.isVerifyingPassword = false;
                        vm.clientError = "The password you input was incorrect";
                        break;
                    case "ETABLELOCKED":
                        vm.currentScreen = "lobby";
                        vm.clientError = "The table is currently locked";
                        break;
                    default:
                        vm.clientError = "An error has occured on the server...";
                        break;
                    }
                }

            };
            vm.socket = io("http://localhost:8080");
            //event binding phase
            _.each(eventHandlers, function(handler, event) {
                vm.socket.on(event, function(data) {
                    m.startComputation();
                    handler(data);
                    m.endComputation();
                });
            });
            vm.socket.emit("request-initial-table-list");
        };

        vm.initializeSocket();

        //eventHandlers
        vm.createTablePrompt = function() {
            vm.currentScreen = "createTable";
            return false;
        };

        // Table creation parameters
        vm.createGridDimension = m.prop("");
        vm.tablePassword = m.prop("");
        vm.createTableError = m.prop();
        vm.tableCreationInProgress = false;
        vm.createTable = function() {
            if (_.isEmpty(vm.createGridDimension()) || !_.isNumber(Number(vm.createGridDimension())) || Number(vm.createGridDimension()) > 5 || Number(vm.createGridDimension()) < 2) {
                vm.createTableError("Please specify the grid size of the table with a single number (2-5)");
            } else {
                var createTableParameters = {dimensions:Number(vm.createGridDimension())};
                
                if (!_.isEmpty($.trim(vm.tablePassword()))) {
                    createTableParameters.password = $.trim(vm.tablePassword());
                }
                
                vm.socket.emit("create-table", createTableParameters);
                vm.tableCreationInProgress = true;
            }
            return false;
        };
        vm.cancelCreateTable = function() {
            vm.createTableError("");
            vm.currentScreen = "lobby";
            vm.createGridDimension("");
            return false;
        };
        
        vm.prospectiveTableId = m.prop("");
        vm.joinTable = function(tableId, needsPassword) {
            vm.currentScreen = "loading";
            vm.prospectiveTableId(tableId);
            if (needsPassword) {
                vm.currentScreen = "password";
            } else {
                vm.socket.emit("join-table", {tableId: tableId});
            }
        };

        //Mainly used when a password is in place
        vm.joinPassword = m.prop("");
        vm.isVerifyingPassword = false;
        vm.verifyPassword = function() {
            if (!_.isEmpty(vm.prospectiveTableId()) && !_.isEmpty(vm.joinPassword())) {
                vm.clientError = "";
                vm.isVerifyingPassword = true;
                vm.socket.emit("join-table", {tableId: vm.prospectiveTableId(), password: vm.joinPassword()});
            }
            return false;
        };
        vm.cancelJoinTable = function() {
            vm.clientError = "";
            vm.joinPassword("");
            vm.prospectiveTableId("");
            vm.currentScreen = "lobby";
            return false;
        };

        //selection handlers
        vm.sendingMove = false;
        vm.acceptSelection = function() {
            vm.sendingMove = true;
            vm.socket.emit("record-move", {verticies: app.ViewModel.currentTable.currentSelection});
        };
        vm.cancelSelection = function() {
            vm.currentTable.currentSelection = [];
        };

        vm.returnToLobby = function() {
            vm.currentTable = null;
            vm.currentScreen = "loading";
            vm.resetTable = true;
            vm.socket.emit("leave-table");
        };
    };
    return vm;
};

var checkCurrentScreen = function(screenName) {
    var displayProperty = (app.ViewModel.currentScreen === screenName) ? "display:inherit" : "display:none";
    return displayProperty;
};

var loadingView = function() {
    return m("div", {style: checkCurrentScreen("loading")}, [
        m("div.row", [
            m("div.col-xs-12", [
                m("img.preloader[src=/static/assets/preloader.gif", "Loading...")
            ])
        ])
    ]);
};

var LobbyView = function() {
    var isEmpty = _.isEmpty(app.ViewModel.availableTables);
    var emptyDisplay = isEmpty ? "display:inherit" : "display:none";
    var lobbyDisplay = isEmpty ? "display:none" : "display:inherit";

    return m("div", {style: checkCurrentScreen("lobby")}, [
        m("div.row", [
            m("div.col-xs-12", [
                m("button.btn.btn-primary", {onclick: app.ViewModel.createTablePrompt}, "Create Table")
            ]),
        ]),
        m("div.row", [
            m("div.col-xs-12", [
                m("span", {display:emptyDisplay}, "There are no tables currently open. We will update you as tables open, or you may create your own using the Create Table above"),
                m("div", {display:lobbyDisplay}, _.map(app.ViewModel.availableTables, function(table, key) {
                  return m("div", [
                      m("span", (table.tableOwner + "'s table. " + table.dimensions + "x" + table.dimensions + " grid")),
                      m("button.btn.btn-primary", {onclick: app.ViewModel.joinTable.bind(app.ViewModel, key, table.needsPassword)}, "Join Table")
                  ]);
                }))
            ])
        ])
    ]);
};

var CreateTableView = function() {
    var preloaderDisplay = (app.ViewModel.tableCreationInProgress) ? "display:inherit" : "display:none";
    var formDisplay = (app.ViewModel.tableCreationInProgress) ? "display:none" : "display:inherit";
    
    return m("div", {style: checkCurrentScreen("createTable")}, [
        m("div.row", [
            m("div.col-xs-12.text-danger", [
                m("div", app.ViewModel.createTableError())
            ])
        ]),
        m("div.row", {style:preloaderDisplay}, [
            m("div.col-xs-12", [
                m("div", [
                    m("img.preloader[src=/static/assets/preloader.gif]"),
                    m("span", "Creating table...")
                ])
            ])
        ]),
        m("div.row", {style:formDisplay}, [
            m("div.col-xs-12", [
                m("div", "This game is played on a square grid ranging from a 2x2 grid to a 5x5 grid. Input a single number below to create a grid. Optionally, you may input a password to make the game private (be sure to give the other player the password so they can get in the room"),
                m("form", [
                    m("div.form-group", [
                        m("input.form-control[type=text]", {onchange: m.withAttr("value", app.ViewModel.createGridDimension), placeholder:"Grid size (10 maximum)", value:app.ViewModel.createGridDimension()}),
                        m("input.form-control[type=password]", {onchange: m.withAttr("value", app.ViewModel.tablePassword), placeholder:"Table password (optional for private games)", value:app.ViewModel.tablePassword()}),
                        m("button.btn.btn-primary", {onclick: app.ViewModel.createTable}, "Create Table"),
                        m("button.btn.btn-danger", {onclick: app.ViewModel.cancelCreateTable}, "Cancel")
                    ])
                ])
            ])
        ])
    ]);
};

var GameTableView = function() {
    var renderTableMessages = function() {
        if (app.ViewModel.currentTable) {
            return _.map(app.ViewModel.currentTable.messages, function(message) {
                return m("div", message);
            });
        }
    };

    var listPlayers = function() {
        if (app.ViewModel.currentTable) {
            return _.map(app.ViewModel.currentTable.players, function(player) {
                return m("div", (player.name + ": " + player.score));
            });
        }
    };

    var canvasConfig = function(element, isInit, context) {
        if (!isInit) {
            context.canvasContext = element.getContext('2d');
            var canvasClickListener = function(event) {
                if (app.ViewModel.currentTable && app.ViewModel.currentTable.gameState === 1 && app.ViewModel.currentTable.isCurrentTurn()) {
                    var x = (event.pageX) ? event.pageX : (event.clientX + document.body.scrollLeft + document.documentElement.scrollLeft);
                    var y = (event.pageY) ? event.pageY : (event.clientY + document.body.scrollTop + document.documentElement.scrollTop);
                    x -= $(element).offset().left;
                    y -= $(element).offset().top;
                    _.each(app.ViewModel.currentTable.verticies, function(vertex, index) {
                        if (vertex.hasCollided(x, y) && app.ViewModel.currentTable.currentSelection.length < 2) {
                            if (_.isEmpty(app.ViewModel.currentTable.currentSelection)) {
                                app.ViewModel.currentTable.addToSelection(vertex);
                                vertex.drawMethod("red", context.canvasContext);
                            } else {
                                /* Only orthogonally adjacent selections are allowed 
                                 * and can only be one unit away. Furthermore a edge cannot already 
                                 * exist between the two points
                                 */
                                if (vertex.id === app.ViewModel.currentTable.currentSelection[0].id ||
                                    vertex.relationalCoordinates.x > (app.ViewModel.currentTable.currentSelection[0].relationalCoordinates.x + 1) ||
                                    vertex.relationalCoordinates.x < (app.ViewModel.currentTable.currentSelection[0].relationalCoordinates.x - 1) ||
                                    vertex.relationalCoordinates.y > (app.ViewModel.currentTable.currentSelection[0].relationalCoordinates.y + 1) ||
                                    vertex.relationalCoordinates.y < (app.ViewModel.currentTable.currentSelection[0].relationalCoordinates.y - 1) ||
                                    ((vertex.relationalCoordinates.x === app.ViewModel.currentTable.currentSelection[0].relationalCoordinates.x + 1) && (vertex.relationalCoordinates.y === app.ViewModel.currentTable.currentSelection[0].relationalCoordinates.y + 1)) ||
                                    ((vertex.relationalCoordinates.x === app.ViewModel.currentTable.currentSelection[0].relationalCoordinates.x -1) && (vertex.relationalCoordinates.y === app.ViewModel.currentTable.currentSelection[0].relationalCoordinates.y + 1)) ||
                                    ((vertex.relationalCoordinates.x === app.ViewModel.currentTable.currentSelection[0].relationalCoordinates.x - 1) && (vertex.relationalCoordinates.y === app.ViewModel.currentTable.currentSelection[0].relationalCoordinates.y - 1)) ||
                                    ((vertex.relationalCoordinates.x === app.ViewModel.currentTable.currentSelection[0].relationalCoordinates.x + 1) && (vertex.relationalCoordinates.y === app.ViewModel.currentTable.currentSelection[0].relationalCoordinates.y - 1)) ||
                                    (_.includes(app.ViewModel.currentTable.currentSelection[0].adjacencyList, vertex.id))) {
                                    app.ViewModel.currentTable.currentSelection[0].drawMethod("black", context.canvasContext);
                                    app.ViewModel.currentTable.currentSelection = [vertex];
                                    vertex.drawMethod("red", context.canvasContext);
                                } else {
                                    m.startComputation();
                                    app.ViewModel.currentTable.addToSelection(vertex);
                                    vertex.drawMethod("red", context.canvasContext);
                                    m.endComputation();
                                }
                            }                        
                        }
                    });
                } else {
                    alert("It is not your turn");
                }
                return true;
            };

            element.addEventListener("mousedown", canvasClickListener);
        }

        var drawLine = function(vertexPair) {
            var lineSize = app.ViewModel.currentTable.drawGap - vertexPair[0].size - 4;
            context.canvasContext.fillStyle = "#000000";
            if (vertexPair[0].relationalCoordinates.y === vertexPair[1].relationalCoordinates.y) {
                context.canvasContext.fillRect((vertexPair[0].right()+2), vertexPair[0].drawCoordinates.y, lineSize, vertexPair[0].size);
            } else {
                context.canvasContext.fillRect(vertexPair[0].drawCoordinates.x, (vertexPair[0].bottom() + 2), vertexPair[0].size, lineSize);
            }
            _.each(vertexPair, function(vertex) { 
                vertex.drawMethod("#000000",context.canvasContext);
            });
        };

        var markSquare = function(mark, dot) {
            var initial = mark[0];
            var x = dot.left() + (app.ViewModel.currentTable.drawGap/2.);
            var y = dot.bottom() + (app.ViewModel.currentTable.drawGap/2.);
            context.canvasContext.fillStyle = "#000000";
            context.canvasContext.font = "15px sans-serif";
            context.canvasContext.fillText(initial, x, y);
        };        
        
        if (app.ViewModel.currentTable && app.ViewModel.currentTable.currentSelection.length === 0) {
            /* We really aren't supposed to modify the viewmodel in a config since it would
             * usually break reusability but the alternative is a bit more complicated (essentially
             * have the state passed in via a closure)
             */
            if (app.ViewModel.resetTable) {
                context.canvasContext.fillStyle = "#ffffff";
                context.canvasContext.fillRect(0,0,640,640);
                app.ViewModel.resetTable = false;
            }
            _.each(app.ViewModel.currentTable.verticies, function(vertex) {
                vertex.drawMethod("#000000", context.canvasContext);
            });
            if (!_.isEmpty(app.ViewModel.drawingBuffer)) {
                drawLine(app.ViewModel.drawingBuffer.line);
                if (app.ViewModel.drawingBuffer.squares) {
                    var markSquarePartial = _.partial(markSquare, app.ViewModel.currentTable.getPlayerName(app.ViewModel.drawingBuffer.playerIndex));
                    _.each(app.ViewModel.drawingBuffer.squares, function(square) {
                        markSquare(app.ViewModel.currentTable.getPlayerName(app.ViewModel.drawingBuffer.playerIndex),
                                   app.ViewModel.currentTable.verticies[square.id]);
                    });
                }
                app.ViewModel.drawingBuffer = {};
            }
        }
    };

    var boardVisibility = (app.ViewModel.currentTable && app.ViewModel.currentTable.gameState > 0) ? "display:inherit" : "display:none";
    var selectionControlsDisplay = (app.ViewModel.currentTable && app.ViewModel.currentTable.currentSelection.length === 2 && !app.ViewModel.sendingMove) ? "display:inherit" : "display:none";
    var sendingMovePreloader = (app.ViewModel.sendingMove) ? "display:inherit" : "display:none";
    return m("div", {style: checkCurrentScreen("gameTable")}, [
        m("div.row", [
            m("div.col-xs-12", [
                m("button.btn.btn-danger", {onclick: app.ViewModel.returnToLobby}, "Return to Lobby")
            ])
        ]),
        m("div.row", [
            m("div.col-xs-12", [
                m("div", app.ViewModel.tableNotice)
            ])
        ]),
        m("div.row", [
            m("div.col-xs-12", [
                m("div.text-danger", app.ViewModel.tableError)
            ])
        ]),
        m("div.row", [
            m("div.col-xs-12", [
                m("div", {style:selectionControlsDisplay}, [
                    m("span", "Select these two points?"),
                    m("button.btn.btn-primary", {onclick: app.ViewModel.acceptSelection}, "Accept"),
                    m("button.btn.btn-danger", {onclick: app.ViewModel.cancelSelection}, "Cancel"),
                ]),
                m("div", {style:sendingMovePreloader}, [
                    m("span", "Sending move..."),
                    m("img.preloader[src=/static/assets/preloader.gif]", "Loading...")
                ])
            ])
        ]),
        m("div.row", [
            m("div.col-xs-10", {style: boardVisibility}, [
                m("canvas[width=640][height=640]", {config:canvasConfig})
            ]),
            m("div.col-xs-2", listPlayers())
        ])
    ]);
};

var PasswordView = function() {
    var showForm = (app.ViewModel.isVerifyingPassword) ? "display:none" : "display:inherit";
    var preloader = (app.ViewModel.isVerifyingPassword) ? "display:inherit" : "display:";
    return m("div", {style: checkCurrentScreen("password")}, [
        m("div.row", {style: preloader}, [
            m("div.col-xs-12", [
                m("img.preloader[src=/static/assets/preloader.gif", "Loading...")
            ])
        ]),
        m("div.row", {style: showForm}, [
            m("div.col-xs-12", [
                m("div", [
                    m("input.form-control[type=password]", {onchange: m.withAttr("value", app.ViewModel.joinPassword), placeholder: "This table requires a password", value: app.ViewModel.joinPassword()}),
                    m("button.btn.btn-primary", {onclick: app.ViewModel.verifyPassword}, "Join Table"),
                    m("button.btn.btn-danger", {onclick: app.ViewModel.cancelJoinTable}, "Cancel")
                ])
            ])
        ])
    ]);
};

app.view = function() {
    return m("div.container", [
        m("div.row", [
            m("div.col-xs-12", [
                m("div.text-danger", app.ViewModel.clientError)
            ])
        ]),
        LobbyView(),
        CreateTableView(),
        GameTableView(),
        PasswordView()
    ]);
};

app.controller = function() {
    app.ViewModel.init();
};

m.module(document.body, app);

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1vZGVscy5qcyIsInZpZXdtb2RlbC5qcyIsInZpZXdzLmpzIiwiY29udHJvbGxlci5qcyIsImdhbWVtb2R1bGUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2pHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbk5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN6UUE7QUFDQTtBQUNBO0FBQ0E7QUNIQTtBQUNBIiwiZmlsZSI6ImFwcC5qcyIsInNvdXJjZXNDb250ZW50IjpbInZhciBhcHAgPSB7fTtcbmFwcC5QbGF5ZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICB0aGlzLnNjb3JlID0gMDtcbn07XG5cbmFwcC5Eb3QgPSBmdW5jdGlvbihpZCwgcmVsYXRpb25hbFgsIHJlbGF0aW9uYWxZLCBkcmF3WCwgZHJhd1kpIHtcbiAgICB0aGlzLmlkID0gaWQ7XG5cbiAgICAvL1NpbmNlIGl0J3MgYSBzcXVhcmUgd2Ugb25seSBuZWVkIG9uZSBudW1iZXIgdG8gZGVzY3JpYmUgd2lkdGggYW5kIGhlaWdodFxuICAgIHRoaXMuc2l6ZSA9IDEwO1xuXG4gICAgLyogVGhlIGRpZmZlcmVuY2UgYmV0d2VlbiB0aGUgdHdvIGlzIHRoYXQgcmVsYXRpb25hbCBjb29yZGluYXRlcyBzaW1wbHlcbiAgICAgKiBsaXN0cyBpdCdzIHBvc2l0aW9uIGluIHJlbGF0aW9uIHRvIHRoZSBvdGhlciBkb3RzICh1c2VmdWwgZm9yIGVycm9yIGNoZWNraW5nIGRpYWdvbmFsL3NraXBwaW5nIG92ZXJcbiAgICAgKiBhIGRvdCkgYW5kIHRoZSBkcmF3IGNvb3JkaW5hdGVzIGlzIHdoYXQgaXMgYWN0dWFsbHkgdXNlZCBmb3IgZHJhd2luZyB0aGUgZG90IG9uIHRoZSBjYW52YXMgKHVzZWQgZm9yIGNvbGxpc2lvbiBkZXRlY3Rpb24pXG4gICAgICovXG4gICAgdGhpcy5yZWxhdGlvbmFsQ29vcmRpbmF0ZXMgPSB7eDogcmVsYXRpb25hbFgsIHk6IHJlbGF0aW9uYWxZfTtcbiAgICAvLyBUaGlzIGlzIHBvcHVsYXRlZCBieSB0aGUgZ2FtZSdzIGRyYXcgbWV0aG9kLlxuICAgIHRoaXMuZHJhd0Nvb3JkaW5hdGVzID0ge3g6IGRyYXdYLCB5OiBkcmF3WX07XG5cbiAgICB0aGlzLmxlZnQgPSBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuZHJhd0Nvb3JkaW5hdGVzLng7IH07XG4gICAgdGhpcy5yaWdodCA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5kcmF3Q29vcmRpbmF0ZXMueCArIHRoaXMuc2l6ZTsgfTtcbiAgICB0aGlzLnRvcCA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5kcmF3Q29vcmRpbmF0ZXMueTsgfTtcbiAgICB0aGlzLmJvdHRvbSA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5kcmF3Q29vcmRpbmF0ZXMueSArIHRoaXMuc2l6ZTsgfTtcblxuICAgIC8vIFdoYXQgaXQncyBjb25uZWN0ZWQgdG8uIEluIHRoaXMgc2NlbmVhcmlvIGl0IGNhbiBiZSBjb25uZWN0ZWQgdG8gYSBtYXhpbXVtIG9mIDQgcG9pbnRzIGlmIGl0J3MgaW4gdGhlIGNlbnRlciBvciB0d28gaWYgaXQncyBpbiBhIGNvcm5lci5cbiAgICB0aGlzLmFkamFjZW5jeUxpc3QgPSBbXTtcblxuICAgIHRoaXMuZHJhd01ldGhvZCA9IGZ1bmN0aW9uKGNvbG9yLCBjb250ZXh0KSB7XG4gICAgICAgIGNvbnRleHQuZmlsbFN0eWxlID0gY29sb3I7XG4gICAgICAgIGNvbnRleHQuZmlsbFJlY3QodGhpcy5kcmF3Q29vcmRpbmF0ZXMueCwgdGhpcy5kcmF3Q29vcmRpbmF0ZXMueSwgdGhpcy5zaXplLCB0aGlzLnNpemUpO1xuICAgIH07XG4gICAgdGhpcy5oYXNDb2xsaWRlZCA9IGZ1bmN0aW9uKG1vdXNlWCwgbW91c2VZKSB7XG4gICAgICAgIHZhciBjb2xsaXNpb25EZXRlY3RlZCA9IHRydWU7XG4gICAgICAgIC8vVGhlIHRvcCBhbmQgYm90dG9tIGNvbGxpc2lvbiBtYXkgbG9vayByZXZlcnNlZCwgYnV0IGNhbnZhcyBoYW5kbGVzIHRoaW5ncyBpbiBub3JtYWwgc2NyZWVuIGNvb3JkaW5hdGVzICh5IGluY3JlYXNlIGRvd24pXG4gICAgICAgIGlmIChtb3VzZVkgPCB0aGlzLnRvcCgpIHx8XG4gICAgICAgICAgICBtb3VzZVkgPiB0aGlzLmJvdHRvbSgpIHx8XG4gICAgICAgICAgICBtb3VzZVggPiB0aGlzLnJpZ2h0KCkgfHxcbiAgICAgICAgICAgIG1vdXNlWCA8IHRoaXMubGVmdCgpKSB7XG4gICAgICAgICAgICBjb2xsaXNpb25EZXRlY3RlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb2xsaXNpb25EZXRlY3RlZDtcbiAgICB9O1xufTtcblxuYXBwLlRhYmxlID0gZnVuY3Rpb24oc2VydmVyU2lkZVRhYmxlLCB1c2VyTmFtZSkge1xuICAgIHRoaXMuZ3JpZERpbWVuc2lvbnMgPSBzZXJ2ZXJTaWRlVGFibGUuZ3JpZERpbWVuc2lvbnM7XG4gICAgdGhpcy5zcXVhcmVzID0gc2VydmVyU2lkZVRhYmxlLnNxdWFyZXM7XG4gICAgdGhpcy5jb21wbGV0ZWRTcXVhcmVzID0gMDtcbiAgICB0aGlzLm51bWJlck9mUm93cyA9IHNlcnZlclNpZGVUYWJsZS5udW1iZXJPZlJvd3M7XG4gICAgdGhpcy5jdXJyZW50VHVybiA9IHNlcnZlclNpZGVUYWJsZS5jdXJyZW50VHVybjtcblxuICAgIHRoaXMub3duZXJOYW1lID0gc2VydmVyU2lkZVRhYmxlLm93bmVyTmFtZTtcblxuICAgIHRoaXMudmVydGljaWVzID0gW107XG5cbiAgICAvL0EgdGVtcG9yYXJ5IGJ1ZmZlciB3ZXJlIHdlIGtlZXAgd2hhdCB0d28gdmVydGljaWVzIHdlJ3ZlIHNlbGVjdGVkXG4gICAgdGhpcy5jdXJyZW50U2VsZWN0aW9uID0gW107XG5cbiAgICB0aGlzLmFkZFRvU2VsZWN0aW9uID0gZnVuY3Rpb24odmVydGV4KSB7XG4gICAgICAgIC8vU29ydGluZyBoZWxwcyBub3Qgb25seSBpbiBkcmF3aW5nIGJ1dCB3aGVuIGNoZWNraW5nIGZvciBjb21wbGV0ZWQgc3F1YXJlc1xuICAgICAgICB0aGlzLmN1cnJlbnRTZWxlY3Rpb24ucHVzaCh2ZXJ0ZXgpO1xuICAgICAgICB0aGlzLmN1cnJlbnRTZWxlY3Rpb24gPSBfLnNvcnRCeSh0aGlzLmN1cnJlbnRTZWxlY3Rpb24sICdpZCcpO1xuICAgIH07XG5cbiAgICB0aGlzLnVwZGF0ZVBsYXllclJvc3RlciA9IGZ1bmN0aW9uKG5ld1BsYXllckRhdGEpIHtcbiAgICAgICAgdGhpcy5wbGF5ZXJzWzBdLnNjb3JlID0gbmV3UGxheWVyRGF0YVswXS5zY29yZTtcbiAgICAgICAgdGhpcy5wbGF5ZXJzWzFdLnNjb3JlID0gbmV3UGxheWVyRGF0YVsxXS5zY29yZTtcbiAgICB9O1xuXG4gICAgdGhpcy51cGRhdGVWZXJ0aWNpZXMgPSBmdW5jdGlvbihuZXdWZXJ0ZXhEYXRhKSB7XG4gICAgICAgIHRoaXMudmVydGljaWVzW25ld1ZlcnRleERhdGFbMF0uaWRdLmFkamFjZW5jeUxpc3QgPSBuZXdWZXJ0ZXhEYXRhWzBdLmFkamFjZW5jeUxpc3Q7XG4gICAgICAgIHRoaXMudmVydGljaWVzW25ld1ZlcnRleERhdGFbMV0uaWRdLmFkamFjZW5jeUxpc3QgPSBuZXdWZXJ0ZXhEYXRhWzFdLmFkamFjZW5jeUxpc3Q7XG4gICAgfTtcblxuICAgIHRoaXMuZ2V0UGxheWVyTmFtZSA9IGZ1bmN0aW9uKGluZGV4KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnBsYXllcnNbaW5kZXhdLm5hbWU7XG4gICAgfTtcblxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAvL1RoaXMgaXMgc28gdGhlIGRvdHMgYXJlIG5vdCBidXR0ZWQgdXAgYWdhaW5zdCB0aGUgZWRnZXMgb2YgdGhlIGNhbnZhc1xuICAgIHZhciBwYWRkaW5nID0gNTtcbiAgICB0aGlzLmRyYXdHYXAgPSA0NTtcbiAgICBfLmVhY2goc2VydmVyU2lkZVRhYmxlLnZlcnRpY2llcywgZnVuY3Rpb24odmVydGV4KSB7XG4gICAgICAgIHZhciBkcmF3WSA9ICh2ZXJ0ZXgucmVsYXRpb25hbENvb3JkaW5hdGVzLnkgKiBzZWxmLmRyYXdHYXAgKyBwYWRkaW5nKTtcbiAgICAgICAgdmFyIGRyYXdYID0gKHZlcnRleC5yZWxhdGlvbmFsQ29vcmRpbmF0ZXMueCAqIHNlbGYuZHJhd0dhcCArIHBhZGRpbmcpO1xuICAgICAgICBzZWxmLnZlcnRpY2llcy5wdXNoKG5ldyBhcHAuRG90KHZlcnRleC5pZCwgdmVydGV4LnJlbGF0aW9uYWxDb29yZGluYXRlcy54LCB2ZXJ0ZXgucmVsYXRpb25hbENvb3JkaW5hdGVzLnksIGRyYXdYLCBkcmF3WSkpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5pc0N1cnJlbnRUdXJuID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiAodGhpcy5wbGF5ZXJzW3RoaXMuY3VycmVudFR1cm5dLm5hbWUgPT09IHVzZXJOYW1lKTtcbiAgICB9O1xuXG4gICAgdGhpcy5wbGF5ZXJzID0gXy5tYXAoc2VydmVyU2lkZVRhYmxlLnBsYXllcnMsIGZ1bmN0aW9uKHBsYXllcikgeyByZXR1cm4gbmV3IGFwcC5QbGF5ZXIocGxheWVyLnVzZXJOYW1lKTsgfSk7XG4gICAgdGhpcy5tZXNzYWdlcyA9IFtdO1xuICAgIHRoaXMuZ2FtZVN0YXRlID0gMDtcbn07XG4iLCJhcHAuVmlld01vZGVsID0gbmV3IGZ1bmN0aW9uKCkge1xuICAgIHZhciB2bSA9IHt9O1xuICAgIHZtLmluaXQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdm0uYXZhaWxhYmxlVGFibGVzID0ge307XG4gICAgICAgIHZtLmN1cnJlbnRUYWJsZTtcbiAgICAgICAgdm0uY2xpZW50RXJyb3IgPSBcIlwiO1xuICAgICAgICB2bS5jdXJyZW50U2NyZWVuID0gXCJsb2JieVwiO1xuICAgICAgICB2bS5zb2NrZXQ7XG4gICAgICAgIHZtLkNsaWVudEVycm9yID0gXCJcIjtcbiAgICAgICAgdm0ucmVzZXRUYWJsZSA9IHRydWU7XG5cbiAgICAgICAgdm0ubXlOYW1lID0gdXNlck5hbWU7XG4gICAgICAgIHZtLnRhYmxlTm90aWNlID0gXCJXYWl0aW5nIGZvciBhbiBvcHBvbmVudC4uLlwiO1xuICAgICAgICAvLyBBIGJ1ZmZlciB0byBkZXRlcm1pbmUgd2hhdCBuZWVkcyB0byBiZSBkcmF3biBvbiB0aGUgY2FudmFzXG4gICAgICAgIHZtLmRyYXdpbmdCdWZmZXIgPSB7fTtcbiAgICAgICAgLy9TaW1wbHkgYmluZGluZyB2bSBtYXkgY2F1c2UgcHJvYmxlbXMgc28gd2Ugb3B0IHRvIHVzZSBhIHJlZmVyZW5jZSBsaWtlIHRoZSBmb2xsb3dpbmdcbiAgICAgICAgdm0uaW5pdGlhbGl6ZVNvY2tldCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIGV2ZW50SGFuZGxlcnMgPSB7XG4gICAgICAgICAgICAgICAgXCJmcmVzaC10YWJsZS1saXN0XCI6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgXy5tZXJnZSh2bS5hdmFpbGFibGVUYWJsZXMsIGRhdGEudGFibGVMaXN0KTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwidGFibGUtb3BlbmVkXCI6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgXy5tZXJnZSh2bS5hdmFpbGFibGVUYWJsZXMsIGRhdGEubmV3VGFibGUpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJ0YWJsZS1jbG9zZWRcIjogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICBpZih2bS5hdmFpbGFibGVUYWJsZXNbZGF0YS5yb29tSWRdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgdm0uYXZhaWxhYmxlVGFibGVzW2RhdGEucm9vbUlkXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJyZXR1cm4tdG8tbG9iYnlcIjogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICB2bS5jdXJyZW50U2NyZWVuID0gXCJsb2JieVwiO1xuICAgICAgICAgICAgICAgIH0sICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgXCJqb2luZWQtdGFibGVcIjogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICB2bS5jcmVhdGVHcmlkRGltZW5zaW9uKFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB2bS50YWJsZVBhc3N3b3JkKFwiXCIpO1xuICAgICAgICAgICAgICAgICAgICB2bS5qb2luUGFzc3dvcmQoXCJcIik7XG4gICAgICAgICAgICAgICAgICAgIHZtLnByb3NwZWN0aXZlVGFibGVJZChcIlwiKTtcbiAgICAgICAgICAgICAgICAgICAgdm0uY2xpZW50RXJyb3IgPSBcIlwiIDtcbiAgICAgICAgICAgICAgICAgICAgdm0uaXNWZXJpZnlpbmdQYXNzd29yZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB2bS50YWJsZUNyZWF0aW9uSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB2bS5jdXJyZW50VGFibGUgPSBuZXcgYXBwLlRhYmxlKGRhdGEudGFibGUsIHZtLm15TmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIHZtLmN1cnJlbnRTY3JlZW4gPSBcImdhbWVUYWJsZVwiO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJnaXZlLXVwXCI6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZtLmN1cnJlbnRUYWJsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdm0uY3VycmVudFRhYmxlLmdhbWVTdGF0ZSA9IDM7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdm0udGFibGVOb3RpY2UgPSBcIlRoZSBvcHBvbmVudCBoYXMgbGVmdCB0aGUgZ2FtZS4gWW91IHdpbiBieSBkZWZhdWx0IVwiO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJhbm90aGVyLXBsYXllci1qb2luZWQtdGFibGVcIjogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICB2bS5jdXJyZW50VGFibGUucGxheWVycy5wdXNoKG5ldyBhcHAuUGxheWVyKGRhdGEubmV3UGxheWVyKSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInBsYXllci1sZWZ0LXRhYmxlXCI6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEudXNlck5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIF8ucmVtb3ZlKHZtLmN1cnJlbnRUYWJsZS5wbGF5ZXJzLCBmdW5jdGlvbihwbGF5ZXIpIHsgcmV0dXJuIHBsYXllci51c2VyTmFtZSA9PT0gZGF0YS51c2VyTmFtZTsgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwibmV3LW1vdmVcIjogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICB2bS5jdXJyZW50VGFibGUuY3VycmVudFNlbGVjdGlvbiA9IFtdO1xuICAgICAgICAgICAgICAgICAgICB2bS5zZW5kaW5nTW92ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgdm0uY3VycmVudFRhYmxlLnVwZGF0ZVBsYXllclJvc3RlcihkYXRhLnVwZGF0ZWRQbGF5ZXJSb3N0ZXIpO1xuICAgICAgICAgICAgICAgICAgICB2bS5jdXJyZW50VGFibGUudXBkYXRlVmVydGljaWVzKGRhdGEuY29ubmVjdGVkVmVydGljaWVzKTtcblxuICAgICAgICAgICAgICAgICAgICB2bS5kcmF3aW5nQnVmZmVyID0ge3BsYXllckluZGV4OiB2bS5jdXJyZW50VGFibGUuY3VycmVudFR1cm4sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogW3ZtLmN1cnJlbnRUYWJsZS52ZXJ0aWNpZXNbZGF0YS5jb25uZWN0ZWRWZXJ0aWNpZXNbMF0uaWRdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2bS5jdXJyZW50VGFibGUudmVydGljaWVzW2RhdGEuY29ubmVjdGVkVmVydGljaWVzWzFdLmlkXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF19O1xuICAgICAgICAgICAgICAgICAgICBpZiAoIV8uaXNFbXB0eShkYXRhLm5ld1NxdWFyZXMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2bS5kcmF3aW5nQnVmZmVyLnNxdWFyZXMgPSBkYXRhLm5ld1NxdWFyZXM7XG4gICAgICAgICAgICAgICAgICAgIH0gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgdm0uY3VycmVudFRhYmxlLmN1cnJlbnRUdXJuID0gZGF0YS5uZXh0VHVybjtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YS53aW5uZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2bS5jdXJyZW50VGFibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2bS5jdXJyZW50VGFibGUuZ2FtZVN0YXRlID0gMjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHZtLnRhYmxlTm90aWNlID0gZGF0YS53aW5uZXIgKyBcIiBoYXMgd29uXCI7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2bS50YWJsZU5vdGljZSA9IFwiSXQncyBcIiArIHZtLmN1cnJlbnRUYWJsZS5wbGF5ZXJzW3ZtLmN1cnJlbnRUYWJsZS5jdXJyZW50VHVybl0ubmFtZSArIFwiJ3MgdHVyblwiO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInN0YXJ0LWdhbWVcIjogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHZtLmN1cnJlbnRUYWJsZS5nYW1lU3RhdGUgPSAxO1xuICAgICAgICAgICAgICAgICAgICB2bS50YWJsZU5vdGljZSA9IFwiSXQncyBcIiArIHZtLmN1cnJlbnRUYWJsZS5wbGF5ZXJzW3ZtLmN1cnJlbnRUYWJsZS5jdXJyZW50VHVybl0ubmFtZSArIFwiIHR1cm5cIjtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwic2VydmVyLWVycm9yXCI6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoKGRhdGEuZXJyb3JDb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJFTk9UUkVHSVNURVJFRFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uID0gXCIvXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIkVOT1RBQkxFXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB2bS5jdXJyZW50U2NyZWVuID0gXCJsb2JieVwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgdm0uY2xpZW50RXJyb3IgPSBcIldlIGNvdWxkIG5vdCBmaW5kIHRoZSB0YWJsZSB5b3Ugd2VyZSB0cnlpbmcgdG8gam9pblwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJFVEFCTEVGVUxMXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB2bS5jdXJyZW50U2NyZWVuID0gXCJsb2JieVwiOyAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgdm0uY2xpZW50RXJyb3IgPSBcIlRoZSB0YWJsZSB5b3UgdHJpZWQgdG8gam9pbiBpcyBmdWxsXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIkVXUk9OR1BBU1NXT1JEXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB2bS5pc1ZlcmlmeWluZ1Bhc3N3b3JkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB2bS5jbGllbnRFcnJvciA9IFwiVGhlIHBhc3N3b3JkIHlvdSBpbnB1dCB3YXMgaW5jb3JyZWN0XCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIkVUQUJMRUxPQ0tFRFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgdm0uY3VycmVudFNjcmVlbiA9IFwibG9iYnlcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZtLmNsaWVudEVycm9yID0gXCJUaGUgdGFibGUgaXMgY3VycmVudGx5IGxvY2tlZFwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICB2bS5jbGllbnRFcnJvciA9IFwiQW4gZXJyb3IgaGFzIG9jY3VyZWQgb24gdGhlIHNlcnZlci4uLlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB2bS5zb2NrZXQgPSBpbyhcImh0dHA6Ly9sb2NhbGhvc3Q6ODA4MFwiKTtcbiAgICAgICAgICAgIC8vZXZlbnQgYmluZGluZyBwaGFzZVxuICAgICAgICAgICAgXy5lYWNoKGV2ZW50SGFuZGxlcnMsIGZ1bmN0aW9uKGhhbmRsZXIsIGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgdm0uc29ja2V0Lm9uKGV2ZW50LCBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIG0uc3RhcnRDb21wdXRhdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICBoYW5kbGVyKGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICBtLmVuZENvbXB1dGF0aW9uKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHZtLnNvY2tldC5lbWl0KFwicmVxdWVzdC1pbml0aWFsLXRhYmxlLWxpc3RcIik7XG4gICAgICAgIH07XG5cbiAgICAgICAgdm0uaW5pdGlhbGl6ZVNvY2tldCgpO1xuXG4gICAgICAgIC8vZXZlbnRIYW5kbGVyc1xuICAgICAgICB2bS5jcmVhdGVUYWJsZVByb21wdCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdm0uY3VycmVudFNjcmVlbiA9IFwiY3JlYXRlVGFibGVcIjtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBUYWJsZSBjcmVhdGlvbiBwYXJhbWV0ZXJzXG4gICAgICAgIHZtLmNyZWF0ZUdyaWREaW1lbnNpb24gPSBtLnByb3AoXCJcIik7XG4gICAgICAgIHZtLnRhYmxlUGFzc3dvcmQgPSBtLnByb3AoXCJcIik7XG4gICAgICAgIHZtLmNyZWF0ZVRhYmxlRXJyb3IgPSBtLnByb3AoKTtcbiAgICAgICAgdm0udGFibGVDcmVhdGlvbkluUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICAgICAgdm0uY3JlYXRlVGFibGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChfLmlzRW1wdHkodm0uY3JlYXRlR3JpZERpbWVuc2lvbigpKSB8fCAhXy5pc051bWJlcihOdW1iZXIodm0uY3JlYXRlR3JpZERpbWVuc2lvbigpKSkgfHwgTnVtYmVyKHZtLmNyZWF0ZUdyaWREaW1lbnNpb24oKSkgPiA1IHx8IE51bWJlcih2bS5jcmVhdGVHcmlkRGltZW5zaW9uKCkpIDwgMikge1xuICAgICAgICAgICAgICAgIHZtLmNyZWF0ZVRhYmxlRXJyb3IoXCJQbGVhc2Ugc3BlY2lmeSB0aGUgZ3JpZCBzaXplIG9mIHRoZSB0YWJsZSB3aXRoIGEgc2luZ2xlIG51bWJlciAoMi01KVwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGNyZWF0ZVRhYmxlUGFyYW1ldGVycyA9IHtkaW1lbnNpb25zOk51bWJlcih2bS5jcmVhdGVHcmlkRGltZW5zaW9uKCkpfTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAoIV8uaXNFbXB0eSgkLnRyaW0odm0udGFibGVQYXNzd29yZCgpKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3JlYXRlVGFibGVQYXJhbWV0ZXJzLnBhc3N3b3JkID0gJC50cmltKHZtLnRhYmxlUGFzc3dvcmQoKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHZtLnNvY2tldC5lbWl0KFwiY3JlYXRlLXRhYmxlXCIsIGNyZWF0ZVRhYmxlUGFyYW1ldGVycyk7XG4gICAgICAgICAgICAgICAgdm0udGFibGVDcmVhdGlvbkluUHJvZ3Jlc3MgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9O1xuICAgICAgICB2bS5jYW5jZWxDcmVhdGVUYWJsZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdm0uY3JlYXRlVGFibGVFcnJvcihcIlwiKTtcbiAgICAgICAgICAgIHZtLmN1cnJlbnRTY3JlZW4gPSBcImxvYmJ5XCI7XG4gICAgICAgICAgICB2bS5jcmVhdGVHcmlkRGltZW5zaW9uKFwiXCIpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgdm0ucHJvc3BlY3RpdmVUYWJsZUlkID0gbS5wcm9wKFwiXCIpO1xuICAgICAgICB2bS5qb2luVGFibGUgPSBmdW5jdGlvbih0YWJsZUlkLCBuZWVkc1Bhc3N3b3JkKSB7XG4gICAgICAgICAgICB2bS5jdXJyZW50U2NyZWVuID0gXCJsb2FkaW5nXCI7XG4gICAgICAgICAgICB2bS5wcm9zcGVjdGl2ZVRhYmxlSWQodGFibGVJZCk7XG4gICAgICAgICAgICBpZiAobmVlZHNQYXNzd29yZCkge1xuICAgICAgICAgICAgICAgIHZtLmN1cnJlbnRTY3JlZW4gPSBcInBhc3N3b3JkXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZtLnNvY2tldC5lbWl0KFwiam9pbi10YWJsZVwiLCB7dGFibGVJZDogdGFibGVJZH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vTWFpbmx5IHVzZWQgd2hlbiBhIHBhc3N3b3JkIGlzIGluIHBsYWNlXG4gICAgICAgIHZtLmpvaW5QYXNzd29yZCA9IG0ucHJvcChcIlwiKTtcbiAgICAgICAgdm0uaXNWZXJpZnlpbmdQYXNzd29yZCA9IGZhbHNlO1xuICAgICAgICB2bS52ZXJpZnlQYXNzd29yZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKCFfLmlzRW1wdHkodm0ucHJvc3BlY3RpdmVUYWJsZUlkKCkpICYmICFfLmlzRW1wdHkodm0uam9pblBhc3N3b3JkKCkpKSB7XG4gICAgICAgICAgICAgICAgdm0uY2xpZW50RXJyb3IgPSBcIlwiO1xuICAgICAgICAgICAgICAgIHZtLmlzVmVyaWZ5aW5nUGFzc3dvcmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHZtLnNvY2tldC5lbWl0KFwiam9pbi10YWJsZVwiLCB7dGFibGVJZDogdm0ucHJvc3BlY3RpdmVUYWJsZUlkKCksIHBhc3N3b3JkOiB2bS5qb2luUGFzc3dvcmQoKX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9O1xuICAgICAgICB2bS5jYW5jZWxKb2luVGFibGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZtLmNsaWVudEVycm9yID0gXCJcIjtcbiAgICAgICAgICAgIHZtLmpvaW5QYXNzd29yZChcIlwiKTtcbiAgICAgICAgICAgIHZtLnByb3NwZWN0aXZlVGFibGVJZChcIlwiKTtcbiAgICAgICAgICAgIHZtLmN1cnJlbnRTY3JlZW4gPSBcImxvYmJ5XCI7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy9zZWxlY3Rpb24gaGFuZGxlcnNcbiAgICAgICAgdm0uc2VuZGluZ01vdmUgPSBmYWxzZTtcbiAgICAgICAgdm0uYWNjZXB0U2VsZWN0aW9uID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2bS5zZW5kaW5nTW92ZSA9IHRydWU7XG4gICAgICAgICAgICB2bS5zb2NrZXQuZW1pdChcInJlY29yZC1tb3ZlXCIsIHt2ZXJ0aWNpZXM6IGFwcC5WaWV3TW9kZWwuY3VycmVudFRhYmxlLmN1cnJlbnRTZWxlY3Rpb259KTtcbiAgICAgICAgfTtcbiAgICAgICAgdm0uY2FuY2VsU2VsZWN0aW9uID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2bS5jdXJyZW50VGFibGUuY3VycmVudFNlbGVjdGlvbiA9IFtdO1xuICAgICAgICB9O1xuXG4gICAgICAgIHZtLnJldHVyblRvTG9iYnkgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZtLmN1cnJlbnRUYWJsZSA9IG51bGw7XG4gICAgICAgICAgICB2bS5jdXJyZW50U2NyZWVuID0gXCJsb2FkaW5nXCI7XG4gICAgICAgICAgICB2bS5yZXNldFRhYmxlID0gdHJ1ZTtcbiAgICAgICAgICAgIHZtLnNvY2tldC5lbWl0KFwibGVhdmUtdGFibGVcIik7XG4gICAgICAgIH07XG4gICAgfTtcbiAgICByZXR1cm4gdm07XG59O1xuIiwidmFyIGNoZWNrQ3VycmVudFNjcmVlbiA9IGZ1bmN0aW9uKHNjcmVlbk5hbWUpIHtcbiAgICB2YXIgZGlzcGxheVByb3BlcnR5ID0gKGFwcC5WaWV3TW9kZWwuY3VycmVudFNjcmVlbiA9PT0gc2NyZWVuTmFtZSkgPyBcImRpc3BsYXk6aW5oZXJpdFwiIDogXCJkaXNwbGF5Om5vbmVcIjtcbiAgICByZXR1cm4gZGlzcGxheVByb3BlcnR5O1xufTtcblxudmFyIGxvYWRpbmdWaWV3ID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG0oXCJkaXZcIiwge3N0eWxlOiBjaGVja0N1cnJlbnRTY3JlZW4oXCJsb2FkaW5nXCIpfSwgW1xuICAgICAgICBtKFwiZGl2LnJvd1wiLCBbXG4gICAgICAgICAgICBtKFwiZGl2LmNvbC14cy0xMlwiLCBbXG4gICAgICAgICAgICAgICAgbShcImltZy5wcmVsb2FkZXJbc3JjPS9zdGF0aWMvYXNzZXRzL3ByZWxvYWRlci5naWZcIiwgXCJMb2FkaW5nLi4uXCIpXG4gICAgICAgICAgICBdKVxuICAgICAgICBdKVxuICAgIF0pO1xufTtcblxudmFyIExvYmJ5VmlldyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBpc0VtcHR5ID0gXy5pc0VtcHR5KGFwcC5WaWV3TW9kZWwuYXZhaWxhYmxlVGFibGVzKTtcbiAgICB2YXIgZW1wdHlEaXNwbGF5ID0gaXNFbXB0eSA/IFwiZGlzcGxheTppbmhlcml0XCIgOiBcImRpc3BsYXk6bm9uZVwiO1xuICAgIHZhciBsb2JieURpc3BsYXkgPSBpc0VtcHR5ID8gXCJkaXNwbGF5Om5vbmVcIiA6IFwiZGlzcGxheTppbmhlcml0XCI7XG5cbiAgICByZXR1cm4gbShcImRpdlwiLCB7c3R5bGU6IGNoZWNrQ3VycmVudFNjcmVlbihcImxvYmJ5XCIpfSwgW1xuICAgICAgICBtKFwiZGl2LnJvd1wiLCBbXG4gICAgICAgICAgICBtKFwiZGl2LmNvbC14cy0xMlwiLCBbXG4gICAgICAgICAgICAgICAgbShcImJ1dHRvbi5idG4uYnRuLXByaW1hcnlcIiwge29uY2xpY2s6IGFwcC5WaWV3TW9kZWwuY3JlYXRlVGFibGVQcm9tcHR9LCBcIkNyZWF0ZSBUYWJsZVwiKVxuICAgICAgICAgICAgXSksXG4gICAgICAgIF0pLFxuICAgICAgICBtKFwiZGl2LnJvd1wiLCBbXG4gICAgICAgICAgICBtKFwiZGl2LmNvbC14cy0xMlwiLCBbXG4gICAgICAgICAgICAgICAgbShcInNwYW5cIiwge2Rpc3BsYXk6ZW1wdHlEaXNwbGF5fSwgXCJUaGVyZSBhcmUgbm8gdGFibGVzIGN1cnJlbnRseSBvcGVuLiBXZSB3aWxsIHVwZGF0ZSB5b3UgYXMgdGFibGVzIG9wZW4sIG9yIHlvdSBtYXkgY3JlYXRlIHlvdXIgb3duIHVzaW5nIHRoZSBDcmVhdGUgVGFibGUgYWJvdmVcIiksXG4gICAgICAgICAgICAgICAgbShcImRpdlwiLCB7ZGlzcGxheTpsb2JieURpc3BsYXl9LCBfLm1hcChhcHAuVmlld01vZGVsLmF2YWlsYWJsZVRhYmxlcywgZnVuY3Rpb24odGFibGUsIGtleSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIG0oXCJkaXZcIiwgW1xuICAgICAgICAgICAgICAgICAgICAgIG0oXCJzcGFuXCIsICh0YWJsZS50YWJsZU93bmVyICsgXCIncyB0YWJsZS4gXCIgKyB0YWJsZS5kaW1lbnNpb25zICsgXCJ4XCIgKyB0YWJsZS5kaW1lbnNpb25zICsgXCIgZ3JpZFwiKSksXG4gICAgICAgICAgICAgICAgICAgICAgbShcImJ1dHRvbi5idG4uYnRuLXByaW1hcnlcIiwge29uY2xpY2s6IGFwcC5WaWV3TW9kZWwuam9pblRhYmxlLmJpbmQoYXBwLlZpZXdNb2RlbCwga2V5LCB0YWJsZS5uZWVkc1Bhc3N3b3JkKX0sIFwiSm9pbiBUYWJsZVwiKVxuICAgICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICBdKVxuICAgICAgICBdKVxuICAgIF0pO1xufTtcblxudmFyIENyZWF0ZVRhYmxlVmlldyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBwcmVsb2FkZXJEaXNwbGF5ID0gKGFwcC5WaWV3TW9kZWwudGFibGVDcmVhdGlvbkluUHJvZ3Jlc3MpID8gXCJkaXNwbGF5OmluaGVyaXRcIiA6IFwiZGlzcGxheTpub25lXCI7XG4gICAgdmFyIGZvcm1EaXNwbGF5ID0gKGFwcC5WaWV3TW9kZWwudGFibGVDcmVhdGlvbkluUHJvZ3Jlc3MpID8gXCJkaXNwbGF5Om5vbmVcIiA6IFwiZGlzcGxheTppbmhlcml0XCI7XG4gICAgXG4gICAgcmV0dXJuIG0oXCJkaXZcIiwge3N0eWxlOiBjaGVja0N1cnJlbnRTY3JlZW4oXCJjcmVhdGVUYWJsZVwiKX0sIFtcbiAgICAgICAgbShcImRpdi5yb3dcIiwgW1xuICAgICAgICAgICAgbShcImRpdi5jb2wteHMtMTIudGV4dC1kYW5nZXJcIiwgW1xuICAgICAgICAgICAgICAgIG0oXCJkaXZcIiwgYXBwLlZpZXdNb2RlbC5jcmVhdGVUYWJsZUVycm9yKCkpXG4gICAgICAgICAgICBdKVxuICAgICAgICBdKSxcbiAgICAgICAgbShcImRpdi5yb3dcIiwge3N0eWxlOnByZWxvYWRlckRpc3BsYXl9LCBbXG4gICAgICAgICAgICBtKFwiZGl2LmNvbC14cy0xMlwiLCBbXG4gICAgICAgICAgICAgICAgbShcImRpdlwiLCBbXG4gICAgICAgICAgICAgICAgICAgIG0oXCJpbWcucHJlbG9hZGVyW3NyYz0vc3RhdGljL2Fzc2V0cy9wcmVsb2FkZXIuZ2lmXVwiKSxcbiAgICAgICAgICAgICAgICAgICAgbShcInNwYW5cIiwgXCJDcmVhdGluZyB0YWJsZS4uLlwiKVxuICAgICAgICAgICAgICAgIF0pXG4gICAgICAgICAgICBdKVxuICAgICAgICBdKSxcbiAgICAgICAgbShcImRpdi5yb3dcIiwge3N0eWxlOmZvcm1EaXNwbGF5fSwgW1xuICAgICAgICAgICAgbShcImRpdi5jb2wteHMtMTJcIiwgW1xuICAgICAgICAgICAgICAgIG0oXCJkaXZcIiwgXCJUaGlzIGdhbWUgaXMgcGxheWVkIG9uIGEgc3F1YXJlIGdyaWQgcmFuZ2luZyBmcm9tIGEgMngyIGdyaWQgdG8gYSA1eDUgZ3JpZC4gSW5wdXQgYSBzaW5nbGUgbnVtYmVyIGJlbG93IHRvIGNyZWF0ZSBhIGdyaWQuIE9wdGlvbmFsbHksIHlvdSBtYXkgaW5wdXQgYSBwYXNzd29yZCB0byBtYWtlIHRoZSBnYW1lIHByaXZhdGUgKGJlIHN1cmUgdG8gZ2l2ZSB0aGUgb3RoZXIgcGxheWVyIHRoZSBwYXNzd29yZCBzbyB0aGV5IGNhbiBnZXQgaW4gdGhlIHJvb21cIiksXG4gICAgICAgICAgICAgICAgbShcImZvcm1cIiwgW1xuICAgICAgICAgICAgICAgICAgICBtKFwiZGl2LmZvcm0tZ3JvdXBcIiwgW1xuICAgICAgICAgICAgICAgICAgICAgICAgbShcImlucHV0LmZvcm0tY29udHJvbFt0eXBlPXRleHRdXCIsIHtvbmNoYW5nZTogbS53aXRoQXR0cihcInZhbHVlXCIsIGFwcC5WaWV3TW9kZWwuY3JlYXRlR3JpZERpbWVuc2lvbiksIHBsYWNlaG9sZGVyOlwiR3JpZCBzaXplICgxMCBtYXhpbXVtKVwiLCB2YWx1ZTphcHAuVmlld01vZGVsLmNyZWF0ZUdyaWREaW1lbnNpb24oKX0pLFxuICAgICAgICAgICAgICAgICAgICAgICAgbShcImlucHV0LmZvcm0tY29udHJvbFt0eXBlPXBhc3N3b3JkXVwiLCB7b25jaGFuZ2U6IG0ud2l0aEF0dHIoXCJ2YWx1ZVwiLCBhcHAuVmlld01vZGVsLnRhYmxlUGFzc3dvcmQpLCBwbGFjZWhvbGRlcjpcIlRhYmxlIHBhc3N3b3JkIChvcHRpb25hbCBmb3IgcHJpdmF0ZSBnYW1lcylcIiwgdmFsdWU6YXBwLlZpZXdNb2RlbC50YWJsZVBhc3N3b3JkKCl9KSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG0oXCJidXR0b24uYnRuLmJ0bi1wcmltYXJ5XCIsIHtvbmNsaWNrOiBhcHAuVmlld01vZGVsLmNyZWF0ZVRhYmxlfSwgXCJDcmVhdGUgVGFibGVcIiksXG4gICAgICAgICAgICAgICAgICAgICAgICBtKFwiYnV0dG9uLmJ0bi5idG4tZGFuZ2VyXCIsIHtvbmNsaWNrOiBhcHAuVmlld01vZGVsLmNhbmNlbENyZWF0ZVRhYmxlfSwgXCJDYW5jZWxcIilcbiAgICAgICAgICAgICAgICAgICAgXSlcbiAgICAgICAgICAgICAgICBdKVxuICAgICAgICAgICAgXSlcbiAgICAgICAgXSlcbiAgICBdKTtcbn07XG5cbnZhciBHYW1lVGFibGVWaWV3ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHJlbmRlclRhYmxlTWVzc2FnZXMgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKGFwcC5WaWV3TW9kZWwuY3VycmVudFRhYmxlKSB7XG4gICAgICAgICAgICByZXR1cm4gXy5tYXAoYXBwLlZpZXdNb2RlbC5jdXJyZW50VGFibGUubWVzc2FnZXMsIGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbShcImRpdlwiLCBtZXNzYWdlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIHZhciBsaXN0UGxheWVycyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoYXBwLlZpZXdNb2RlbC5jdXJyZW50VGFibGUpIHtcbiAgICAgICAgICAgIHJldHVybiBfLm1hcChhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5wbGF5ZXJzLCBmdW5jdGlvbihwbGF5ZXIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbShcImRpdlwiLCAocGxheWVyLm5hbWUgKyBcIjogXCIgKyBwbGF5ZXIuc2NvcmUpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIHZhciBjYW52YXNDb25maWcgPSBmdW5jdGlvbihlbGVtZW50LCBpc0luaXQsIGNvbnRleHQpIHtcbiAgICAgICAgaWYgKCFpc0luaXQpIHtcbiAgICAgICAgICAgIGNvbnRleHQuY2FudmFzQ29udGV4dCA9IGVsZW1lbnQuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICAgICAgICAgIHZhciBjYW52YXNDbGlja0xpc3RlbmVyID0gZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoYXBwLlZpZXdNb2RlbC5jdXJyZW50VGFibGUgJiYgYXBwLlZpZXdNb2RlbC5jdXJyZW50VGFibGUuZ2FtZVN0YXRlID09PSAxICYmIGFwcC5WaWV3TW9kZWwuY3VycmVudFRhYmxlLmlzQ3VycmVudFR1cm4oKSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgeCA9IChldmVudC5wYWdlWCkgPyBldmVudC5wYWdlWCA6IChldmVudC5jbGllbnRYICsgZG9jdW1lbnQuYm9keS5zY3JvbGxMZWZ0ICsgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNjcm9sbExlZnQpO1xuICAgICAgICAgICAgICAgICAgICB2YXIgeSA9IChldmVudC5wYWdlWSkgPyBldmVudC5wYWdlWSA6IChldmVudC5jbGllbnRZICsgZG9jdW1lbnQuYm9keS5zY3JvbGxUb3AgKyBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsVG9wKTtcbiAgICAgICAgICAgICAgICAgICAgeCAtPSAkKGVsZW1lbnQpLm9mZnNldCgpLmxlZnQ7XG4gICAgICAgICAgICAgICAgICAgIHkgLT0gJChlbGVtZW50KS5vZmZzZXQoKS50b3A7XG4gICAgICAgICAgICAgICAgICAgIF8uZWFjaChhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS52ZXJ0aWNpZXMsIGZ1bmN0aW9uKHZlcnRleCwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2ZXJ0ZXguaGFzQ29sbGlkZWQoeCwgeSkgJiYgYXBwLlZpZXdNb2RlbC5jdXJyZW50VGFibGUuY3VycmVudFNlbGVjdGlvbi5sZW5ndGggPCAyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKF8uaXNFbXB0eShhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5jdXJyZW50U2VsZWN0aW9uKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5hZGRUb1NlbGVjdGlvbih2ZXJ0ZXgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2ZXJ0ZXguZHJhd01ldGhvZChcInJlZFwiLCBjb250ZXh0LmNhbnZhc0NvbnRleHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIE9ubHkgb3J0aG9nb25hbGx5IGFkamFjZW50IHNlbGVjdGlvbnMgYXJlIGFsbG93ZWQgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGFuZCBjYW4gb25seSBiZSBvbmUgdW5pdCBhd2F5LiBGdXJ0aGVybW9yZSBhIGVkZ2UgY2Fubm90IGFscmVhZHkgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIGV4aXN0IGJldHdlZW4gdGhlIHR3byBwb2ludHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2ZXJ0ZXguaWQgPT09IGFwcC5WaWV3TW9kZWwuY3VycmVudFRhYmxlLmN1cnJlbnRTZWxlY3Rpb25bMF0uaWQgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRleC5yZWxhdGlvbmFsQ29vcmRpbmF0ZXMueCA+IChhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5jdXJyZW50U2VsZWN0aW9uWzBdLnJlbGF0aW9uYWxDb29yZGluYXRlcy54ICsgMSkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRleC5yZWxhdGlvbmFsQ29vcmRpbmF0ZXMueCA8IChhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5jdXJyZW50U2VsZWN0aW9uWzBdLnJlbGF0aW9uYWxDb29yZGluYXRlcy54IC0gMSkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRleC5yZWxhdGlvbmFsQ29vcmRpbmF0ZXMueSA+IChhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5jdXJyZW50U2VsZWN0aW9uWzBdLnJlbGF0aW9uYWxDb29yZGluYXRlcy55ICsgMSkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRleC5yZWxhdGlvbmFsQ29vcmRpbmF0ZXMueSA8IChhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5jdXJyZW50U2VsZWN0aW9uWzBdLnJlbGF0aW9uYWxDb29yZGluYXRlcy55IC0gMSkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICgodmVydGV4LnJlbGF0aW9uYWxDb29yZGluYXRlcy54ID09PSBhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5jdXJyZW50U2VsZWN0aW9uWzBdLnJlbGF0aW9uYWxDb29yZGluYXRlcy54ICsgMSkgJiYgKHZlcnRleC5yZWxhdGlvbmFsQ29vcmRpbmF0ZXMueSA9PT0gYXBwLlZpZXdNb2RlbC5jdXJyZW50VGFibGUuY3VycmVudFNlbGVjdGlvblswXS5yZWxhdGlvbmFsQ29vcmRpbmF0ZXMueSArIDEpKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKCh2ZXJ0ZXgucmVsYXRpb25hbENvb3JkaW5hdGVzLnggPT09IGFwcC5WaWV3TW9kZWwuY3VycmVudFRhYmxlLmN1cnJlbnRTZWxlY3Rpb25bMF0ucmVsYXRpb25hbENvb3JkaW5hdGVzLnggLTEpICYmICh2ZXJ0ZXgucmVsYXRpb25hbENvb3JkaW5hdGVzLnkgPT09IGFwcC5WaWV3TW9kZWwuY3VycmVudFRhYmxlLmN1cnJlbnRTZWxlY3Rpb25bMF0ucmVsYXRpb25hbENvb3JkaW5hdGVzLnkgKyAxKSkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICgodmVydGV4LnJlbGF0aW9uYWxDb29yZGluYXRlcy54ID09PSBhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5jdXJyZW50U2VsZWN0aW9uWzBdLnJlbGF0aW9uYWxDb29yZGluYXRlcy54IC0gMSkgJiYgKHZlcnRleC5yZWxhdGlvbmFsQ29vcmRpbmF0ZXMueSA9PT0gYXBwLlZpZXdNb2RlbC5jdXJyZW50VGFibGUuY3VycmVudFNlbGVjdGlvblswXS5yZWxhdGlvbmFsQ29vcmRpbmF0ZXMueSAtIDEpKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKCh2ZXJ0ZXgucmVsYXRpb25hbENvb3JkaW5hdGVzLnggPT09IGFwcC5WaWV3TW9kZWwuY3VycmVudFRhYmxlLmN1cnJlbnRTZWxlY3Rpb25bMF0ucmVsYXRpb25hbENvb3JkaW5hdGVzLnggKyAxKSAmJiAodmVydGV4LnJlbGF0aW9uYWxDb29yZGluYXRlcy55ID09PSBhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5jdXJyZW50U2VsZWN0aW9uWzBdLnJlbGF0aW9uYWxDb29yZGluYXRlcy55IC0gMSkpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoXy5pbmNsdWRlcyhhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5jdXJyZW50U2VsZWN0aW9uWzBdLmFkamFjZW5jeUxpc3QsIHZlcnRleC5pZCkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5jdXJyZW50U2VsZWN0aW9uWzBdLmRyYXdNZXRob2QoXCJibGFja1wiLCBjb250ZXh0LmNhbnZhc0NvbnRleHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXBwLlZpZXdNb2RlbC5jdXJyZW50VGFibGUuY3VycmVudFNlbGVjdGlvbiA9IFt2ZXJ0ZXhdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmVydGV4LmRyYXdNZXRob2QoXCJyZWRcIiwgY29udGV4dC5jYW52YXNDb250ZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG0uc3RhcnRDb21wdXRhdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXBwLlZpZXdNb2RlbC5jdXJyZW50VGFibGUuYWRkVG9TZWxlY3Rpb24odmVydGV4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZlcnRleC5kcmF3TWV0aG9kKFwicmVkXCIsIGNvbnRleHQuY2FudmFzQ29udGV4dCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtLmVuZENvbXB1dGF0aW9uKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9ICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGFsZXJ0KFwiSXQgaXMgbm90IHlvdXIgdHVyblwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWRvd25cIiwgY2FudmFzQ2xpY2tMaXN0ZW5lcik7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZHJhd0xpbmUgPSBmdW5jdGlvbih2ZXJ0ZXhQYWlyKSB7XG4gICAgICAgICAgICB2YXIgbGluZVNpemUgPSBhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5kcmF3R2FwIC0gdmVydGV4UGFpclswXS5zaXplIC0gNDtcbiAgICAgICAgICAgIGNvbnRleHQuY2FudmFzQ29udGV4dC5maWxsU3R5bGUgPSBcIiMwMDAwMDBcIjtcbiAgICAgICAgICAgIGlmICh2ZXJ0ZXhQYWlyWzBdLnJlbGF0aW9uYWxDb29yZGluYXRlcy55ID09PSB2ZXJ0ZXhQYWlyWzFdLnJlbGF0aW9uYWxDb29yZGluYXRlcy55KSB7XG4gICAgICAgICAgICAgICAgY29udGV4dC5jYW52YXNDb250ZXh0LmZpbGxSZWN0KCh2ZXJ0ZXhQYWlyWzBdLnJpZ2h0KCkrMiksIHZlcnRleFBhaXJbMF0uZHJhd0Nvb3JkaW5hdGVzLnksIGxpbmVTaXplLCB2ZXJ0ZXhQYWlyWzBdLnNpemUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb250ZXh0LmNhbnZhc0NvbnRleHQuZmlsbFJlY3QodmVydGV4UGFpclswXS5kcmF3Q29vcmRpbmF0ZXMueCwgKHZlcnRleFBhaXJbMF0uYm90dG9tKCkgKyAyKSwgdmVydGV4UGFpclswXS5zaXplLCBsaW5lU2l6ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBfLmVhY2godmVydGV4UGFpciwgZnVuY3Rpb24odmVydGV4KSB7IFxuICAgICAgICAgICAgICAgIHZlcnRleC5kcmF3TWV0aG9kKFwiIzAwMDAwMFwiLGNvbnRleHQuY2FudmFzQ29udGV4dCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgbWFya1NxdWFyZSA9IGZ1bmN0aW9uKG1hcmssIGRvdCkge1xuICAgICAgICAgICAgdmFyIGluaXRpYWwgPSBtYXJrWzBdO1xuICAgICAgICAgICAgdmFyIHggPSBkb3QubGVmdCgpICsgKGFwcC5WaWV3TW9kZWwuY3VycmVudFRhYmxlLmRyYXdHYXAvMi4pO1xuICAgICAgICAgICAgdmFyIHkgPSBkb3QuYm90dG9tKCkgKyAoYXBwLlZpZXdNb2RlbC5jdXJyZW50VGFibGUuZHJhd0dhcC8yLik7XG4gICAgICAgICAgICBjb250ZXh0LmNhbnZhc0NvbnRleHQuZmlsbFN0eWxlID0gXCIjMDAwMDAwXCI7XG4gICAgICAgICAgICBjb250ZXh0LmNhbnZhc0NvbnRleHQuZm9udCA9IFwiMTVweCBzYW5zLXNlcmlmXCI7XG4gICAgICAgICAgICBjb250ZXh0LmNhbnZhc0NvbnRleHQuZmlsbFRleHQoaW5pdGlhbCwgeCwgeSk7XG4gICAgICAgIH07ICAgICAgICBcbiAgICAgICAgXG4gICAgICAgIGlmIChhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZSAmJiBhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5jdXJyZW50U2VsZWN0aW9uLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgLyogV2UgcmVhbGx5IGFyZW4ndCBzdXBwb3NlZCB0byBtb2RpZnkgdGhlIHZpZXdtb2RlbCBpbiBhIGNvbmZpZyBzaW5jZSBpdCB3b3VsZFxuICAgICAgICAgICAgICogdXN1YWxseSBicmVhayByZXVzYWJpbGl0eSBidXQgdGhlIGFsdGVybmF0aXZlIGlzIGEgYml0IG1vcmUgY29tcGxpY2F0ZWQgKGVzc2VudGlhbGx5XG4gICAgICAgICAgICAgKiBoYXZlIHRoZSBzdGF0ZSBwYXNzZWQgaW4gdmlhIGEgY2xvc3VyZSlcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgaWYgKGFwcC5WaWV3TW9kZWwucmVzZXRUYWJsZSkge1xuICAgICAgICAgICAgICAgIGNvbnRleHQuY2FudmFzQ29udGV4dC5maWxsU3R5bGUgPSBcIiNmZmZmZmZcIjtcbiAgICAgICAgICAgICAgICBjb250ZXh0LmNhbnZhc0NvbnRleHQuZmlsbFJlY3QoMCwwLDY0MCw2NDApO1xuICAgICAgICAgICAgICAgIGFwcC5WaWV3TW9kZWwucmVzZXRUYWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXy5lYWNoKGFwcC5WaWV3TW9kZWwuY3VycmVudFRhYmxlLnZlcnRpY2llcywgZnVuY3Rpb24odmVydGV4KSB7XG4gICAgICAgICAgICAgICAgdmVydGV4LmRyYXdNZXRob2QoXCIjMDAwMDAwXCIsIGNvbnRleHQuY2FudmFzQ29udGV4dCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmICghXy5pc0VtcHR5KGFwcC5WaWV3TW9kZWwuZHJhd2luZ0J1ZmZlcikpIHtcbiAgICAgICAgICAgICAgICBkcmF3TGluZShhcHAuVmlld01vZGVsLmRyYXdpbmdCdWZmZXIubGluZSk7XG4gICAgICAgICAgICAgICAgaWYgKGFwcC5WaWV3TW9kZWwuZHJhd2luZ0J1ZmZlci5zcXVhcmVzKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBtYXJrU3F1YXJlUGFydGlhbCA9IF8ucGFydGlhbChtYXJrU3F1YXJlLCBhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5nZXRQbGF5ZXJOYW1lKGFwcC5WaWV3TW9kZWwuZHJhd2luZ0J1ZmZlci5wbGF5ZXJJbmRleCkpO1xuICAgICAgICAgICAgICAgICAgICBfLmVhY2goYXBwLlZpZXdNb2RlbC5kcmF3aW5nQnVmZmVyLnNxdWFyZXMsIGZ1bmN0aW9uKHNxdWFyZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWFya1NxdWFyZShhcHAuVmlld01vZGVsLmN1cnJlbnRUYWJsZS5nZXRQbGF5ZXJOYW1lKGFwcC5WaWV3TW9kZWwuZHJhd2luZ0J1ZmZlci5wbGF5ZXJJbmRleCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFwcC5WaWV3TW9kZWwuY3VycmVudFRhYmxlLnZlcnRpY2llc1tzcXVhcmUuaWRdKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFwcC5WaWV3TW9kZWwuZHJhd2luZ0J1ZmZlciA9IHt9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIHZhciBib2FyZFZpc2liaWxpdHkgPSAoYXBwLlZpZXdNb2RlbC5jdXJyZW50VGFibGUgJiYgYXBwLlZpZXdNb2RlbC5jdXJyZW50VGFibGUuZ2FtZVN0YXRlID4gMCkgPyBcImRpc3BsYXk6aW5oZXJpdFwiIDogXCJkaXNwbGF5Om5vbmVcIjtcbiAgICB2YXIgc2VsZWN0aW9uQ29udHJvbHNEaXNwbGF5ID0gKGFwcC5WaWV3TW9kZWwuY3VycmVudFRhYmxlICYmIGFwcC5WaWV3TW9kZWwuY3VycmVudFRhYmxlLmN1cnJlbnRTZWxlY3Rpb24ubGVuZ3RoID09PSAyICYmICFhcHAuVmlld01vZGVsLnNlbmRpbmdNb3ZlKSA/IFwiZGlzcGxheTppbmhlcml0XCIgOiBcImRpc3BsYXk6bm9uZVwiO1xuICAgIHZhciBzZW5kaW5nTW92ZVByZWxvYWRlciA9IChhcHAuVmlld01vZGVsLnNlbmRpbmdNb3ZlKSA/IFwiZGlzcGxheTppbmhlcml0XCIgOiBcImRpc3BsYXk6bm9uZVwiO1xuICAgIHJldHVybiBtKFwiZGl2XCIsIHtzdHlsZTogY2hlY2tDdXJyZW50U2NyZWVuKFwiZ2FtZVRhYmxlXCIpfSwgW1xuICAgICAgICBtKFwiZGl2LnJvd1wiLCBbXG4gICAgICAgICAgICBtKFwiZGl2LmNvbC14cy0xMlwiLCBbXG4gICAgICAgICAgICAgICAgbShcImJ1dHRvbi5idG4uYnRuLWRhbmdlclwiLCB7b25jbGljazogYXBwLlZpZXdNb2RlbC5yZXR1cm5Ub0xvYmJ5fSwgXCJSZXR1cm4gdG8gTG9iYnlcIilcbiAgICAgICAgICAgIF0pXG4gICAgICAgIF0pLFxuICAgICAgICBtKFwiZGl2LnJvd1wiLCBbXG4gICAgICAgICAgICBtKFwiZGl2LmNvbC14cy0xMlwiLCBbXG4gICAgICAgICAgICAgICAgbShcImRpdlwiLCBhcHAuVmlld01vZGVsLnRhYmxlTm90aWNlKVxuICAgICAgICAgICAgXSlcbiAgICAgICAgXSksXG4gICAgICAgIG0oXCJkaXYucm93XCIsIFtcbiAgICAgICAgICAgIG0oXCJkaXYuY29sLXhzLTEyXCIsIFtcbiAgICAgICAgICAgICAgICBtKFwiZGl2LnRleHQtZGFuZ2VyXCIsIGFwcC5WaWV3TW9kZWwudGFibGVFcnJvcilcbiAgICAgICAgICAgIF0pXG4gICAgICAgIF0pLFxuICAgICAgICBtKFwiZGl2LnJvd1wiLCBbXG4gICAgICAgICAgICBtKFwiZGl2LmNvbC14cy0xMlwiLCBbXG4gICAgICAgICAgICAgICAgbShcImRpdlwiLCB7c3R5bGU6c2VsZWN0aW9uQ29udHJvbHNEaXNwbGF5fSwgW1xuICAgICAgICAgICAgICAgICAgICBtKFwic3BhblwiLCBcIlNlbGVjdCB0aGVzZSB0d28gcG9pbnRzP1wiKSxcbiAgICAgICAgICAgICAgICAgICAgbShcImJ1dHRvbi5idG4uYnRuLXByaW1hcnlcIiwge29uY2xpY2s6IGFwcC5WaWV3TW9kZWwuYWNjZXB0U2VsZWN0aW9ufSwgXCJBY2NlcHRcIiksXG4gICAgICAgICAgICAgICAgICAgIG0oXCJidXR0b24uYnRuLmJ0bi1kYW5nZXJcIiwge29uY2xpY2s6IGFwcC5WaWV3TW9kZWwuY2FuY2VsU2VsZWN0aW9ufSwgXCJDYW5jZWxcIiksXG4gICAgICAgICAgICAgICAgXSksXG4gICAgICAgICAgICAgICAgbShcImRpdlwiLCB7c3R5bGU6c2VuZGluZ01vdmVQcmVsb2FkZXJ9LCBbXG4gICAgICAgICAgICAgICAgICAgIG0oXCJzcGFuXCIsIFwiU2VuZGluZyBtb3ZlLi4uXCIpLFxuICAgICAgICAgICAgICAgICAgICBtKFwiaW1nLnByZWxvYWRlcltzcmM9L3N0YXRpYy9hc3NldHMvcHJlbG9hZGVyLmdpZl1cIiwgXCJMb2FkaW5nLi4uXCIpXG4gICAgICAgICAgICAgICAgXSlcbiAgICAgICAgICAgIF0pXG4gICAgICAgIF0pLFxuICAgICAgICBtKFwiZGl2LnJvd1wiLCBbXG4gICAgICAgICAgICBtKFwiZGl2LmNvbC14cy0xMFwiLCB7c3R5bGU6IGJvYXJkVmlzaWJpbGl0eX0sIFtcbiAgICAgICAgICAgICAgICBtKFwiY2FudmFzW3dpZHRoPTY0MF1baGVpZ2h0PTY0MF1cIiwge2NvbmZpZzpjYW52YXNDb25maWd9KVxuICAgICAgICAgICAgXSksXG4gICAgICAgICAgICBtKFwiZGl2LmNvbC14cy0yXCIsIGxpc3RQbGF5ZXJzKCkpXG4gICAgICAgIF0pXG4gICAgXSk7XG59O1xuXG52YXIgUGFzc3dvcmRWaWV3ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHNob3dGb3JtID0gKGFwcC5WaWV3TW9kZWwuaXNWZXJpZnlpbmdQYXNzd29yZCkgPyBcImRpc3BsYXk6bm9uZVwiIDogXCJkaXNwbGF5OmluaGVyaXRcIjtcbiAgICB2YXIgcHJlbG9hZGVyID0gKGFwcC5WaWV3TW9kZWwuaXNWZXJpZnlpbmdQYXNzd29yZCkgPyBcImRpc3BsYXk6aW5oZXJpdFwiIDogXCJkaXNwbGF5OlwiO1xuICAgIHJldHVybiBtKFwiZGl2XCIsIHtzdHlsZTogY2hlY2tDdXJyZW50U2NyZWVuKFwicGFzc3dvcmRcIil9LCBbXG4gICAgICAgIG0oXCJkaXYucm93XCIsIHtzdHlsZTogcHJlbG9hZGVyfSwgW1xuICAgICAgICAgICAgbShcImRpdi5jb2wteHMtMTJcIiwgW1xuICAgICAgICAgICAgICAgIG0oXCJpbWcucHJlbG9hZGVyW3NyYz0vc3RhdGljL2Fzc2V0cy9wcmVsb2FkZXIuZ2lmXCIsIFwiTG9hZGluZy4uLlwiKVxuICAgICAgICAgICAgXSlcbiAgICAgICAgXSksXG4gICAgICAgIG0oXCJkaXYucm93XCIsIHtzdHlsZTogc2hvd0Zvcm19LCBbXG4gICAgICAgICAgICBtKFwiZGl2LmNvbC14cy0xMlwiLCBbXG4gICAgICAgICAgICAgICAgbShcImRpdlwiLCBbXG4gICAgICAgICAgICAgICAgICAgIG0oXCJpbnB1dC5mb3JtLWNvbnRyb2xbdHlwZT1wYXNzd29yZF1cIiwge29uY2hhbmdlOiBtLndpdGhBdHRyKFwidmFsdWVcIiwgYXBwLlZpZXdNb2RlbC5qb2luUGFzc3dvcmQpLCBwbGFjZWhvbGRlcjogXCJUaGlzIHRhYmxlIHJlcXVpcmVzIGEgcGFzc3dvcmRcIiwgdmFsdWU6IGFwcC5WaWV3TW9kZWwuam9pblBhc3N3b3JkKCl9KSxcbiAgICAgICAgICAgICAgICAgICAgbShcImJ1dHRvbi5idG4uYnRuLXByaW1hcnlcIiwge29uY2xpY2s6IGFwcC5WaWV3TW9kZWwudmVyaWZ5UGFzc3dvcmR9LCBcIkpvaW4gVGFibGVcIiksXG4gICAgICAgICAgICAgICAgICAgIG0oXCJidXR0b24uYnRuLmJ0bi1kYW5nZXJcIiwge29uY2xpY2s6IGFwcC5WaWV3TW9kZWwuY2FuY2VsSm9pblRhYmxlfSwgXCJDYW5jZWxcIilcbiAgICAgICAgICAgICAgICBdKVxuICAgICAgICAgICAgXSlcbiAgICAgICAgXSlcbiAgICBdKTtcbn07XG5cbmFwcC52aWV3ID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG0oXCJkaXYuY29udGFpbmVyXCIsIFtcbiAgICAgICAgbShcImRpdi5yb3dcIiwgW1xuICAgICAgICAgICAgbShcImRpdi5jb2wteHMtMTJcIiwgW1xuICAgICAgICAgICAgICAgIG0oXCJkaXYudGV4dC1kYW5nZXJcIiwgYXBwLlZpZXdNb2RlbC5jbGllbnRFcnJvcilcbiAgICAgICAgICAgIF0pXG4gICAgICAgIF0pLFxuICAgICAgICBMb2JieVZpZXcoKSxcbiAgICAgICAgQ3JlYXRlVGFibGVWaWV3KCksXG4gICAgICAgIEdhbWVUYWJsZVZpZXcoKSxcbiAgICAgICAgUGFzc3dvcmRWaWV3KClcbiAgICBdKTtcbn07XG4iLCJhcHAuY29udHJvbGxlciA9IGZ1bmN0aW9uKCkge1xuICAgIGFwcC5WaWV3TW9kZWwuaW5pdCgpO1xufTtcbiIsIm0ubW9kdWxlKGRvY3VtZW50LmJvZHksIGFwcCk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=