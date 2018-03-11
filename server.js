var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io').listen(server);
var fs = require('fs');
var path = require('path');

var quickselect = require('quickselect'); // Used to compute the median for latency
var mongo = require('mongodb').MongoClient;
var mongoose = require('mongoose');
var myArgs = require('optimist').argv;

app.use('/assets',express.static(__dirname + '/assets'));
app.use('/client',express.static(__dirname + '/client'));
app.use('/lib',express.static(__dirname + '/lib'));
app.use('/server',express.static(__dirname + '/server'));
app.use('/shared',express.static(__dirname + '/shared'));
app.use('/maps',express.static(myArgs.maps));
app.use('/admin',express.static(path.join(__dirname,'admin')));
if(process.env.DEV == 1) app.use('/studio',express.static(__dirname + '/studio'));

app.get('/',function(req,res){
    res.sendFile(path.join(__dirname,'index.html'));
});
app.get('/admin',function(req,res){
    res.sendFile(path.join(__dirname,'admin','admin.html'));
});

if(process.env.DEV == 1) {
    app.get('/studio', function (req, res) {
        res.sendFile(__dirname + '/studio/studio.html');
    });
    app.get('/map', function (req, res) {
        res.sendFile(__dirname + '/studio/gmaps/map.html');
    });
    app.get('/bezier', function (req, res) {
        res.sendFile(__dirname + '/studio/bezier/bezier.html');
    });
}

server.listen(process.env.PORT || 8081,function(){
    console.log('Listening on '+server.address().port);
    /*mongo.connect(process.env.MONGODB_URI,function(err,db){ //|| 'mongodb://localhost:27017/westward'
        if(err) throw(err);
        server.db = db;
        console.log('Connection to db established');
        gs.readMap(myArgs.maps);
    });*/
    mongoose.connect(process.env.MONGODB_URI);
    var db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', function() {
        server.db = db;
        console.log('Connection to db established');
        gs.readMap(myArgs.maps);
    });
});

var gs = require('./server/GameServer.js').GameServer;
gs.server = server;

server.resetStamp = 1519130567967; // ignore returning players with stamps older than this and treat them as new

io.on('connection',function(socket){

    socket.on('init-world',function(data){
        if(!gs.initialized){
            socket.emit('wait');
            return;
        }
        console.log('['+socket.id+'] Initialized');
        if(!data.stamp || data.stamp < server.resetStamp) data.new = true; // TODO Remove eventually

        data.new = true; // TODO: REMOVE
        if(data.new){
            gs.addNewPlayer(socket);
        }else{
            gs.loadPlayer(socket,data.id);
        }

        var callbacksMap = {
            'animalClick': gs.handleAnimalClick,
            'battleAction': gs.handleBattleAction,
            'chat': gs.handleChat,
            'commit': gs.handleCommit,
            'craft': gs.handleCraft,
            'exit': gs.handleExit,
            'path': gs.handlePath,
            'respawn': gs.handleRespawn,
            'screenshot': gs.handleScreenshot,
            'shop': gs.handleShop,
            'unequip': gs.handleUnequip,
            'use': gs.handleUse
        };

        var handler = socket.onevent;
        socket.onevent = function(pkt){
            var event = pkt.data[0];
            var data = pkt.data[1];
            console.log(event,data);
            if(callbacksMap.hasOwnProperty(event)) callbacksMap[event](data,socket.id);
            handler.call(this,pkt); // just in case
        };

        /*socket.pings = [];

       socket.on('ponq',function(sentStamp){
           // Compute a running estimate of the latency of a client each time an interaction takes place between client and server
           // The running estimate is the median of the last 20 sampled values
           var ss = server.getShortStamp();
           var delta = (ss - sentStamp)/2;
           if(delta < 0) delta = 0;
           socket.pings.push(delta); // socket.pings is the list of the 20 last latencies
           if(socket.pings.length > 20) socket.pings.shift(); // keep the size down to 20
           socket.latency = server.quickMedian(socket.pings.slice(0)); // quickMedian used the quickselect algorithm to compute the median of a list of values
       });*/
    });

    socket.on('disconnect',function(){
        gs.handleDisconnect(socket.id);
    });

    // #########################

    // TODO: secure
    socket.on('admin',function(){
        var callbacksMap = {
            'admin_deletebuilding': gs.deleteBuilding,
            'admin_listbuildings': gs.listBuildings,
            'admin_newbuilding': gs.insertNewBuilding
        };

        var handler = socket.onevent;
        socket.onevent = function(pkt){
            var event = pkt.data[0];
            var data = pkt.data[1];
            console.log('ADMIN:',event,data);
            if(callbacksMap.hasOwnProperty(event)) callbacksMap[event](data,socket.id);
            /*else{
                handler.call(this,pkt);
            }*/
        };

        /*socket.on('listbuildings',function(){
            socket.emit('buildingslist',gs.listBuildings());
        });*/
    });

    // #########################
    /*if(process.env.DEV == 1) {
        socket.on('mapdata',function(data){
            console.log('Saving changes to chunk '+data.id+'...');
            var dir = __dirname+'/assets/maps/chunks/'; // Replace by env variable
            fs.writeFile(dir+'chunk'+data.id+'.json',JSON.stringify(data.data),function(err){
                if(err) throw err;
                console.log('done'); // replace by counter
            });
        });
    }*/
});

server.sendInitializationPacket = function(socket,packet){
    packet = server.addStamp(packet);
    //if(server.enableBinary) packet = Encoder.encode(packet,CoDec.initializationSchema);
    socket.emit('init',packet);
};

server.sendAdminUpdate = function(socketID,name,pkg){
    var socket = server.getSocket(socketID);
    if(pkg) io.in(socketID).emit(name,pkg);
};

server.sendUpdate = function(socketID,pkg){
    var socket = server.getSocket(socketID);
    pkg = server.addStamp(pkg);
    if(socket) pkg.latency = Math.floor(socket.latency);
    //if(server.enableBinary) pkg = Encoder.encode(pkg,CoDec.finalUpdateSchema);
    if(pkg) io.in(socketID).emit('update',pkg);
};

server.addStamp = function(pkg){
    pkg.stamp = server.getShortStamp();
    return pkg;
};

server.getShortStamp = function(){
    return parseInt(Date.now().toString().substr(-9));
};

server.getSocket = function(id){
    return io.sockets.connected[id]; // won't work if the socket is subscribed to a namespace, because the namsepace will be part of the id
};

server.getNbConnected =function(){
    return Object.keys(gs.players).length;
};

server.quickMedian = function(arr){ // Compute the median of an array using the quickselect algorithm
    var  l = arr.length;
    var n = (l%2 == 0 ? (l/2)-1 : (l-1)/2);
    quickselect(arr,n);
    return arr[n];
};

server.sendID = function(socket,playerID){
    socket.emit('pid',playerID);
};

