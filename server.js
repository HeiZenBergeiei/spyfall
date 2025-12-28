const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- DATA ---
const locationData = [
    { name: "โรงพยาบาล", image: "https://images.unsplash.com/photo-1587351021759-3e566b9af922?q=80&w=800&auto=format&fit=crop", roles: ["หมอ", "พยาบาล", "คนไข้", "ภารโรง", "เภสัชกร", "ผอ.โรงพยาบาล", "ญาติคนไข้"] },
    { name: "ธนาคาร", image: "https://images.unsplash.com/photo-1501167786227-4cba60f6d58f?q=80&w=800&auto=format&fit=crop", roles: ["ผู้จัดการ", "โจร", "พนักงานเคาน์เตอร์", "ยาม", "ลูกค้า", "คนขับรถขนเงิน", "แม่บ้าน"] },
    { name: "โรงเรียน", image: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=800&auto=format&fit=crop", roles: ["ครูใหญ่", "นักเรียน", "ภารโรง", "ครูพละ", "แม่ค้าโรงอาหาร", "ผู้ปกครอง", "นักเรียนโดดเรียน"] },
    { name: "กองถ่ายภาพยนตร์", image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=800&auto=format&fit=crop", roles: ["ผู้กำกับ", "ดารา", "ตากล้อง", "สตั๊นแมน", "ช่างแต่งหน้า", "ตัวประกอบ", "คนเขียนบท"] },
    { name: "เครื่องบิน", image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=800&auto=format&fit=crop", roles: ["กัปตัน", "แอร์โฮสเตส", "ผู้โดยสารชั้นหนึ่ง", "ช่างเครื่อง", "สจ๊วต", "ผู้ก่อการร้าย", "เด็กทารก"] },
    { name: "งานวัด", image: "https://images.unsplash.com/photo-1561484930-998b6a7b22e8?q=80&w=800&auto=format&fit=crop", roles: ["คนขายลูกชิ้น", "เด็กแว้น", "มัคทายก", "นางรำ", "คนปาลูกโป่ง", "คนเดินเที่ยว", "ขอทาน"] },
    { name: "สถานีตำรวจ", image: "https://images.unsplash.com/photo-1596561139463-2287f3d643d9?q=80&w=800&auto=format&fit=crop", roles: ["สารวัตร", "โจรกลับใจ", "ตำรวจจราจร", "นักข่าว", "ทนายความ", "พยาน", "สุนัขตำรวจ"] },
    { name: "เรือดำน้ำ", image: "https://images.unsplash.com/photo-1551601658-00c7764d266e?q=80&w=800&auto=format&fit=crop", roles: ["กัปตันเรือ", "ต้นหน", "พ่อครัว", "ช่างเครื่อง", "ทหารสื่อสาร", "แพทย์สนาม", "พลทหาร"] }
];

let rooms = {};

const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    do {
        code = '';
        for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    } while (rooms[code]);
    return code;
};

io.on('connection', (socket) => {
    
    // --- LOBBY ---
    socket.on('create_room', ({ username, avatar }) => {
        const roomId = generateRoomCode();
        rooms[roomId] = {
            id: roomId,
            players: [{ id: socket.id, name: username, avatar, isHost: true }],
            settings: { timeLimit: 5 },
            state: "LOBBY",
            votes: {}, actualLocation: "", spyId: "", currentTurnId: "" // เพิ่มตัวแปรเก็บคนถาม
        };
        socket.join(roomId);
        socket.emit('room_joined', rooms[roomId]);
    });

    socket.on('join_room', ({ roomId, username, avatar }) => {
        roomId = roomId ? roomId.toUpperCase() : "";
        const room = rooms[roomId];
        if (!room) return socket.emit('error_msg', 'ไม่พบห้องนี้!');
        if (room.state !== "LOBBY") return socket.emit('error_msg', 'เกมเริ่มไปแล้ว!');
        if (room.players.length >= 8) return socket.emit('error_msg', 'ห้องเต็มแล้ว!');

        room.players.push({ id: socket.id, name: username, avatar, isHost: false });
        socket.join(roomId);
        io.to(roomId).emit('update_lobby', room);
    });

    socket.on('update_settings', ({ roomId, timeLimit }) => {
        if (rooms[roomId]) {
            rooms[roomId].settings.timeLimit = timeLimit;
            io.to(roomId).emit('update_settings', rooms[roomId].settings);
        }
    });

    // --- GAME ---
    socket.on('start_game', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        const locIndex = Math.floor(Math.random() * locationData.length);
        const selectedLocObj = locationData[locIndex];
        room.actualLocation = selectedLocObj.name;
        
        const spyIndex = Math.floor(Math.random() * room.players.length);
        room.spyId = room.players[spyIndex].id;
        
        // สุ่มคนเริ่มถามคนแรก
        const starterIndex = Math.floor(Math.random() * room.players.length);
        room.currentTurnId = room.players[starterIndex].id;

        room.state = "PLAYING";
        room.votes = {};
        const endTime = Date.now() + (room.settings.timeLimit * 60 * 1000);

        const allLocationsForClient = locationData
            .map(l => ({ name: l.name, image: l.image }))
            .sort((a, b) => a.name.localeCompare(b.name));

        room.players.forEach((player, index) => {
            const isSpy = (player.id === room.spyId);
            const role = isSpy ? "สายลับ (Spy)" : selectedLocObj.roles[index % selectedLocObj.roles.length];

            io.to(player.id).emit('game_started', {
                isSpy, role,
                location: isSpy ? "???" : selectedLocObj.name,
                locationImage: isSpy ? null : selectedLocObj.image, 
                allLocations: allLocationsForClient,
                endTime,
                players: room.players,
                currentTurnId: room.currentTurnId // ส่งคนเริ่มไปบอกทุกคน
            });
        });
    });

    // Event: ส่งไม้ต่อ (Pass Turn)
    socket.on('pass_turn', ({ roomId, targetId }) => {
        const room = rooms[roomId];
        if (room && room.state === "PLAYING") {
            // เช็คว่าคนกด เป็นเจ้าของเทิร์นจริงไหม (กันคนอื่นมั่วกด)
            if (socket.id === room.currentTurnId) {
                room.currentTurnId = targetId;
                // บอกทุกคนว่าเปลี่ยนคนถามแล้ว
                io.to(roomId).emit('turn_updated', { currentTurnId: targetId });
            }
        }
    });

    socket.on('spy_guess_location', ({ roomId, locationName }) => {
        const room = rooms[roomId];
        if (!room) return;
        
        const spyName = room.players.find(p => p.id === room.spyId)?.name || "Unknown";
        const isCorrect = locationName === room.actualLocation;
        
        io.to(roomId).emit('game_over', { 
            winner: isCorrect ? 'SPY' : 'VILLAGERS', 
            reason: isCorrect 
                ? `Spy (${spyName}) ทายสถานที่ถูก! (${locationName})` 
                : `Spy (${spyName}) ทายผิด! ตอบ: ${locationName}`,
            spyName, actualLocation: room.actualLocation
        });
    });

    socket.on('call_vote', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].state = "VOTING";
            io.to(roomId).emit('start_voting');
        }
    });

    socket.on('submit_vote', ({ roomId, targetId }) => {
        const room = rooms[roomId];
        if (!room || room.state !== "VOTING") return;

        room.votes[socket.id] = targetId;
        const currentPlayers = io.sockets.adapter.rooms.get(roomId)?.size || 0;
        
        if (Object.keys(room.votes).length >= currentPlayers) {
            processVoteResult(room, io);
        }
    });

    socket.on('reset_game_request', (roomId) => {
        const room = rooms[roomId];
        if(room) {
             room.state = "LOBBY";
             room.votes = {};
             room.actualLocation = "";
             room.spyId = "";
             room.currentTurnId = "";
             io.to(roomId).emit('update_lobby', room);
        }
    });
});

function processVoteResult(room, io) {
    const counts = {};
    let maxVote = 0;
    let votedPersonId = null;

    Object.values(room.votes).forEach(targetId => {
        counts[targetId] = (counts[targetId] || 0) + 1;
        if (counts[targetId] > maxVote) {
            maxVote = counts[targetId];
            votedPersonId = targetId;
        }
    });

    const votedPlayer = room.players.find(p => p.id === votedPersonId);
    const spyName = room.players.find(p => p.id === room.spyId)?.name || "Unknown";

    if (votedPersonId === room.spyId) {
        io.to(room.id).emit('game_over', { 
            winner: 'VILLAGERS', 
            reason: `จับ Spy สำเร็จ! ${votedPlayer.name} คือ Spy`,
            spyName, actualLocation: room.actualLocation
        });
    } else {
        io.to(room.id).emit('vote_result_wrong', {
            msg: `โหวตผิด! ${votedPlayer ? votedPlayer.name : "ไม่มีใคร"} ไม่ใช่ Spy`
        });
        io.to(room.spyId).emit('spy_force_guess');
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});