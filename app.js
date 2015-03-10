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
    secret: "blorp",
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
                    var newUser = new Users({userName: req.body.userName});
                    return newUser.saveAsync();
                }
            })
            .then(function(newUser) {
                if (newUser) {
                    req.session.userName = req.body.userName;
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
    res.sendFile(__dirname+"/index.html");
});

io.use(function(socket, next) {
    sessionMiddleware(socket.request, socket.request.res, next);
});



app.listen(8080);
console.log("Listening");
