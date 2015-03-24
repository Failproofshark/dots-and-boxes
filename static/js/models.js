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
