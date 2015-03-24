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
