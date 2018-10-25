const fs = require('fs');
const options = {
  key: fs.readFileSync("/etc/letsencrypt/live/www.clife.cf/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/www.clife.cf/cert.pem")
};
var server = require("https").createServer(options).listen(8080);
var io = require("socket.io").listen(server);
var users = {};
var roomId = {};
var rooms = [];
class Room {
  constructor(id) {
    this.id = id;
    this.users = [];
  }
  addUser(socketId, user) {
    this.users[this.users.length] = new User(socketId, user);
  }
  delUser(socketId) {
    for (let i = 0; i < this.users.length; i++) {
      if (this.users[i].socketId === socketId) {
        this.users.splice(i, 1);
      }
    }
  }
}
class User {
  constructor(socketId, user) {
    this.socketId = socketId;
    this.id = user.uid;
    this.name = user.displayName;
    this.join = new Date();
    this.rtc = false;
  }
}
io.sockets.on("connection", socket => {
  socket.on("join", data => {
    console.log("join" + data);
    socket.join(data.newRoomId);
    let newRoom = rooms.filter(r => { if (r.id === data.newRoomId) return true; });
    if (!newRoom.length) {
      rooms[rooms.length] = new Room(data.newRoomId);
      newRoom[0] = rooms[rooms.length - 1];
    }
    if (data.user) {
      if (roomId[socket.id] !== data.newRoomId) {
        newRoom[0].addUser(socket.id, data.user);
        io.sockets.in(data.newRoomId).emit("join", newRoom[0].users);
        users[socket.id] = data.user;
        roomId[socket.id] = data.newRoomId;
      } else if (data.rtc === false) {
        rtc(false);
      } else {
        console.error("rtc fault");
      }
    } else {//ログインしていないメンバーの処理
      io.to(socket.id).emit("join", newRoom[0].users);
    }
  });
  socket.on("leave", data => {
    console.log("leave" + data);
    socket.leave(data.oldRoomId);
    let oldRoom = rooms.filter(r => { if (r.id === data.oldRoomId) return true; });
    if (oldRoom.length) {
      oldRoom[0].delUser(socket.id);
      socket.broadcast.to(data.oldRoomId).emit("join", oldRoom[0].users);
      roomId[socket.id] = "";
    }
  });
  socket.on("logout", (data) => {
    console.log("logout" + data);
    logout(data.roomId);
  });
  socket.on("disconnect", () => {
    console.log("disconnect");
    logout(false);
  });
  function logout(rid) {
    // if (users[socket.id]) {
    let room = rooms.filter(r => { if (r.id === roomId[socket.id]) return true; });
    if (room.length) {
      room[0].delUser(socket.id);
      io.sockets.in(roomId[socket.id]).emit("join", room[0].users);
    } else if (rid) {//ログインしていないuserの処理
      room = rooms.filter(r => { if (r.id === rid) return true; });
      if (room.length) {
        io.to(socket.id).emit("join", room[0].users);
      }
    }
    delete users[socket.id];
    delete roomId[socket.id];
    // } else {
    //   console.error("there is no user to log out")
    // }
  }
  socket.on("rtc", data => {
    rtc(data);
  })
  function rtc(data) {
    if (users[socket.id] && roomId[socket.id]) {
      let room = rooms.filter(r => { if (r.id === roomId[socket.id]) return true; });
      if (room.length) {
        let user = room[0].users.filter(u => { if (u.socketId === socket.id) return true; });
        if (user) {
          user[0].rtc = data;
          io.sockets.in(roomId[socket.id]).emit("join", room[0].users);
        }
      }
    }
  }
});