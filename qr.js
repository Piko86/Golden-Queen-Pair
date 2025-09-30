const { makeid } = require('./gen-id');
const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');
const pino = require("pino");
const mongoose = require("mongoose");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
} = require("@whiskeysockets/baileys");

// ✅ MongoDB Schema
const SessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    creds: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now }
});

const Session = mongoose.model("Session", SessionSchema);

let router = express.Router();

function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    const id = makeid();

    async function QUEEN_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);

        try {
            let sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Desktop"),
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;

                if (qr) {
                    return res.end(await QRCode.toBuffer(qr));
                }

                if (connection === "open") {
                    await delay(5000);

                    try {
                        let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`, "utf-8");
                        let creds = JSON.parse(data);

                        // ✅ Save to MongoDB
                        await Session.findOneAndUpdate(
                            { sessionId: sock.user.id },
                            { creds: creds },
                            { upsert: true, new: true }
                        );

                        console.log(`✅ Session saved to MongoDB for: ${sock.user.id}`);
                    } catch (err) {
                        console.error("❌ MongoDB save error:", err);
                    }

                    await delay(1000);
                    await sock.ws.close();
                    await removeFile('./temp/' + id);
                    process.exit();
                }
            });
        } catch (err) {
            console.log("❌ Error in Pair:", err);
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ code: "❗ Service Unavailable" });
            }
        }
    }

    await QUEEN_PAIR_CODE();
});

// Auto restart
setInterval(() => {
    console.log("♻ Restarting process...");
    process.exit();
}, 1800000); // 30min

module.exports = router;