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
                    vm.tableNotice = "Waiting for an opponent...";                                
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
                        if (data.winner === -1) {
                            vm.tableNotice = "Tie game";
                        } else {
                            vm.tableNotice = data.winner + " has won";
                        }
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
            vm.socket = io(connectionUrl);
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
