const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const JWT_SECRET = "IlhamMuzaki_Admin_Key_2026";
const roomActiveUsers = {}; // Menyimpan user yang sedang online di tiap room

// MIDDLEWARE
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../client')));

// MONGODB
mongoose.connect('mongodb://127.0.0.1:27017/codesync')
    .then(() => console.log("✅ DB Connected"))
    .catch(err => console.error("❌ DB Error:", err));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}));

const CodeModel = mongoose.model('Code', new mongoose.Schema({
    roomId: { type: String, unique: true },
    content: String,
    language: String,
    roomPassword: { type: String, default: null },
    owner: String 
}));

// API AUTH
app.post('/api/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        await User.create({ username: req.body.username, password: hashedPassword });
        res.json({ message: "Success" });
    } catch (e) { res.status(400).json({ error: "User exists" }); }
});

app.post('/api/login', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (user && await bcrypt.compare(req.body.password, user.password)) {
        const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '1h' });
        res.cookie('token', token, { httpOnly: true });
        return res.json({ message: "OK", username: user.username });
    }
    res.status(401).json({ error: "Fail" });
});

// SOCKET LOGIC
io.on('connection', (socket) => {
    socket.on('join-room', async ({ roomId, password, username, language, action }) => {
        let room = await CodeModel.findOne({ roomId });

        if (action === 'create') {
            if (room) return socket.emit('error-msg', "Room exists!");
            room = await CodeModel.create({ roomId, owner: username, roomPassword: password || null, content: "// New Room", language });
        } else {
            if (!room) return socket.emit('error-msg', "Not found!");
            if (room.roomPassword && room.roomPassword !== password && room.owner !== username) return socket.emit('error-msg', "Wrong Password!");
        }

        socket.join(roomId);
        socket.username = username;
        socket.currentRoom = roomId;

        const role = (room.owner === username) ? 'editor' : 'viewer';
        
        // Track Online Users
        if (!roomActiveUsers[roomId]) roomActiveUsers[roomId] = [];
        roomActiveUsers[roomId] = roomActiveUsers[roomId].filter(u => u.username !== username);
        roomActiveUsers[roomId].push({ username, socketId: socket.id, role, isOwner: (room.owner === username) });

        socket.emit('load-saved-code', { content: room.content, language: room.language, role });
        io.to(roomId).emit('update-user-list', roomActiveUsers[roomId]);
    });

    socket.on('toggle-role', async ({ roomId, targetSocketId, newRole }) => {
        const room = await CodeModel.findOne({ roomId });
        const users = roomActiveUsers[roomId];
        if (!users) return;

        const requester = users.find(u => u.socketId === socket.id);
        const targetUser = users.find(u => u.socketId === targetSocketId);

        if (room && requester && targetUser) {
            // Requester must be the owner OR an editor
            if (room.owner === requester.username || requester.role === 'editor') {
                // Cannot change the role of the owner
                if (targetUser.username === room.owner) {
                    return socket.emit('error-msg', "Cannot change the role of the Room Owner!");
                }
                
                targetUser.role = newRole;
                io.to(targetSocketId).emit('role-updated', newRole);
                io.to(roomId).emit('update-user-list', users);
            }
        }
    });

    socket.on('code-change', async ({ roomId, code }) => {
        // Hanya update jika user punya role editor (dicek di client side untuk kecepatan, server side untuk keamanan)
        await CodeModel.updateOne({ roomId }, { content: code });
        socket.to(roomId).emit('update-editor', code);
    });

    socket.on('chat-message', ({ roomId, username, message }) => {
        io.to(roomId).emit('chat-message', { username, message });
    });

    socket.on('run-code', ({ code, language }) => {
        let dockerImage, fileName, runCmd;
        if (language === 'javascript') { dockerImage = "node:18-alpine"; fileName = `t_${socket.id}.js`; runCmd = `node /app/${fileName}`; }
        else if (language === 'python') { dockerImage = "python:3.10-alpine"; fileName = `t_${socket.id}.py`; runCmd = `python /app/${fileName}`; }
        else if (language === 'go') { dockerImage = "golang:1.20-alpine"; fileName = `t_${socket.id}.go`; runCmd = `go run /app/${fileName}`; }

        const filePath = path.join(__dirname, fileName);
        fs.writeFileSync(filePath, code);
        exec(`docker run --rm -v "${__dirname}":/app ${dockerImage} ${runCmd}`, (err, stdout, stderr) => {
            socket.emit('code-result', err ? (stderr || err.message) : stdout);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });
    });

    socket.on('disconnect', () => {
        const roomId = socket.currentRoom;
        if (roomId && roomActiveUsers[roomId]) {
            roomActiveUsers[roomId] = roomActiveUsers[roomId].filter(u => u.socketId !== socket.id);
            io.to(roomId).emit('update-user-list', roomActiveUsers[roomId]);
        }
    });
});

server.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));