const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const rooms = new Map();

function createPiece(type, color, symbol) {
    return {
        type,
        color,
        symbol,
        gun: false,
        ammo: type === "turret" ? 8 : 0,
        maxAmmo: type === "turret" ? 8 : 0,
        turretHits: 0,
        turretDisabled: false,
        deathRow: null,
        deathCol: null
    };
}

function initialBoard() {
    return [
        [
            createPiece("rook","black","♜"),
            createPiece("knight","black","♞"),
            createPiece("bishop","black","♝"),
            createPiece("queen","black","♛"),
            createPiece("king","black","♚"),
            createPiece("bishop","black","♝"),
            createPiece("knight","black","♞"),
            createPiece("rook","black","♜")
        ],
        [
            createPiece("pawn","black","♟"),
            createPiece("pawn","black","♟"),
            createPiece("pawn","black","♟"),
            createPiece("pawn","black","♟"),
            createPiece("pawn","black","♟"),
            createPiece("pawn","black","♟"),
            createPiece("pawn","black","♟"),
            createPiece("pawn","black","♟")
        ],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null],
        [
            createPiece("pawn","white","♙"),
            createPiece("pawn","white","♙"),
            createPiece("pawn","white","♙"),
            createPiece("pawn","white","♙"),
            createPiece("pawn","white","♙"),
            createPiece("pawn","white","♙"),
            createPiece("pawn","white","♙"),
            createPiece("pawn","white","♙")
        ],
        [
            createPiece("rook","white","♖"),
            createPiece("knight","white","♘"),
            createPiece("bishop","white","♗"),
            createPiece("queen","white","♕"),
            createPiece("king","white","♔"),
            createPiece("bishop","white","♗"),
            createPiece("knight","white","♘"),
            createPiece("rook","white","♖")
        ]
    ];
}

function makeRoom(code) {
    return {
        code,
        board: initialBoard(),

        players: {
            white: null,
            black: null
        },

        currentTurn: "white",

        extraTurns: {
            white: 0,
            black: 0
        },

        frozenTurns: {
            white: 0,
            black: 0
        },

        deadPieces: {
            white: [],
            black: []
        },

        moves: [],

        time: {
            white: 600,
            black: 600
        },

        gameEnded: false
    };
}

function inside(r,c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function clearPath(board, fr, fc, tr, tc) {
    const dr = Math.sign(tr - fr);
    const dc = Math.sign(tc - fc);

    let r = fr + dr;
    let c = fc + dc;

    while (r !== tr || c !== tc) {
        if (board[r][c]) return false;
        r += dr;
        c += dc;
    }

    return true;
}

function canMove(room, fr, fc, tr, tc) {
    if (!inside(tr,tc)) return false;

    const p = room.board[fr][fc];
    const target = room.board[tr][tc];

    if (!p) return false;

    if (target && target.color === p.color) return false;

    if (p.type === "pawn" && p.gun) return false;
    if (p.type === "turret") return false;

    const dr = Math.abs(tr-fr);
    const dc = Math.abs(tc-fc);

    if (p.type === "pawn" || p.type === "king") {
        return dr <= 1 &&
               dc <= 1 &&
               !(dr === 0 && dc === 0);
    }

    if (p.type === "knight") {
        return (
            (dr === 2 && dc === 1) ||
            (dr === 1 && dc === 2)
        );
    }

    if (p.type === "rook") {
        if (fr !== tr && fc !== tc) return false;
        return clearPath(room.board,fr,fc,tr,tc);
    }

    if (p.type === "bishop") {
        if (dr !== dc) return false;
        return clearPath(room.board,fr,fc,tr,tc);
    }

    if (p.type === "queen") {
        if (
            fr !== tr &&
            fc !== tc &&
            dr !== dc
        ) return false;

        return clearPath(room.board,fr,fc,tr,tc);
    }

    if (p.type === "wildHorse") {
        return dr <= 2 &&
               dc <= 2 &&
               !(dr === 0 && dc === 0);
    }

    if (p.type === "cavalry") {
        return (
            (fr === tr || fc === tc) &&
            !(dr === 0 && dc === 0)
        );
    }

    if (p.type === "necromancer") {
        if (dr === dc && dr !== 0) {
            return clearPath(room.board,fr,fc,tr,tc);
        }

        return dr <= 1 &&
               dc <= 1 &&
               !(dr === 0 && dc === 0);
    }

    return false;
}

function squareName(r,c) {
    return "abcdefgh"[c] + (8-r);
}

function addMove(room, text) {
    room.moves.push(text);
}

function capture(room, r, c) {
    const p = room.board[r][c];

    if (!p) return null;

    p.deathRow = r;
    p.deathCol = c;

    room.deadPieces[p.color].push(p);
    room.board[r][c] = null;

    if (p.type === "king") {
        room.frozenTurns[p.color] = 2;
    }

    return p;
}

function finishIfNeeded(room) {
    let white = 0;
    let black = 0;

    for (let r=0;r<8;r++) {
        for (let c=0;c<8;c++) {
            const p = room.board[r][c];

            if (!p) continue;

            if (p.color === "white") white++;
            else black++;
        }
    }

    if (white === 0) {
        room.gameEnded = true;
        return "black";
    }

    if (black === 0) {
        room.gameEnded = true;
        return "white";
    }

    return null;
}

function nextTurn(room) {
    room.currentTurn =
        room.currentTurn === "white"
            ? "black"
            : "white";

    /*
     * 네크로맨서 추가 턴.
     *
     * 현재 턴에게 extraTurns가 있으면
     * 턴을 다시 넘기지 않는다.
     *
     * 즉:
     *
     * WHITE
     * BLACK
     * BLACK
     * WHITE
     */
    if (room.extraTurns[room.currentTurn] > 0) {
        room.extraTurns[room.currentTurn]--;
        return;
    }

    /*
     * 킹이 잡힌 진영의 행동불능 턴.
     */
    if (room.frozenTurns[room.currentTurn] > 0) {
        room.frozenTurns[room.currentTurn]--;

        room.currentTurn =
            room.currentTurn === "white"
                ? "black"
                : "white";
    }
}

function broadcast(room) {
    const data = JSON.stringify({
        type: "state",
        board: room.board,
        currentTurn: room.currentTurn,
        moves: room.moves,
        time: room.time,
        gameEnded: room.gameEnded,
        players: {
            white: !!room.players.white,
            black: !!room.players.black
        }
    });

    for (const color of ["white","black"]) {
        const ws = room.players[color];

        if (
            ws &&
            ws.readyState === WebSocket.OPEN
        ) {
            ws.send(data);
        }
    }
}

function sendError(ws, message) {
    ws.send(JSON.stringify({
        type: "error",
        message
    }));
}

function handleAction(room, ws, action) {

    let playerColor = null;

    if (room.players.white === ws) {
        playerColor = "white";
    }

    if (room.players.black === ws) {
        playerColor = "black";
    }

    if (!playerColor) {
        sendError(ws,"게임에 참가하지 않았습니다.");
        return;
    }

    if (action.type === "restart") {

        if (!room.gameEnded) {
            sendError(ws,"게임이 아직 끝나지 않았습니다.");
            return;
        }

        const fresh = makeRoom(room.code);

        room.board = fresh.board;
        room.currentTurn = fresh.currentTurn;
        room.extraTurns = fresh.extraTurns;
        room.frozenTurns = fresh.frozenTurns;
        room.deadPieces = fresh.deadPieces;
        room.moves = fresh.moves;
        room.time = fresh.time;
        room.gameEnded = fresh.gameEnded;

        broadcast(room);
        return;
    }

    if (room.gameEnded) {
        sendError(ws,"게임이 종료되었습니다.");
        return;
    }

    if (room.currentTurn !== playerColor) {
        sendError(ws,"상대방의 턴입니다.");
        return;
    }

    if (
        room.frozenTurns[playerColor] > 0
    ) {
        sendError(ws,"킹이 잡혀 현재 움직일 수 없습니다.");
        return;
    }

    if (action.type === "move") {

        const {
            fr,fc,tr,tc
        } = action;

        const p = room.board[fr]?.[fc];

        if (
            !p ||
            p.color !== playerColor
        ) {
            sendError(ws,"잘못된 기물입니다.");
            return;
        }

        if (
            !canMove(
                room,
                fr,fc,tr,tc
            )
        ) {
            sendError(ws,"불가능한 이동입니다.");
            return;
        }

        const target =
            room.board[tr][tc];

        let notation =
            squareName(tr,tc);

        if (target) {
            notation =
                squareName(fr,fc) +
                "x" +
                squareName(tr,tc);

            capture(
                room,
                tr,tc
            );
        }

        /*
         * 야생마가 잡으면
         * 상대 기물과 함께 죽는다.
         */
        if (target &&
            p.type === "wildHorse") {

            p.deathRow = tr;
            p.deathCol = tc;

            room.deadPieces[p.color].push(p);

            room.board[fr][fc] = null;

            addMove(room,notation);

            finishIfNeeded(room);
            nextTurn(room);
            broadcast(room);

            return;
        }

        room.board[tr][tc] = p;
        room.board[fr][fc] = null;

        addMove(room,notation);

        finishIfNeeded(room);
        nextTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 총 장착
     */
    if (action.type === "gun") {

        const p =
            room.board[action.r]?.[action.c];

        if (
            !p ||
            p.color !== playerColor ||
            p.type !== "pawn" ||
            p.gun
        ) {
            sendError(ws,"총을 장착할 수 없습니다.");
            return;
        }

        p.gun = true;

        addMove(
            room,
            squareName(
                action.r,
                action.c
            ) + "[G]"
        );

        nextTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 총 공격
     */
    if (action.type === "gunAttack") {

        const p =
            room.board[action.fr]?.[action.fc];

        const target =
            room.board[action.tr]?.[action.tc];

        if (
            !p ||
            p.color !== playerColor ||
            !p.gun ||
            !target ||
            target.color === playerColor
        ) {
            sendError(ws,"총 공격이 불가능합니다.");
            return;
        }

        const dr =
            Math.abs(
                action.tr - action.fr
            );

        const dc =
            Math.abs(
                action.tc - action.fc
            );

        if (
            dr > 3 ||
            dc > 3
        ) {
            sendError(ws,"총의 7x7 범위를 벗어났습니다.");
            return;
        }

        capture(
            room,
            action.tr,
            action.tc
        );

        addMove(
            room,
            squareName(
                action.fr,
                action.fc
            ) +
            "[G]x" +
            squareName(
                action.tr,
                action.tc
            )
        );

        finishIfNeeded(room);
        nextTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 포탑 공격
     */
    if (action.type === "turretAttack") {

        const turret =
            room.board[action.fr]?.[action.fc];

        const target =
            room.board[action.tr]?.[action.tc];

        if (
            !turret ||
            turret.color !== playerColor ||
            turret.type !== "turret" ||
            turret.turretDisabled ||
            turret.ammo <= 0 ||
            !target ||
            target.color === playerColor ||
            target.type === "king"
        ) {
            sendError(ws,"포탑 공격이 불가능합니다.");
            return;
        }

        turret.ammo--;

        /*
         * 포탑은 공격할 때마다
         * 탄약 하나를 소비.
         */
        capture(
            room,
            action.tr,
            action.tc
        );

        addMove(
            room,
            squareName(
                action.fr,
                action.fc
            ) +
            "[T]x" +
            squareName(
                action.tr,
                action.tc
            )
        );

        finishIfNeeded(room);
        nextTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 합체
     */
    if (action.type === "combine") {

        const a =
            room.board[action.fr]?.[action.fc];

        const b =
            room.board[action.tr]?.[action.tc];

        if (
            !a ||
            !b ||
            a.color !== playerColor ||
            b.color !== playerColor
        ) {
            sendError(ws,"합체할 수 없습니다.");
            return;
        }

        let result = null;

        if (
            a.type === "knight" &&
            b.type === "knight"
        ) {
            result = "wildHorse";
        }

        else if (
            a.type === "bishop" &&
            b.type === "bishop"
        ) {
            result = "necromancer";
        }

        else if (
            (
                a.type === "pawn" &&
                b.type === "rook"
            ) ||
            (
                a.type === "rook" &&
                b.type === "pawn"
            )
        ) {
            result = "turret";
        }

        else if (
            (
                a.type === "pawn" &&
                b.type === "knight"
            ) ||
            (
                a.type === "knight" &&
                b.type === "pawn"
            )
        ) {
            result = "cavalry";
        }

        if (!result) {
            sendError(ws,"이 두 기물은 합체할 수 없습니다.");
            return;
        }

        if (
            a.gun ||
            b.gun
        ) {
            sendError(ws,"총이 장착된 폰은 합체할 수 없습니다.");
            return;
        }

        /*
         * 폰 + 룩:
         * 폰이 룩 자리로 이동.
         *
         * 폰 + 나이트:
         * 폰이 나이트 자리로 이동.
         *
         * 나이트 + 나이트,
         * 비숍 + 비숍:
         * 첫 번째 기물이 두 번째 자리로 이동.
         */

        let finalR = action.tr;
        let finalC = action.tc;

        let fromR = action.fr;
        let fromC = action.fc;

        if (
            result === "turret" ||
            result === "cavalry"
        ) {
            if (a.type === "pawn") {
                finalR = action.tr;
                finalC = action.tc;
            } else {
                finalR = action.fr;
                finalC = action.fc;
            }
        }

        room.board[action.fr][action.fc] = null;
        room.board[action.tr][action.tc] = null;

        let symbol = "";

        if (result === "wildHorse") {
            symbol =
                playerColor === "white"
                    ? "♘"
                    : "♞";
        }

        if (result === "necromancer") {
            symbol =
                playerColor === "white"
                    ? "♗"
                    : "♝";
        }

        if (result === "turret") {
            symbol =
                playerColor === "white"
                    ? "♖"
                    : "♜";
        }

        if (result === "cavalry") {
            symbol =
                playerColor === "white"
                    ? "♘"
                    : "♞";
        }

        room.board[finalR][finalC] =
            createPiece(
                result,
                playerColor,
                symbol
            );

        const codes = {
            wildHorse: "W",
            necromancer: "N",
            turret: "T",
            cavalry: "C"
        };

        addMove(
            room,
            squareName(
                fromR,
                fromC
            ) +
            "[" +
            codes[result] +
            "]" +
            squareName(
                finalR,
                finalC
            )
        );

        nextTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 네크로맨서 부활
     */
    if (action.type === "resurrect") {

        const necro =
            room.board[action.nr]?.[action.nc];

        if (
            !necro ||
            necro.color !== playerColor ||
            necro.type !== "necromancer"
        ) {
            sendError(ws,"네크로맨서가 아닙니다.");
            return;
        }

        const list =
            room.deadPieces[playerColor];

        const index =
            list.findIndex(
                p =>
                    p.deathRow === action.tr &&
                    p.deathCol === action.tc &&
                    p.type !== "king" &&
                    p.type !== "queen"
            );

        if (index === -1) {
            sendError(ws,"부활시킬 수 없는 기물입니다.");
            return;
        }

        if (
            room.board[action.tr][action.tc]
        ) {
            sendError(ws,"죽었던 자리가 차 있습니다.");
            return;
        }

        const revived =
            list[index];

        list.splice(index,1);

        revived.deathRow = null;
        revived.deathCol = null;

        room.board[action.tr][action.tc] =
            revived;

        addMove(
            room,
            "N+" +
            revived.type +
            "@" +
            squareName(
                action.tr,
                action.tc
            )
        );

        /*
         * 핵심:
         *
         * 부활한 쪽이 아니라
         * 상대에게 추가 턴 1개.
         *
         * 기본 상대 턴 + 추가 턴
         * = 상대가 총 2턴.
         */
        const opponent =
            playerColor === "white"
                ? "black"
                : "white";

        room.extraTurns[opponent]++;

        nextTurn(room);
        broadcast(room);

        return;
    }
}

const server = http.createServer((req,res) => {

    let filePath =
        req.url === "/"
            ? path.join(
                __dirname,
                "public",
                "index.html"
            )
            : path.join(
                __dirname,
                "public",
                req.url
            );

    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not Found");
        return;
    }

    const ext =
        path.extname(filePath);

    const types = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript"
    };

    res.writeHead(
        200,
        {
            "Content-Type":
                types[ext] ||
                "text/plain"
        }
    );

    res.end(
        fs.readFileSync(filePath)
    );
});

const wss =
    new WebSocket.Server({
        server
    });

wss.on("connection", ws => {

    ws.on("message", raw => {

        let msg;

        try {
            msg =
                JSON.parse(raw.toString());
        }

        catch {
            sendError(
                ws,
                "잘못된 데이터입니다."
            );
            return;
        }


        /*
         * 방 생성/참가
         */
        if (
            msg.type === "join"
        ) {

            const code =
                String(msg.room)
                    .trim()
                    .toUpperCase();


            if (!code) {
                sendError(
                    ws,
                    "방 코드를 입력하세요."
                );
                return;
            }


            let room =
                rooms.get(code);


            if (!room) {

                room =
                    makeRoom(code);

                rooms.set(
                    code,
                    room
                );
            }


            let color = null;


            if (!room.players.white) {
                room.players.white = ws;
                color = "white";
            }

            else if (!room.players.black) {
                room.players.black = ws;
                color = "black";
            }

            else {
                sendError(
                    ws,
                    "방이 가득 찼습니다."
                );
                return;
            }


            ws.room = code;
            ws.color = color;


            ws.send(
                JSON.stringify({
                    type: "joined",
                    color,
                    room: code
                })
            );


            broadcast(room);

            return;
        }


        /*
         * 실제 게임 액션
         */
        if (
            msg.type === "action"
        ) {

            const room =
                rooms.get(ws.room);

            if (!room) {
                sendError(
                    ws,
                    "방을 찾을 수 없습니다."
                );
                return;
            }

            handleAction(
                room,
                ws,
                msg.action
            );
        }
    });


    ws.on("close", () => {

        const room =
            rooms.get(ws.room);

        if (!room) return;


        if (
            room.players.white === ws
        ) {
            room.players.white = null;
        }

        if (
            room.players.black === ws
        ) {
            room.players.black = null;
        }


        /*
         * 두 명 모두 나가면
         * 방 삭제.
         */
        if (
            !room.players.white &&
            !room.players.black
        ) {
            rooms.delete(ws.room);
        }
    });
});


/*
 * 서버 시간 처리
 */
setInterval(() => {

    for (const room of rooms.values()) {

        if (
            room.gameEnded ||
            !room.players.white ||
            !room.players.black
        ) {
            continue;
        }

        room.time[room.currentTurn]--;

        if (
            room.time[room.currentTurn] <= 0
        ) {

            room.time[room.currentTurn] = 0;

            room.gameEnded = true;
        }

        broadcast(room);
    }

},1000);


server.listen(
    PORT,
    () => {
        console.log(
            `Custom Chess server running on http://localhost:${PORT}`
        );
    }
);
