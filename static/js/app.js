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
                    console.log('blorp');
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
                    console.log(data.errorCode);
                    switch(data.errorCode) {
                    case "ENOTREGISTERED":
                        window.location = "/";
                        break;
                    case "ENOTABLE":
                        vm.clientError = "We could not find the table you were trying to join";
                        break;
                    case "ETABLEFULL":
                        vm.clientError = "The table you tried to join is full";
                        break;
                    case "EWRONGPASSWORD":
                        vm.clientError = "The password you input was incorrect";
                        break;
                    case "ETABLELOCKED":
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
            if (_.isEmpty(vm.createGridDimension()) || !_.isNumber(Number(vm.createGridDimension())) || Number(vm.createGridDimension()) > 10 || Number(vm.createGridDimension()) < 1) {
                vm.createTableError("Please specify the grid size of the table with a single number (1-10)");
            } else {
                var createTableParameters = {dimensions:Number(vm.createGridDimension())};
                
                if (!_.isEmpty($.trim(vm.tablePassword()))) {
                    createTableParameters.password = $.trim(vm.tablePassword());
                    console.log(createTableParameters.password = $.trim(vm.tablePassword()));
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
            vm.currentScreen = "loading";
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
                m("div", "This game is played on a square grid ranging from a 2x2 grid to a 10x10 grid. Input a single number below to create a grid. Optionally, you may input a password to make the game private (be sure to give the other player the password so they can get in the room"),
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
                if (app.ViewModel.currentTable && app.ViewModel.currentTable.isCurrentTurn()) {
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
    console.log("bloropin");
    console.log(checkCurrentScreen("password"));
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
