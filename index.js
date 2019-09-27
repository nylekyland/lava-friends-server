var WebSocketServer = require("ws").Server
var http = require("http")
var express = require("express")
var app = express()
var port = process.env.PORT || 5000
var players = {};
var colors = ['red', 'yellow', 'green', 'blue'];
var uuidv4 = require('uuid/v4');

app.use(express.static(__dirname + "/"))

var server = http.createServer(app)
server.listen(port, function(){
	console.log("http server listening on %d", port)
});

var wss = new WebSocketServer({server: server})
console.log("websocket server created")

/*
*  A new player has connected
*/
wss.on("connection", function(ws) {
  
  ws.id = uuidv4();
  ws.send(ws.id);
  
  players[ws.id] = {
	x: 300,
	y: 50,
	playerId: socket.Id
  }
  ws.send(players[ws.id])
  
  var id = setInterval(function() {
    ws.send(JSON.stringify(new Date()), function() {  })
  }, 1000)
  
  ws.onmessage = function(event){
	
  }

  ws.on("close", function() {
    console.log("websocket connection close")
    clearInterval(id)
  })
})
