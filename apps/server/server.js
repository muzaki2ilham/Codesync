const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- 1. KONEKSI MONGODB ---
// Pastikan Docker MongoDB sudah jalan atau ganti URL ke MongoDB Atlas
mongoose.connect('mongodb://127.0.0.1:27017/codesync')
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Error:", err));

const CodeSchema = new mongoose.Schema({
    roomId: { type: String, unique: true },
    content: String,
    language: String,
    updatedAt: { type: Date, default: Date.now }
});
const CodeModel = mongoose.model('Code', CodeSchema);

// --- 2. LOGIKA SOCKET.IO ---
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join Room & Load Data
    socket.on('join-room', async (roomId) => {
        socket.rooms.forEach(room => { if(room !== socket.id) socket.leave(room); });
        socket.join(roomId);
        
        const savedData = await CodeModel.findOne({ roomId });
        if (savedData) {
            socket.emit('load-saved-code', { code: savedData.content, language: savedData.language });
        }
    });

    // Sinkronisasi & Autosave
    socket.on('code-change', async ({ roomId, code, language }) => {
        socket.to(roomId).emit('update-editor', code);
        
        // Simpan ke DB (Update jika ada, Insert jika tidak)
        await CodeModel.findOneAndUpdate(
            { roomId }, 
            { content: code, language: language, updatedAt: Date.now() }, 
            { upsert: true }
        );
    });

    // Docker Execution Logic
    socket.on('run-code', ({ code, language }) => {
        let dockerImage, fileName, runCmd;

        switch (language) {
            case 'javascript':
                dockerImage = "node:18-alpine";
                fileName = `temp_${socket.id}.js`;
                runCmd = `node /app/${fileName}`;
                break;
            case 'python':
                dockerImage = "python:3.10-alpine";
                fileName = `temp_${socket.id}.py`;
                runCmd = `python /app/${fileName}`;
                break;
            case 'go':
                dockerImage = "golang:1.20-alpine";
                fileName = `temp_${socket.id}.go`;
                runCmd = `go run /app/${fileName}`;
                break;
            default:
                return socket.emit('code-result', "Error: Language not supported.");
        }

        const filePath = path.join(__dirname, fileName);
        fs.writeFileSync(filePath, code);

        // Docker Command dengan Volume Mounting
        const dockerFullCmd = `docker run --rm -v "${__dirname}":/app ${dockerImage} ${runCmd}`;

        exec(dockerFullCmd, { timeout: 10000 }, (error, stdout, stderr) => {
            let output = error ? (stderr || error.message) : stdout;
            socket.emit('code-result', output || "Execution finished (no output)");
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });
    });

    socket.on('disconnect', () => console.log('User disconnected'));
});

server.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));