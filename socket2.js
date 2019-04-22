/*
const fs = require('fs');
const options = {
  key: fs.readFileSync("/etc/letsencrypt/live/www.clife.cf/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/www.clife.cf/cert.pem")
};
*/
//var server = require("https").createServer(options).listen(3003);
var server = require("http").createServer().listen(3003);
var io = require("socket.io").listen(server);
var users = [];
var roomId = {};
var rooms = [];
var writer = [];
class Room {
  constructor(id) {
    this.id = id;
    this.users = [];
  }
  addUser(socketId, user) {
    this.users.push(new User(socketId, user));
  }
  delUser(socketId) {
    this.users = this.users.filter(user => { return user.socketId !== socketId; });
  }
}
class User {
  constructor(socketId, user) {
    this.socketId = socketId;
    this.id = user.id;
    this.na = user.na;
    this.avatar = user.avatar
    this.no = user.no;
    this.auth = user.auth;
    this.rtc = "";
    this.rtcid = 0;
  }
}
const RTC = { headset: 1, mic: 2, videocam: 3 };
io.sockets.on("connection", socket => {
  socket.on("join", data => {
    let newRoom = rooms.filter(room => { return room.id === data.newRoomId; });
    if (!newRoom.length) {
      rooms.push(new Room(data.newRoomId));
      newRoom[0] = rooms[rooms.length - 1];
    }
    if (roomId[socket.id] !== data.newRoomId) {//部屋移動時
      socket.leave(data.oldRoomId);
      socket.join(data.newRoomId);
      data.user.rtc = ""; data.user.rtcid = 0;
      newRoom[0].addUser(socket.id, data.user);
      io.sockets.in(data.newRoomId).emit("join", newRoom[0].users);
      let oldRoom = rooms.filter(room => { return room.id === data.oldRoomId; });
      if (oldRoom.length) {
        oldRoom[0].delUser(socket.id);
        if (oldRoom[0].users.length) {
          socket.broadcast.to(data.oldRoomId).emit("join", oldRoom[0].users);
        } else {
          rooms = rooms.filter(room => { return room.id !== oldRoom[0].id; });
        }
      }
      roomId[socket.id] = data.newRoomId;
    } else {//ログイン時
      newRoom[0].delUser(socket.id);
      newRoom[0].addUser(socket.id, data.user);
      io.sockets.in(data.newRoomId).emit("join", newRoom[0].users);
      users = users.filter(user => { return user.socketId !== socket.id; });
      users.push(new User(socket.id, data.user));
    }
  });
  socket.on("typing", (name) => {
    let msg = "";
    writer.push(name);
    if (writer.length > 3) {
      msg = "大勢入力中...汗";
      writer.shift();
    } else {
      for (let i = 0; i < writer.length; i++) {
        msg += writer[i] + "、";
      }
      msg = msg.slice(0, msg.length - 1) + "が入力中...";
    }
    socket.broadcast.to(roomId[socket.id]).emit("typing", msg);
    setTimeout(() => {
      writer = [];
    }, 2000);
  });
  socket.on("chat", (msg) => {
    io.sockets.in(roomId[socket.id]).emit("chat", msg);
  });
  socket.on("logout", () => {
    logout();
  });
  socket.on("disconnect", () => {
    logout();
  });
  function logout() {
    let room = rooms.filter(r => { return r.id === roomId[socket.id]; });
    if (room.length) {
      room[0].delUser(socket.id);
      if (room[0].users.length) {
        io.sockets.in(roomId[socket.id]).emit("join", room[0].users);
      } else {
        rooms = rooms.filter(r => { return r.id !== room[0].id; });
      }
    }
    users = users.filter(user => { user.socketId !== socket.id; });
    delete roomId[socket.id];
  }
  socket.on("rtc", data => {//WebRtcの利用状況
    if (roomId[socket.id]) {
      let room = rooms.filter(r => { return r.id === roomId[socket.id]; });
      if (room.length) {
        let user = room[0].users.filter(u => { return u.socketId === socket.id; });
        if (user.length) {
          user[0].rtc = data;
          user[0].rtcid = data ? RTC[data] : 0;
          io.sockets.in(roomId[socket.id]).emit("join", room[0].users);
        }
      }
    }
  });
  socket.on("searchMember", uid => {//メンバー検索で現在居る部屋を返す
    let targets = users.filter(user => { return user.id === uid; });
    if (targets.length) {
      io.sockets.connected[socket.id].emit("searchMember", roomId[targets[0].socketId]);
    }
  });
  socket.on("get", rid => {//部屋にいるオンラインメンバー再表示
    let targets = rooms.filter(room => { return room.id === rid; });
    if (targets.length) {
      io.sockets.connected[socket.id].emit("join", targets[0].users);
    }
  });
  socket.on("nums", rids => {//各部屋以下にいるオンライン人数をそれぞれ返す
    let res = rids.map(rid => {
      let num = 0;
      let parents = rooms.filter(room => { return room.id == rid.id; });
      if (parents.length) {
        num = parents[0].users.length;
      }
      for (let i = 0; i < rid.children.length; i++) {
        let id = rid.children[i];
        let childs = rooms.filter(room => { return room.id == id; });
        if (childs.length) {
          num += childs[0].users.length;
        }
      }
      return { id: rid.id, num: num };
    });
    if (res.length) {
      io.sockets.connected[socket.id].emit("nums", res);
    }
  });
  socket.on("give", data => {//短文付き投げ銭
    let getter = users.filter(user => { return user.id === data.mid; });
    if (getter.length) {
      io.to(getter[0].socketId).emit("give", data);
    }
  });
});
/*
socket.on("nums", rids => {//各部屋にいる人数をそれぞれ返す
    let res = rids.map(rid => {      
      let targets = rooms.filter(room => { return room.id === rid; });
      if (targets.length) {
        return { id: rid, num: targets[0].users.length };
      } else {
        return { id: rid, num: 0 };
      }
    });
    if (res.length) {
      io.sockets.connected[socket.id].emit("nums", res);
    }
  });

*/