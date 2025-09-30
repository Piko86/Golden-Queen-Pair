const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const { default: makeWASocket, useMultiFileAuthState, delay, Browsers, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

async function getMongoClient() {
    const uri = process.env.MONGO_URI || 'mongodb://mongo:nPwqJATaorIUugKMxtLdwNogiVXymhmz@yamanote.proxy.rlwy.net:21462';
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    return client;
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    async function GIFTED_MD_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        try {
            var items = ["Safari"];
            function selectRandomItem(array) {
                var randomIndex = Math.floor(Math.random() * array.length);
                return array[randomIndex];
            }
            var randomItem = selectRandomItem(items);

            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                generateHighQualityLinkPreview: true,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                syncFullHistory: false,
                browser: Browsers.macOS(randomItem)
            });

            // if not registered yet -> request pairing code and return to HTTP client
            if (!sock.authState.creds.registered) {
                await delay(1500);
                if (num) {
                    num = num.replace(/[^0-9]/g, '');
                    try {
                        const code = await sock.requestPairingCode(num);
                        if (!res.headersSent) {
                            await res.send({ code });
                        }
                    } catch (e) {
                        if (!res.headersSent) await res.status(500).send({ error: 'Pairing request failed', details: (e && e.message) ? e.message : e });
                        console.error('requestPairingCode error:', e);
                    }
                } else {
                    if (!res.headersSent) await res.status(400).send({ error: 'missing number query param' });
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    try {
                        // wait a bit to ensure creds file is written
                        await delay(2000);

                        const rf = __dirname + `/temp/${id}/creds.json`;
                        if (!fs.existsSync(rf)) {
                            console.warn('creds.json not found at', rf);
                        } else {
                            const raw = fs.readFileSync(rf, 'utf8');
                            let credsJson;
                            try {
                                credsJson = JSON.parse(raw);
                            } catch (parseErr) {
                                credsJson = { raw: raw };
                            }

                            // prepare session document
                            const sessionDoc = {
                                jid: sock.user && sock.user.id ? sock.user.id : null,
                                createdAt: new Date(),
                                sessionId: id,
                                creds: credsJson
                            };

                            // save to MongoDB
                            let client;
                            try {
                                client = await getMongoClient();
                                const db = client.db(process.env.MONGO_DB_NAME || 'goldenqueen');
                                const col = db.collection(process.env.MONGO_COLLECTION || 'sessions');

                                // upsert by jid if available, otherwise insert new
                                if (sessionDoc.jid) {
                                    await col.updateOne(
                                        { jid: sessionDoc.jid },
                                        { $set: sessionDoc, $setOnInsert: { insertedAt: new Date() } },
                                        { upsert: true }
                                    );
                                } else {
                                    await col.insertOne(sessionDoc);
                                }

                                console.log('Session saved to MongoDB for', sessionDoc.jid || id);
                            } catch (dbErr) {
                                console.error('MongoDB save error:', dbErr);
                            } finally {
                                if (client) await client.close();
                            }
                        }

                        // cleanup local temp and close socket (do NOT send session id to WhatsApp)
                        await delay(500);
                        try {
                            await sock.ws.close();
                        } catch (e) { /* ignore */ }
                        await removeFile('./temp/' + id);
                        console.log(`👤 ${sock.user && sock.user.id ? sock.user.id : id} Connected -> Session stored in MongoDB. Exiting process.`);
                        await delay(300);
                        process.exit();
                    } catch (e) {
                        console.error('Error on connection open handler:', e);
                        await removeFile('./temp/' + id);
                        if (!res.headersSent) await res.send({ code: "❗ Service Unavailable" });
                    }
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode != 401) {
                    await delay(10);
                    // retry
                    GIFTED_MD_PAIR_CODE();
                }
            });
        } catch (err) {
            console.log("service restarted", err);
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ code: "❗ Service Unavailable" });
            }
        }
    }

    return await GIFTED_MD_PAIR_CODE();
});

module.exports = router;
