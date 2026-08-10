const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const rooms = new Map();

/*
 * 특성(속성) 시스템.
 *
 * 장갑(armored): 룩과 결합해 만들어진 기물(포탑/전차)이 갖는다. 목숨이 2개.
 * 관통(piercing): 이름에 "전차"나 "포"가 들어간 기물(전차/포탑)이 갖는다.
 * 화(fire): 게임 시작 시 보드 전체에서 무작위로 기물 딱 1개에게 부여된다.
 * 냉(cold): 게임 시작 시 보드 전체에서 무작위로 기물 딱 1개에게 부여된다
 *           (화 속성을 받은 기물과는 겹치지 않도록 한다).
 *           냉 속성 기물은 관통 또는 화 속성을 가진 공격에만 피해를 입는다.
 */
function computeAttributes(type) {
    const armored = type === "turret" || type === "tank";
    const piercing = type === "tank" || type === "turret"; // 전차 / 포(탑)
    return {
        armored,
        piercing,
        fire: false,
        cold: false
    };
}

function createPiece(type, color, symbol) {
    const attributes = computeAttributes(type);

    return {
        type,
        color,
        symbol,
        gun: false,
        ammo: type === "turret" ? 8 : 0,
        maxAmmo: type === "turret" ? 8 : 0,
        turretHits: 0,
        turretDisabled: false,
        hasMoved: false,
        deathRow: null,
        deathCol: null,
        attributes,
        lives: attributes.armored ? 2 : 1
    };
}

/*
 * 공격자가 방어자에게 피해를 줄 수 있는지 여부.
 * 냉 속성 기물은 관통/화 속성 공격에만 피해를 입는다.
 */
function canDamage(attackerAttrs, defenderAttrs) {
    if (!defenderAttrs?.cold) return true;
    return !!(attackerAttrs?.piercing || attackerAttrs?.fire);
}

/*
 * 냉/화 속성을 보드 전체에서 딱 1개씩만 무작위로 부여한다(진영 구분 없음).
 * 킹은 대상에서 제외한다(킹이 사실상 무적이 되는 것을 막기 위함).
 * 같은 기물이 냉/화를 동시에 받지 않도록 한다.
 */
function assignRandomAttributes(board) {
    const candidates = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && p.type !== "king") {
                candidates.push(p);
            }
        }
    }

    if (candidates.length === 0) return;

    const coldPick = candidates[Math.floor(Math.random() * candidates.length)];
    coldPick.attributes.cold = true;

    const fireCandidates = candidates.filter(p => p !== coldPick);
    const firePool = fireCandidates.length > 0 ? fireCandidates : candidates;
    const firePick = firePool[Math.floor(Math.random() * firePool.length)];
    firePick.attributes.fire = true;
}

function initialBoard() {
    const board = [
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

    assignRandomAttributes(board);

    return board;
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

        score: {
            white: 0,
            black: 0
        },

        moveCount: 0,

        singularities: [],

        colossusReady: {
            white: false,
            black: false
        },

        gameEnded: false
    };
}

/*
 * 기물 점수표.
 *
 * 폰 1 / 나이트,비숍 3 / 룩 5 / 퀸 9 / 킹 2
 * 야생마 4 / 네크로맨서 4 / 기마병 6 / 총든 폰 3
 *
 * 포탑/전차/거신병은 별도 규칙에 없어 임의로 배정.
 */
const PIECE_VALUE = {
    pawn: 1,
    knight: 3,
    bishop: 3,
    rook: 5,
    queen: 9,
    king: 2,
    wildHorse: 4,
    necromancer: 4,
    cavalry: 6,
    turret: 5,
    tank: 8,
    colossus: 0
};

function pieceValue(p) {
    if (!p) return 0;
    if (p.type === "pawn" && p.gun) return 3;
    return PIECE_VALUE[p.type] || 0;
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

/*
 * 이동 가능 여부.
 *
 * 규칙 1: 자신의 기물이 있는 칸으로도 이동(=처치)할 수 있어야 하므로
 * 같은 색 기물이라는 이유만으로 막지 않는다.
 */
function canMove(room, fr, fc, tr, tc) {
    if (!inside(tr,tc)) return false;
    if (fr === tr && fc === tc) return false;

    const p = room.board[fr][fc];

    if (!p) return false;

    if (p.type === "turret") return false;
    if (p.type === "pawn" && p.gun) return false;

    const dr = Math.abs(tr-fr);
    const dc = Math.abs(tc-fc);

    if (p.type === "pawn" || p.type === "king" || p.type === "colossus") {
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
        // 룩의 이동범위 + 기물을 뛰어넘을 수 있음 (clearPath 체크 없음)
    }

    if (p.type === "necromancer") {
        if (dr === dc && dr !== 0) {
            return clearPath(room.board,fr,fc,tr,tc);
        }

        return dr <= 1 &&
               dc <= 1 &&
               !(dr === 0 && dc === 0);
    }

    if (p.type === "tank") {
        if (fr !== tr && fc !== tc) return false;
        return true; // 지나가는 길의 기물을 밀어버리므로 clearPath 불필요
    }

    return false;
}

/*
 * 캐슬링.
 */
function castleInfo(fr, fc, tc) {
    if (tc > fc) {
        return {
            rookFrom: { r: fr, c: 7 },
            rookTo: { r: fr, c: 5 },
            pathCols: [fc+1, fc+2]
        };
    }

    return {
        rookFrom: { r: fr, c: 0 },
        rookTo: { r: fr, c: 3 },
        pathCols: [fc-1, fc-2, fc-3]
    };
}

function canCastle(room, playerColor, fr, fc, tr, tc) {
    const king = room.board[fr][fc];

    if (!king || king.type !== "king" || king.color !== playerColor) return null;
    if (king.hasMoved) return null;
    if (fr !== tr) return null;
    if (Math.abs(tc - fc) !== 2) return null;

    const info = castleInfo(fr, fc, tc);
    const rook = room.board[info.rookFrom.r]?.[info.rookFrom.c];

    if (!rook || rook.type !== "rook" || rook.color !== playerColor || rook.hasMoved) return null;

    for (const c of info.pathCols) {
        if (room.board[fr][c]) return null;
    }

    return info;
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

    const capturingColor = p.color === "white" ? "black" : "white";
    room.score[capturingColor] += pieceValue(p);

    if (p.type === "king") {
        room.frozenTurns[p.color] = 2;
        room.colossusReady[capturingColor] = true;
    }

    return p;
}

/*
 * 원거리/스플래시 공격(총/포탑/전차/거신병) 판정.
 *
 * 장갑(armored) 속성 기물은 목숨이 2개라 한 번 맞아도 죽지 않는다
 * (포탑은 기존처럼 turretDisabled로 표시된다).
 * 냉(cold) 속성 기물은 관통/화 속성 공격이 아니면 아예 피해를 입지 않는다.
 *
 * 일반 이동 처치(capture)는 그 칸을 밟고 지나가야 하므로 항상 즉시 제거되며
 * 이 함수를 거치지 않는다.
 */
function damageOrKill(room, r, c, attackerAttrs) {
    const p = room.board[r][c];

    if (!p) return { hit: false };

    if (!canDamage(attackerAttrs, p.attributes)) {
        return { hit: false, blocked: true, piece: p };
    }

    if (p.lives > 1) {
        p.lives--;

        if (p.type === "turret") {
            p.turretDisabled = true;
            p.turretHits = (p.turretHits || 0) + 1;
        }

        return { hit: true, killed: false, piece: p };
    }

    const killed = capture(room, r, c);
    return { hit: true, killed: true, piece: killed };
}

function colossusBlast(room, cr, cc, attackerAttrs) {
    for (let r = cr-2; r <= cr+2; r++) {
        for (let c = cc-2; c <= cc+2; c++) {
            if (r === cr && c === cc) continue;
            if (!inside(r,c)) continue;
            if (room.board[r][c]) damageOrKill(room, r, c, attackerAttrs);
        }
    }
}

function tankRampage(room, fr, fc, tr, tc, attackerAttrs) {
    const horizontal = fr === tr;
    const dr = Math.sign(tr - fr);
    const dc = Math.sign(tc - fc);

    let r = fr + dr;
    let c = fc + dc;

    const cells = [];

    while (true) {
        cells.push([r,c]);
        if (r === tr && c === tc) break;
        r += dr;
        c += dc;
    }

    for (const [pr,pc] of cells) {
        if (room.board[pr][pc]) damageOrKill(room, pr, pc, attackerAttrs);

        if (horizontal) {
            if (inside(pr-1,pc) && room.board[pr-1][pc]) damageOrKill(room, pr-1, pc, attackerAttrs);
            if (inside(pr+1,pc) && room.board[pr+1][pc]) damageOrKill(room, pr+1, pc, attackerAttrs);
        } else {
            if (inside(pr,pc-1) && room.board[pr][pc-1]) damageOrKill(room, pr, pc-1, attackerAttrs);
            if (inside(pr,pc+1) && room.board[pr][pc+1]) damageOrKill(room, pr, pc+1, attackerAttrs);
        }
    }
}

function countPiece(room, color, type) {
    let n = 0;

    for (const row of room.board) {
        for (const p of row) {
            if (p && p.color === color && p.type === type) n++;
        }
    }

    return n;
}

/*
 * 30수 이후 특정 기물 조합을 희생하여 거신병 소환.
 * 폰4 / 나이트2 / 비숍2 / 퀸1 / 킹1 / 룩1
 */
function sacrificeColossusEligible(room, color) {
    return room.moveCount >= 30 &&
        countPiece(room,color,"pawn") >= 4 &&
        countPiece(room,color,"knight") >= 2 &&
        countPiece(room,color,"bishop") >= 2 &&
        countPiece(room,color,"queen") >= 1 &&
        countPiece(room,color,"king") >= 1 &&
        countPiece(room,color,"rook") >= 1;
}

function performSacrifice(room, color) {
    const need = { pawn:4, knight:2, bishop:2, queen:1, king:1, rook:1 };

    for (const type of Object.keys(need)) {
        let remaining = need[type];

        for (let r = 0; r < 8 && remaining > 0; r++) {
            for (let c = 0; c < 8 && remaining > 0; c++) {
                const p = room.board[r][c];

                if (p && p.color === color && p.type === type) {
                    room.board[r][c] = null;
                    remaining--;
                }
            }
        }
    }
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
    room.moveCount++;

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

/*
 * 네크로맨서 특이점 처리.
 *
 * - 특이점 칸에 기물이 없고 수리가 필요 없는 상태라면, 2수마다 폰을 소환한다.
 * - 특이점 칸이 적에게 점령당하면 수리 필요 상태로 전환된다.
 * - 적이 그 칸을 벗어나면(비거나 아군이 점령하면) 수리를 기다리는 상태가 되고,
 *   소유자가 repairSingularity 액션으로 한 턴을 소모해야 다시 가동된다.
 */
function processSingularities(room) {
    for (const s of room.singularities) {
        const occupant = room.board[s.r][s.c];

        if (occupant && occupant.color !== s.color) {
            s.needsRepair = true;
            s.ticks = 0;
            continue;
        }

        if (s.needsRepair) {
            // 적이 벗어날 때까지는 계속 대기(수리는 별도 액션으로만 가능)
            continue;
        }

        if (occupant) {
            // 아군 기물이 올라와 있으면 소환을 쉰다(카운트는 유지하지 않는다)
            continue;
        }

        s.ticks++;

        if (s.ticks >= 2) {
            s.ticks = 0;

            room.board[s.r][s.c] = createPiece(
                "pawn",
                s.color,
                s.color === "white" ? "♙" : "♟"
            );
        }
    }
}

function advanceTurn(room) {
    nextTurn(room);
    processSingularities(room);
}

function broadcast(room) {
    const data = JSON.stringify({
        type: "state",
        board: room.board,
        currentTurn: room.currentTurn,
        moves: room.moves,
        time: room.time,
        score: room.score,
        moveCount: room.moveCount,
        singularities: room.singularities,
        colossusReady: room.colossusReady,
        colossusSacrificeReady: {
            white: sacrificeColossusEligible(room,"white"),
            black: sacrificeColossusEligible(room,"black")
        },
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
        room.score = fresh.score;
        room.moveCount = fresh.moveCount;
        room.singularities = fresh.singularities;
        room.colossusReady = fresh.colossusReady;
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

        /*
         * 캐슬링 시도.
         */
        if (p.type === "king" && fr === tr && Math.abs(tc - fc) === 2) {

            const info = canCastle(room, playerColor, fr, fc, tr, tc);

            if (!info) {
                sendError(ws,"캐슬링이 불가능합니다.");
                return;
            }

            room.board[tr][tc] = p;
            room.board[fr][fc] = null;
            p.hasMoved = true;

            const rook = room.board[info.rookFrom.r][info.rookFrom.c];
            room.board[info.rookTo.r][info.rookTo.c] = rook;
            room.board[info.rookFrom.r][info.rookFrom.c] = null;
            if (rook) rook.hasMoved = true;

            addMove(room, tc > fc ? "O-O" : "O-O-O");

            finishIfNeeded(room);
            advanceTurn(room);
            broadcast(room);

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

        /*
         * 전차: 지나간 경로와 그 옆칸의 모든 기물을 죽이고
         * 1회성으로 자폭한다.
         */
        if (p.type === "tank") {
            tankRampage(room, fr, fc, tr, tc, p.attributes);
            room.board[fr][fc] = null;
            room.board[tr][tc] = null;

            addMove(room, squareName(fr,fc) + "[TANK]" + squareName(tr,tc));

            finishIfNeeded(room);
            advanceTurn(room);
            broadcast(room);

            return;
        }

        const target =
            room.board[tr][tc];

        if (target && !canDamage(p.attributes, target.attributes)) {
            sendError(ws,"냉 속성 기물은 이 공격으로 처치할 수 없습니다.");
            return;
        }

        let notation =
            squareName(tr,tc);

        /*
         * 규칙 4: 백프로모션.
         *
         * 폰이 자신의 뒷랭크(백=1랭크=row7 / 흑=8랭크=row0)에 도달하면 발동한다.
         * - 그 칸에 자신의 표준 기물(퀸/룩/비숍/나이트)이 있었다면, 강제로 그 기물로 변한다.
         * - 그 칸이 비어 있었다면, 원하는 표준 기물로 자유롭게 변한다.
         * - 적 기물을 잡으며 도달한 경우엔 일반 처치일 뿐, 프로모션은 없다.
         */
        const STANDARD_PROMOTION_TYPES = ["queen","rook","bishop","knight"];
        const backRank = p.color === "white" ? 7 : 0;
        const atBackRank = p.type === "pawn" && tr === backRank;

        const forcedPromotionType =
            atBackRank &&
            target &&
            target.color === p.color &&
            STANDARD_PROMOTION_TYPES.includes(target.type)
                ? target.type
                : null;

        const freePromotionEligible =
            atBackRank && !target;

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
         * 야생마는 잡거나(공격자) 잡혔을 때(피격자) 모두
         * 자신도 함께 죽는다.
         */
        if (target &&
            (p.type === "wildHorse" || target.type === "wildHorse")) {

            p.deathRow = fr;
            p.deathCol = fc;

            room.deadPieces[p.color].push(p);

            room.board[fr][fc] = null;

            addMove(room,notation);

            finishIfNeeded(room);
            advanceTurn(room);
            broadcast(room);

            return;
        }

        const promotionSymbols = {
            queen: p.color === "white" ? "♕" : "♛",
            rook: p.color === "white" ? "♖" : "♜",
            bishop: p.color === "white" ? "♗" : "♝",
            knight: p.color === "white" ? "♘" : "♞"
        };

        if (forcedPromotionType) {
            room.board[tr][tc] = createPiece(forcedPromotionType, p.color, promotionSymbols[forcedPromotionType]);
            room.board[fr][fc] = null;

            notation += "=" + forcedPromotionType[0].toUpperCase();
        } else if (
            freePromotionEligible &&
            action.promotion &&
            STANDARD_PROMOTION_TYPES.includes(action.promotion)
        ) {
            room.board[tr][tc] = createPiece(action.promotion, p.color, promotionSymbols[action.promotion]);
            room.board[fr][fc] = null;

            notation += "=" + action.promotion[0].toUpperCase();
        } else {
            p.hasMoved = true;
            room.board[tr][tc] = p;
            room.board[fr][fc] = null;
        }

        /*
         * 거신병: 이동 시 목적지 중심 5x5 칸의 모든 기물을 죽인다.
         */
        if (p.type === "colossus") {
            colossusBlast(room, tr, tc, p.attributes);
        }

        addMove(room,notation);

        finishIfNeeded(room);
        advanceTurn(room);
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

        advanceTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 총 공격 (5x5 범위, 자신의 기물도 공격 가능)
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
            !target
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
            dr > 2 ||
            dc > 2
        ) {
            sendError(ws,"총의 5x5 범위를 벗어났습니다.");
            return;
        }

        damageOrKill(
            room,
            action.tr,
            action.tc,
            p.attributes
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
        advanceTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 포탑 공격.
     *
     * 목표 칸 + 앞/뒤/좌/우 최대 4칸까지 함께 파괴한다 (킹 제외).
     * 자신의 기물도 목표로 삼을 수 있다.
     * 포탑은 2회 공격당해야 파괴된다.
     */
    if (action.type === "turretAttack") {

        const turret =
            room.board[action.fr]?.[action.fc];

        if (
            !turret ||
            turret.color !== playerColor ||
            turret.type !== "turret" ||
            turret.turretDisabled ||
            turret.ammo <= 0
        ) {
            sendError(ws,"포탑 공격이 불가능합니다.");
            return;
        }

        const primary =
            room.board[action.tr]?.[action.tc];

        if (
            !primary ||
            primary.type === "king"
        ) {
            sendError(ws,"포탑 공격이 불가능합니다.");
            return;
        }

        turret.ammo--;

        const hits = [[action.tr,action.tc]];
        const deltas = [[-1,0],[1,0],[0,-1],[0,1]];

        for (const [dr,dc] of deltas) {
            const nr = action.tr + dr;
            const nc = action.tc + dc;

            if (inside(nr,nc) && room.board[nr][nc]) {
                hits.push([nr,nc]);
            }
        }

        for (const [hr,hc] of hits) {
            const victim = room.board[hr][hc];

            if (!victim) continue;
            if (victim.type === "king") continue; // 포탑은 킹을 직접(스플래시 포함) 죽일 수 없다

            damageOrKill(room, hr, hc, turret.attributes);
        }

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
        advanceTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 연성(forge).
     *
     * 합성 가능한 두 기물이 서로 3*3칸 이내(체비셰프 거리 <= 2)에
     * 있어야 연성대를 사용할 수 있다.
     * 결과 기물은 두 기물이 이루는 3*3 영역의 가운데 칸에서 소환된다
     * (두 좌표의 중간지점을 반올림). 단, 포탑은 룩이 있던 자리에서 소환된다.
     */
    if (action.type === "forge") {

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
            sendError(ws,"연성할 수 없습니다.");
            return;
        }

        if (
            a.gun ||
            b.gun
        ) {
            sendError(ws,"총이 장착된 폰은 연성할 수 없습니다.");
            return;
        }

        const chebyshev = Math.max(
            Math.abs(action.fr - action.tr),
            Math.abs(action.fc - action.tc)
        );

        if (chebyshev > 2) {
            sendError(ws,"연성대의 3*3 범위 밖에 있습니다.");
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
            a.type === "rook" &&
            b.type === "rook"
        ) {
            result = "tank";
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
            sendError(ws,"이 두 기물은 연성할 수 없습니다.");
            return;
        }

        /*
         * 포탑: 룩이 있던 자리에서 소환된다.
         * 기마병: 나이트가 있던 자리에서 소환된다(기존 규칙 유지).
         * 그 외: 3*3 영역의 가운데(두 좌표 중간지점, 반올림)에서 소환된다.
         */

        let finalR = Math.round((action.fr + action.tr) / 2);
        let finalC = Math.round((action.fc + action.tc) / 2);

        const fromR = action.fr;
        const fromC = action.fc;

        if (result === "turret") {
            const rookAt = a.type === "rook"
                ? { r: action.fr, c: action.fc }
                : { r: action.tr, c: action.tc };

            finalR = rookAt.r;
            finalC = rookAt.c;
        }

        else if (result === "cavalry") {
            const pawnAt = a.type === "pawn"
                ? { r: action.fr, c: action.fc }
                : { r: action.tr, c: action.tc };

            finalR = pawnAt.r;
            finalC = pawnAt.c;
        }

        const occupant = room.board[finalR][finalC];

        if (
            occupant &&
            !(finalR === action.fr && finalC === action.fc) &&
            !(finalR === action.tr && finalC === action.tc)
        ) {
            sendError(ws,"연성 위치에 다른 기물이 있습니다.");
            return;
        }

        room.board[action.fr][action.fc] = null;
        room.board[action.tr][action.tc] = null;

        const symbols = {
            wildHorse: playerColor === "white" ? "♘" : "♞",
            necromancer: playerColor === "white" ? "♗" : "♝",
            turret: playerColor === "white" ? "♖" : "♜",
            cavalry: playerColor === "white" ? "♘" : "♞",
            tank: playerColor === "white" ? "▣" : "▣"
        };

        room.board[finalR][finalC] =
            createPiece(
                result,
                playerColor,
                symbols[result]
            );

        const codes = {
            wildHorse: "W",
            necromancer: "N",
            turret: "T",
            cavalry: "C",
            tank: "TK"
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

        advanceTurn(room);
        broadcast(room);

        return;
    }


    /*
     * 네크로맨서 특이점 생성.
     *
     * 자신의 네크로맨서 주위 3*3칸(체비셰프 거리 <= 1)의 빈 칸에
     * 특이점을 만들 수 있다. 한 턴을 소모한다.
     */
    if (action.type === "createSingularity") {

        const { r, c } = action;

        if (!inside(r,c)) {
            sendError(ws,"칸 위치가 잘못되었습니다.");
            return;
        }

        const necro = room.board[action.necroR]?.[action.necroC];

        if (
            !necro ||
            necro.color !== playerColor ||
            necro.type !== "necromancer"
        ) {
            sendError(ws,"네크로맨서가 아닙니다.");
            return;
        }

        const dist = Math.max(
            Math.abs(action.necroR - r),
            Math.abs(action.necroC - c)
        );

        if (dist > 1) {
            sendError(ws,"네크로맨서 주위 3*3 범위를 벗어났습니다.");
            return;
        }

        if (room.board[r][c]) {
            sendError(ws,"빈 칸이 아닙니다.");
            return;
        }

        if (room.singularities.some(s => s.r === r && s.c === c)) {
            sendError(ws,"이미 특이점이 있습니다.");
            return;
        }

        room.singularities.push({
            r, c,
            color: playerColor,
            ticks: 0,
            needsRepair: false
        });

        addMove(room, "[SINGULARITY]" + squareName(r,c));

        finishIfNeeded(room);
        advanceTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 특이점 수리.
     *
     * 적에게 점령당했다가 적이 벗어난 특이점을 다시 가동시킨다.
     * 한 턴을 소모한다.
     */
    if (action.type === "repairSingularity") {

        const { r, c } = action;

        const singularity = room.singularities.find(
            s => s.r === r && s.c === c && s.color === playerColor
        );

        if (!singularity || !singularity.needsRepair) {
            sendError(ws,"수리할 특이점이 없습니다.");
            return;
        }

        const occupant = room.board[r][c];

        if (occupant && occupant.color !== playerColor) {
            sendError(ws,"적 기물이 아직 특이점을 점령하고 있습니다.");
            return;
        }

        singularity.needsRepair = false;
        singularity.ticks = 0;

        addMove(room, "[REPAIR]" + squareName(r,c));

        finishIfNeeded(room);
        advanceTurn(room);
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

        /*
         * 부활할 자리에 기물이 있으면 그 기물을 죽이며 부활한다.
         */
        if (room.board[action.tr][action.tc]) {
            capture(room, action.tr, action.tc);
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

        finishIfNeeded(room);
        advanceTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 거신병 소환.
     *
     * 경로 1: 상대 킹을 잡아 획득한 무료 소환권 사용.
     * 경로 2: 30수 이후, 폰4/나이트2/비숍2/퀸1/킹1/룩1을 희생.
     */
    if (action.type === "summonColossus") {

        const { r, c } = action;

        if (!inside(r,c)) {
            sendError(ws,"칸 위치가 잘못되었습니다.");
            return;
        }

        if (room.board[r][c]) {
            sendError(ws,"빈 칸이 아닙니다.");
            return;
        }

        if (room.colossusReady[playerColor]) {
            room.colossusReady[playerColor] = false;
        }

        else if (sacrificeColossusEligible(room, playerColor)) {
            performSacrifice(room, playerColor);
        }

        else {
            sendError(ws,"거신병을 소환할 수 없습니다.");
            return;
        }

        room.board[r][c] = createPiece(
            "colossus",
            playerColor,
            playerColor === "white" ? "♔" : "♚"
        );

        addMove(
            room,
            "[COLOSSUS]" + squareName(r,c)
        );

        finishIfNeeded(room);
        advanceTurn(room);
        broadcast(room);

        return;
    }
}

const server = http.createServer((req,res) => {

    const urlPath = req.url.split("?")[0];

    let filePath =
        urlPath === "/"
            ? path.join(
                __dirname,
                "public",
                "index.html"
            )
            : path.join(
                __dirname,
                "public",
                urlPath
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
