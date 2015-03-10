var Dot = function(id, relationalX, relationalY, drawX, drawY) {
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
};

Dot.prototype.drawMethod = function(color, context) {
    context.fillStyle = color;
    context.fillRect(this.drawCoordinates.x, this.drawCoordinates.y, this.size, this.size);
};

Dot.prototype.hasCollided = function(mouseX, mouseY) {
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

/* gridSize is the number of squares we want to play with */
var Game = function(dimension) {
    this.gridDimensions = dimension;
    this.squares = Math.pow(this.gridDimensions,2);
    this.completedSquares = 0;
    this.numberOfRows = this.gridDimensions+1;

    this.verticies = [];

    //A temporary buffer were we keep what two verticies we've selected
    this.currentSelection = [];

    var x = 0;
    var y = 0;
    var initialDraw = 5;
    var drawX = initialDraw;
    var drawY = initialDraw;

    this.drawGap = 45;
    for (var i = 0; i < (Math.pow(this.numberOfRows, 2)); i++) {
        if (x === this.numberOfRows) {
            x = 0;
            y += 1;
            drawX = initialDraw;
            drawY += this.drawGap;
        }
        this.verticies.push(new Dot(i, x, y, drawX, drawY));
        x += 1;
        drawX += this.drawGap;
    };
        
    this.currentTurn = 0;
};

Game.prototype.addToSelection = function(vertex) {
    //Sorting helps not only in drawing but when checking for completed squares
    this.currentSelection.push(vertex);
    this.currentSelection = _.sortBy(this.currentSelection, 'id');
};

Game.prototype.initializeCanvas = function() {
    var canvas = document.getElementById("board");
    var context = canvas.getContext('2d');

    _.each(this.verticies, function(vertex) {
        vertex.drawMethod("#000000", context);
    });

    /* Event listeners overwrite the this keyword. I don't want to mess with the api so the following variable
     * helps me to bypass the shadowing
     */
    var gameSelf = this;
    var canvasClickListener = function(event) {
        var x = (event.x) ? event.x : (event.clientX + document.body.scrollLeft + document.documentElement.scrollLeft);
        var y = (event.y) ? event.y : (event.clientY + document.body.scrollTop + document.documentElement.scrollTop);
        x -= canvas.offsetLeft;
        y -= canvas.offsetTop;
        gameSelf.verticies[0].hasCollided(x,y);

        var drawLine = function(vertexPair, gap) {
            var lineSize = gap - vertexPair[0].size - 4;
            context.fillStyle = "#000000";
            if (vertexPair[0].relationalCoordinates.y === vertexPair[1].relationalCoordinates.y) {
                context.fillRect((vertexPair[0].right()+2), vertexPair[0].drawCoordinates.y, lineSize, vertexPair[0].size);
            } else {
                context.fillRect(vertexPair[0].drawCoordinates.x, (vertexPair[0].bottom() + 2), vertexPair[0].size, lineSize);
            }
            _.each(vertexPair, function(vertex) { 
                vertex.drawMethod("#000000",context);
            });
        };

        var markSquare = function(mark, dot) {
            console.log('drawing');
            var x = dot.left() + (gameSelf.drawGap/2.);
            var y = dot.bottom() + (gameSelf.drawGap/2.);
            context.fillStyle = "#000000";
            context.font = "15px sans-serif";
            context.fillText(mark, x, y);
        };

        /* Firstly the maximum number of squares completed in a turn is 2. 
         * Secondly since we can only draw a horizontal or vertical line, the squares are either on top of each other OR side by side.
         */
        var determineCompletedSquare = function(vertexPair, vertexCollection, numberOfRows) {
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
                    addCompletedSquare(vertexCollection[(vertexPair[0].id-numberOfRows)],vertexPair[1]);
                }
                //Bottom squareCheck
                if (vertexCollection[(vertexPair[0].id+numberOfRows)]) {
                    addCompletedSquare(vertexPair[0], vertexCollection[(vertexPair[1].id+numberOfRows)]);
                }
            } else {
                if (vertexCollection[(vertexPair[0].id-1)]) {
                    addCompletedSquare(vertexCollection[(vertexPair[0].id-1)],vertexPair[1]);
                }
                if (vertexCollection[(vertexPair[0].id+1)]) {
                    addCompletedSquare(vertexPair[0], vertexCollection[(vertexPair[1].id+1)]);
                }
            }
            
            return completedSquareIndicies;
        };
        
        _.each(gameSelf.verticies, function(vertex) {
            if (vertex.hasCollided(x, y)) {
                if (_.isEmpty(gameSelf.currentSelection)) {
                    gameSelf.addToSelection(vertex);
                    vertex.drawMethod("red", context);
                } else {
                    /* Only orthogonally adjacent selections are allowed 
                     * and can only be one unit away. Furthermore a edge cannot already 
                     * exist between the two points
                     */
                    if (vertex.id === gameSelf.currentSelection[0].id ||
                        vertex.relationalCoordinates.x > (gameSelf.currentSelection[0].relationalCoordinates.x + 1) ||
                        vertex.relationalCoordinates.x < (gameSelf.currentSelection[0].relationalCoordinates.x - 1) ||
                        vertex.relationalCoordinates.y > (gameSelf.currentSelection[0].relationalCoordinates.y + 1) ||
                        vertex.relationalCoordinates.y < (gameSelf.currentSelection[0].relationalCoordinates.y - 1) ||
                        ((vertex.relationalCoordinates.x === gameSelf.currentSelection[0].relationalCoordinates.x + 1) && (vertex.relationalCoordinates.y === gameSelf.currentSelection[0].relationalCoordinates.y + 1)) ||
                        ((vertex.relationalCoordinates.x === gameSelf.currentSelection[0].relationalCoordinates.x -1) && (vertex.relationalCoordinates.y === gameSelf.currentSelection[0].relationalCoordinates.y + 1)) ||
                        ((vertex.relationalCoordinates.x === gameSelf.currentSelection[0].relationalCoordinates.x - 1) && (vertex.relationalCoordinates.y === gameSelf.currentSelection[0].relationalCoordinates.y - 1)) ||
                        ((vertex.relationalCoordinates.x === gameSelf.currentSelection[0].relationalCoordinates.x + 1) && (vertex.relationalCoordinates.y === gameSelf.currentSelection[0].relationalCoordinates.y - 1)) ||
                        (_.includes(gameSelf.currentSelection[0].adjacencyList, vertex.id))) {
                        gameSelf.currentSelection[0].drawMethod("black", context);
                        gameSelf.currentSelection = [vertex];
                        vertex.drawMethod("red", context);
                    } else {
                        gameSelf.addToSelection(vertex);
                        vertex.drawMethod("red", context);
                        gameSelf.currentSelection[0].adjacencyList.push(gameSelf.currentSelection[1].id);
                        gameSelf.currentSelection[1].adjacencyList.push(gameSelf.currentSelection[0].id);
                        var completedSquares = determineCompletedSquare(gameSelf.currentSelection, gameSelf.verticies, gameSelf.numberOfRows);
                        _.each(completedSquares, function(dot) {
                            markSquare("a", dot);
                        });
                        gameSelf.completedSquares += completedSquares.length;
                        drawLine(gameSelf.currentSelection, gameSelf.drawGap);
                        gameSelf.currentSelection = [];
                    }
                }
            }
        });
    };

    canvas.addEventListener("mousedown", canvasClickListener);
};

var game = new Game(5);
game.initializeCanvas();
