const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const rooms = new Map();

/*
 * 특성(속성) 시스템.
 *
 * 장갑(armored): 룩과 결합해 만들어진 기물(포탑/전차)과 함대 계열
 *               (함대 편제/잠수함/전함/항공모함)이 갖는다. 목숨이 2개.
 * 관통(piercing): 이름에 "전차"나 "포"가 들어간 기물(전차/포탑),
 *                 그리고 포 특성을 가진 잠수함/전함이 갖는다.
 * 화(fire): 게임 시작 시 보드 전체에서 무작위로 기물 딱 1개에게 부여된다.
 * 냉(cold): 게임 시작 시 화 속성을 받은 기물의 반대 진영에서 무작위로 기물
 *           딱 1개에게 부여된다(같은 진영끼리는 겹치지 않는다).
 *           냉 속성 기물은 관통 또는 화 속성을 가진 공격에만 피해를 입는다.
 */
function computeAttributes(type) {
    const isFleetFamily = type === "fleet" || type === "submarine" || type === "battleship" || type === "carrier";
    const armored = type === "turret" || type === "tank" || isFleetFamily;
    const piercing = type === "tank" || type === "turret" || type === "submarine" || type === "battleship"; // 전차 / 포(탑) / 포 특성을 가진 함선
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
        ammo: type === "turret" ? 1 : 0,
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
 * 냉/화 속성을 보드 전체에서 딱 1개씩만 무작위로 부여하되,
 * 화 속성을 받은 기물의 진영과 냉 속성을 받은 기물의 진영이
 * 서로 반대가 되도록 한다(예: 화가 백에게 가면 냉은 반드시 흑에게 간다).
 * 킹은 대상에서 제외한다(킹이 사실상 무적이 되는 것을 막기 위함).
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

    const firePick = candidates[Math.floor(Math.random() * candidates.length)];
    firePick.attributes.fire = true;

    const oppositeColor = firePick.color === "white" ? "black" : "white";
    const coldCandidates = candidates.filter(p => p !== firePick && p.color === oppositeColor);
    const coldPool = coldCandidates.length > 0
        ? coldCandidates
        : candidates.filter(p => p !== firePick);

    if (coldPool.length === 0) return;

    const coldPick = coldPool[Math.floor(Math.random() * coldPool.length)];
    coldPick.attributes.cold = true;
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

function makeRoom(code, password, name) {
    return {
        code,
        name: name || code,
        password: password || null,
        board: initialBoard(),
        control: initialControl(),
        sea: makeSea(),

        pendingForge: {
            white: null,
            black: null
        },

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
    colossus: 0,
    fleet: 7,
    submarine: 6,
    battleship: 9,
    carrier: 7
};

function pieceValue(p) {
    if (!p) return 0;
    if (p.type === "pawn" && p.gun) return 3;
    return PIECE_VALUE[p.type] || 0;
}

function inside(r,c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
}

/*
 * 바다 칸(36칸).
 *
 * 보드(0~7, 0~7)를 감싸는 테두리 한 칸짜리 링으로, 좌표는 -1~8 범위를 쓴다.
 * (r===-1 || r===8 || c===-1 || c===8) 이면서 -1<=r,c<=8 인 칸이 바다.
 * 함대 계열 기물(함대 편제/잠수함/전함/항공모함, 항공모함 제외 이동 없음)은
 * 이 바다 칸에만 배치할 수 있다.
 */
function isSeaSquare(r,c) {
    if (r < -1 || r > 8 || c < -1 || c > 8) return false;
    return r === -1 || r === 8 || c === -1 || c === 8;
}

function seaKey(r,c) {
    return r + "," + c;
}

function makeSea() {
    const sea = {};

    for (let r = -1; r <= 8; r++) {
        for (let c = -1; c <= 8; c++) {
            if (isSeaSquare(r,c)) sea[seaKey(r,c)] = null;
        }
    }

    return sea;
}

/*
 * 바다/일반 보드 어느 쪽이든 상관없이 좌표로 기물을 읽고/쓰는 헬퍼.
 * 함대 계열 연성(H + 폰/룩/비숍)은 재료 하나가 바다 칸에 있을 수 있으므로 필요하다.
 */
function pieceAt(room, r, c) {
    if (isSeaSquare(r,c)) return room.sea[seaKey(r,c)] || null;
    if (!inside(r,c)) return null;
    return room.board[r][c];
}

function setPieceAt(room, r, c, piece) {
    if (isSeaSquare(r,c)) {
        room.sea[seaKey(r,c)] = piece;
        return;
    }
    if (!inside(r,c)) return;
    room.board[r][c] = piece;
}

/*
 * 칸 지배권.
 *
 * 시작 시 1~4랭크(백 진영, row4~7)는 백이, 5~8랭크(흑 진영, row0~3)는
 * 흑이 지배한다. 이후 어떤 기물이든 그 칸에 새로 "발을 디디면"
 * (이동/캐슬링/부활/거신병 소환/연성 기물 배치/전차가 지나간 경로)
 * 그 즉시 지배권이 그 기물의 팀으로 바뀐다. 한 번 지배한 칸은
 * 그 위의 기물이 사라지거나 이동해 나가도 다른 팀이 다시 밟기
 * 전까지는 계속 지배 상태가 유지된다.
 */
function initialControl() {
    const control = [];
    for (let r = 0; r < 8; r++) {
        control.push(new Array(8).fill(r <= 3 ? "black" : "white"));
    }
    return control;
}

function setControl(room, r, c, color) {
    if (!inside(r,c)) return;
    room.control[r][c] = color;
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
    const p = pieceAt(room, r, c);

    if (!p) return null;

    p.deathRow = r;
    p.deathCol = c;

    room.deadPieces[p.color].push(p);
    setPieceAt(room, r, c, null);

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
    const p = pieceAt(room, r, c);

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

function tankRampage(room, fr, fc, tr, tc, attackerAttrs, color) {
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
        if (color) setControl(room, pr, pc, color);

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

/*
 * 잠수함 시야 필터.
 *
 * 잠수함은 기본적으로 상대방에게 보이지 않는다. 단, 상대방의 전함이
 * 그 잠수함과 인접(체비셰프 거리 <= 1)해 있으면 그때는 보인다.
 * 자신의 잠수함은 항상 자신에게 보인다.
 */
function buildSeaView(room, viewerColor) {
    const view = {};

    for (const key in room.sea) {
        const piece = room.sea[key];

        if (!piece || piece.type !== "submarine" || piece.color === viewerColor) {
            view[key] = piece;
            continue;
        }

        const [sr,sc] = key.split(",").map(Number);
        let detected = false;

        for (const bKey in room.sea) {
            const b = room.sea[bKey];

            if (!b || b.type !== "battleship" || b.color !== viewerColor) continue;

            const [br,bc] = bKey.split(",").map(Number);

            if (Math.max(Math.abs(br-sr), Math.abs(bc-sc)) <= 1) {
                detected = true;
                break;
            }
        }

        view[key] = detected ? piece : null;
    }

    return view;
}

function broadcast(room) {
    for (const color of ["white","black"]) {
        const ws = room.players[color];

        if (
            !ws ||
            ws.readyState !== WebSocket.OPEN
        ) {
            continue;
        }

        const data = JSON.stringify({
            type: "state",
            board: room.board,
            control: room.control,
            sea: buildSeaView(room, color),
            pendingForge: room.pendingForge,
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

        ws.send(data);
    }
}

function sendError(ws, message) {
    ws.send(JSON.stringify({
        type: "error",
        message
    }));
}

/*
 * 로비(방 목록) 처리.
 *
 * 아직 어느 방에도 들어가지 않은 소켓들을 lobbySockets에 담아두고,
 * 방이 새로 생기거나/차거나/사라질 때마다 그 소켓들에게 최신 목록을 보낸다.
 * 비밀번호 자체는 절대 내려보내지 않고, 잠겨있는지 여부만 알려준다.
 */
const lobbySockets = new Set();

function getRoomListPayload() {
    const list = [];

    for (const [code, room] of rooms.entries()) {
        const playerCount =
            (room.players.white ? 1 : 0) +
            (room.players.black ? 1 : 0);

        list.push({
            code,
            name: room.name || code,
            hasPassword: !!room.password,
            playerCount,
            full: playerCount >= 2,
            gameEnded: room.gameEnded
        });
    }

    list.sort((a,b) => a.code.localeCompare(b.code));

    return {
        type: "roomList",
        rooms: list
    };
}

function broadcastLobby() {
    const payload = JSON.stringify(getRoomListPayload());

    for (const ws of lobbySockets) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
        }
    }
}

function generateRoomCode() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code;

    do {
        code = "";
        for (let i = 0; i < 4; i++) {
            code += letters[Math.floor(Math.random() * letters.length)];
        }
    } while (rooms.has(code));

    return code;
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
        room.control = fresh.control;
        room.sea = fresh.sea;
        room.pendingForge = fresh.pendingForge;
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

    if (
        room.pendingForge[playerColor] &&
        action.type !== "placeForged" &&
        action.type !== "cancelForge"
    ) {
        sendError(ws,"먼저 연성한 기물을 배치하거나 취소하세요.");
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
            setControl(room, tr, tc, playerColor);

            const rook = room.board[info.rookFrom.r][info.rookFrom.c];
            room.board[info.rookTo.r][info.rookTo.c] = rook;
            room.board[info.rookFrom.r][info.rookFrom.c] = null;
            if (rook) rook.hasMoved = true;
            setControl(room, info.rookTo.r, info.rookTo.c, playerColor);

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
            tankRampage(room, fr, fc, tr, tc, p.attributes, playerColor);
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

        /*
         * 장갑(목숨 2) 기물을 일반 이동으로 공격했을 때:
         * 완전히 처치하지 않고 목숨만 1 깎는다.
         * 이때 공격한 기물은 그 칸으로 들어가지 않고 원래 자리에 그대로 남는다.
         */
        if (target && target.lives > 1) {
            target.lives--;

            if (target.type === "turret") {
                target.turretDisabled = true;
                target.turretHits = (target.turretHits || 0) + 1;
            }

            addMove(
                room,
                squareName(fr,fc) + "x" + squareName(tr,tc) + "(-1)"
            );

            finishIfNeeded(room);
            advanceTurn(room);
            broadcast(room);

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

            setControl(room, tr, tc, playerColor);

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

        setControl(room, tr, tc, playerColor);

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
     * 목표 칸 + 앞/뒤/좌/우 최대 4칸까지 함께 파괴한다 (킹 포함).
     * 자신의 기물도 목표로 삼을 수 있다.
     * 공격 범위: 자신 기준 3x3(체비셰프 거리 1 이하)은 공격 불가,
     * 최대 7x7(체비셰프 거리 3 이하)까지만 공격 가능.
     * 즉 목표 칸까지의 체비셰프 거리가 2~3이어야 한다.
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

        const turretDist = Math.max(
            Math.abs(action.tr - action.fr),
            Math.abs(action.tc - action.fc)
        );

        if (
            !primary ||
            turretDist < 2 ||
            turretDist > 3
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
     * 잠수함 공격.
     *
     * 인접한(체비셰프 거리 1) 바다 칸만 공격할 수 있다 (해전만 가능,
     * 지상 공격 불가). 포 특성(관통)을 갖는다.
     */
    if (action.type === "submarineAttack") {

        const sub =
            pieceAt(room, action.fr, action.fc);

        if (
            !sub ||
            sub.color !== playerColor ||
            sub.type !== "submarine" ||
            !isSeaSquare(action.fr, action.fc)
        ) {
            sendError(ws,"잠수함 공격이 불가능합니다.");
            return;
        }

        const subDist = Math.max(
            Math.abs(action.tr - action.fr),
            Math.abs(action.tc - action.fc)
        );

        if (
            subDist !== 1 ||
            !isSeaSquare(action.tr, action.tc) ||
            !pieceAt(room, action.tr, action.tc)
        ) {
            sendError(ws,"잠수함은 인접한 바다 칸의 함선만 공격할 수 있습니다.");
            return;
        }

        damageOrKill(room, action.tr, action.tc, sub.attributes);

        addMove(
            room,
            "바다(" + action.fr + "," + action.fc + ")[SUB]x바다(" + action.tr + "," + action.tc + ")"
        );

        finishIfNeeded(room);
        advanceTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 전함 공격.
     *
     * 자신이 있는 바다 칸을 기준으로 3*3(체비셰프 거리 <= 1) 범위를
     * 한꺼번에 공격한다 (자기 자신 제외). 포 특성(관통)을 갖는다.
     */
    if (action.type === "battleshipAttack") {

        const ship =
            pieceAt(room, action.fr, action.fc);

        if (
            !ship ||
            ship.color !== playerColor ||
            ship.type !== "battleship" ||
            !isSeaSquare(action.fr, action.fc)
        ) {
            sendError(ws,"전함 공격이 불가능합니다.");
            return;
        }

        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;

                const nr = action.fr + dr;
                const nc = action.fc + dc;

                if (pieceAt(room, nr, nc)) {
                    damageOrKill(room, nr, nc, ship.attributes);
                }
            }
        }

        addMove(
            room,
            "바다(" + action.fr + "," + action.fc + ")[BS]"
        );

        finishIfNeeded(room);
        advanceTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 항공모함 이동.
     *
     * 자신 기준 7*7(체비셰프 거리 <= 3) 범위 안의 빈 칸으로
     * (경로에 상관없이) 이동할 수 있다.
     */
    if (action.type === "carrierMove") {

        const carrier =
            pieceAt(room, action.fr, action.fc);

        if (
            !carrier ||
            carrier.color !== playerColor ||
            carrier.type !== "carrier"
        ) {
            sendError(ws,"항공모함 이동이 불가능합니다.");
            return;
        }

        const cvDist = Math.max(
            Math.abs(action.tr - action.fr),
            Math.abs(action.tc - action.fc)
        );

        if (
            cvDist === 0 ||
            cvDist > 3 ||
            pieceAt(room, action.tr, action.tc)
        ) {
            sendError(ws,"항공모함 이동이 불가능합니다.");
            return;
        }

        setPieceAt(room, action.fr, action.fc, null);
        setPieceAt(room, action.tr, action.tc, carrier);

        addMove(
            room,
            "바다(" + action.fr + "," + action.fc + ")[CV]바다(" + action.tr + "," + action.tc + ")"
        );

        finishIfNeeded(room);
        advanceTurn(room);
        broadcast(room);

        return;
    }

    /*
     * 연성(forge).
     *
     * 합성 가능한 두 기물이라면 보드 어디에 있든(거리 제한 없이) 연성할 수 있다.
     * 결과 기물은 두 기물 좌표의 중간지점(반올림)에서 소환된다.
     * 단, 포탑은 룩이 있던 자리에서, 기마병은 폰이 있던 자리에서 소환된다.
     */
    if (action.type === "forge") {

        const a =
            pieceAt(room, action.fr, action.fc);

        const b =
            pieceAt(room, action.tr, action.tc);

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

        /*
         * 함대 편제(H) 융합.
         *
         * H + 폰 = 잠수함, H + 룩 = 전함, H + 비숍 = 항공모함.
         * H는 바다 칸에 있으므로 재료 좌표 중 하나는 바다 칸일 수 있다.
         * 결과 기물도 바다 칸에만 배치할 수 있다(placeForged에서 처리).
         */
        const fleetMat = a.type === "fleet" ? a : (b.type === "fleet" ? b : null);
        const otherMat = a.type === "fleet" ? b : a;

        if (fleetMat && otherMat.type !== "fleet") {
            const fusions = { pawn: "submarine", rook: "battleship", bishop: "carrier" };
            const fusionResult = fusions[otherMat.type];

            if (!fusionResult) {
                sendError(ws,"함대 편제와 이 기물은 연성할 수 없습니다.");
                return;
            }

            const fusionLabelGlyph = {
                submarine: "⚓",
                battleship: "⚓",
                carrier: "⚓"
            };

            const fusedPiece = createPiece(
                fusionResult,
                playerColor,
                fusionLabelGlyph[fusionResult]
            );

            if (a.attributes.fire || b.attributes.fire) fusedPiece.attributes.fire = true;
            if (a.attributes.cold || b.attributes.cold) fusedPiece.attributes.cold = true;

            setPieceAt(room, action.fr, action.fc, null);
            setPieceAt(room, action.tr, action.tc, null);

            room.pendingForge[playerColor] = {
                piece: fusedPiece,
                sourceA: { r: action.fr, c: action.fc, piece: a },
                sourceB: { r: action.tr, c: action.tc, piece: b }
            };

            broadcast(room);

            return;
        }

        /*
         * 함대 편제.
         *
         * 폰 세 개(연성대 세 칸)를 함께 연성하면 "함대 편제"가 만들어진다.
         * er/ec가 함께 오면 3재료 연성으로 취급한다.
         * 배치는 다른 연성 기물과 달리 보드 테두리(1행/8행/a열/h열)에만 가능하다.
         */
        const hasThird = action.er !== undefined && action.ec !== undefined;

        if (hasThird) {
            const c =
                room.board[action.er]?.[action.ec];

            if (
                !c ||
                c.color !== playerColor ||
                c.gun
            ) {
                sendError(ws,"연성할 수 없습니다.");
                return;
            }

            if (
                a.type !== "pawn" ||
                b.type !== "pawn" ||
                c.type !== "pawn"
            ) {
                sendError(ws,"이 세 기물은 연성할 수 없습니다.");
                return;
            }

            const fleetPiece = createPiece(
                "fleet",
                playerColor,
                playerColor === "white" ? "⚓" : "⚓"
            );

            if (a.attributes.fire || b.attributes.fire || c.attributes.fire) fleetPiece.attributes.fire = true;
            if (a.attributes.cold || b.attributes.cold || c.attributes.cold) fleetPiece.attributes.cold = true;

            room.board[action.fr][action.fc] = null;
            room.board[action.tr][action.tc] = null;
            room.board[action.er][action.ec] = null;

            room.pendingForge[playerColor] = {
                piece: fleetPiece,
                sourceA: { r: action.fr, c: action.fc, piece: a },
                sourceB: { r: action.tr, c: action.tc, piece: b },
                sourceC: { r: action.er, c: action.ec, piece: c }
            };

            broadcast(room);

            return;
        }

        /*
         * 포탑 재장전.
         *
         * 포탑 + 폰을 연성하면 새 기물을 만들지 않고 포탑의 탄약만 1 늘린다
         * (최대치까지). 폰은 소모되고 포탑은 제자리에 그대로 남는다.
         * 새 기물이 나오는 게 아니라 즉시 효과이므로, 배치 단계 없이
         * 바로 턴을 소모한다.
         * 폰이 화/냉 속성을 갖고 있었다면 포탑도 그 속성을 이어받는다.
         */
        const turretPiece = a.type === "turret" ? a : (b.type === "turret" ? b : null);
        const reloadPawn = a.type === "pawn" ? a : (b.type === "pawn" ? b : null);

        if (turretPiece && reloadPawn && turretPiece !== reloadPawn) {
            if (turretPiece.ammo >= turretPiece.maxAmmo) {
                sendError(ws,"탄약이 이미 가득 찼습니다.");
                return;
            }

            const pawnAt = a.type === "pawn"
                ? { r: action.fr, c: action.fc }
                : { r: action.tr, c: action.tc };

            turretPiece.ammo++;

            if (reloadPawn.attributes.fire) turretPiece.attributes.fire = true;
            if (reloadPawn.attributes.cold) turretPiece.attributes.cold = true;

            room.board[pawnAt.r][pawnAt.c] = null;

            addMove(
                room,
                squareName(pawnAt.r, pawnAt.c) + "[RELOAD]"
            );

            advanceTurn(room);
            broadcast(room);

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

        const symbols = {
            wildHorse: playerColor === "white" ? "♘" : "♞",
            necromancer: playerColor === "white" ? "♗" : "♝",
            turret: playerColor === "white" ? "♖" : "♜",
            cavalry: playerColor === "white" ? "♘" : "♞",
            tank: "▣"
        };

        const craftedPiece = createPiece(
            result,
            playerColor,
            symbols[result]
        );

        /*
         * 화/냉 속성 상속: 연성에 사용된 두 기물 중 하나라도 화/냉 속성을
         * 갖고 있었다면, 새로 만들어진 기물도 그 속성을 갖게 된다.
         */
        if (a.attributes.fire || b.attributes.fire) craftedPiece.attributes.fire = true;
        if (a.attributes.cold || b.attributes.cold) craftedPiece.attributes.cold = true;

        /*
         * 제작 자체는 턴을 소모하지 않는다.
         * 재료 두 기물은 즉시 판 위에서 사라지고, 완성된 기물은
         * "배치를 기다리는" 상태로 보관된다. 이 상태에서는 배치(placeForged)나
         * 취소(cancelForge) 외의 다른 행동을 할 수 없다 (위 가드에서 처리).
         */
        room.board[action.fr][action.fc] = null;
        room.board[action.tr][action.tc] = null;

        room.pendingForge[playerColor] = {
            piece: craftedPiece,
            sourceA: { r: action.fr, c: action.fc, piece: a },
            sourceB: { r: action.tr, c: action.tc, piece: b }
        };

        broadcast(room);

        return;
    }

    /*
     * 연성 취소: 배치하기 전이라면 재료 두 기물을 원래 자리로 되돌린다.
     * 턴을 소모하지 않는다.
     */
    if (action.type === "cancelForge") {

        const pending = room.pendingForge[playerColor];

        if (!pending) {
            sendError(ws,"취소할 연성이 없습니다.");
            return;
        }

        setPieceAt(room, pending.sourceA.r, pending.sourceA.c, pending.sourceA.piece);
        setPieceAt(room, pending.sourceB.r, pending.sourceB.c, pending.sourceB.piece);

        if (pending.sourceC) {
            setPieceAt(room, pending.sourceC.r, pending.sourceC.c, pending.sourceC.piece);
        }

        room.pendingForge[playerColor] = null;

        broadcast(room);

        return;
    }

    /*
     * 연성 기물 배치: 자신이 지배하는 빈 칸에만 배치할 수 있다.
     * 배치는 턴을 소모한다.
     */
    if (action.type === "placeForged") {

        const pending = room.pendingForge[playerColor];

        if (!pending) {
            sendError(ws,"배치할 기물이 없습니다.");
            return;
        }

        const { r, c } = action;

        const isFleetFamily = pending.piece.type === "fleet" ||
            pending.piece.type === "submarine" ||
            pending.piece.type === "battleship" ||
            pending.piece.type === "carrier";

        if (isFleetFamily) {
            if (!isSeaSquare(r,c)) {
                sendError(ws,"함대 계열 기물은 바다 칸에만 배치할 수 있습니다.");
                return;
            }

            if (pieceAt(room,r,c)) {
                sendError(ws,"그 칸에는 이미 기물이 있습니다.");
                return;
            }

            room.sea[seaKey(r,c)] = pending.piece;
            room.pendingForge[playerColor] = null;

            const seaCodes = {
                fleet: "FL",
                submarine: "SUB",
                battleship: "BS",
                carrier: "CV"
            };

            addMove(
                room,
                "[" +
                seaCodes[pending.piece.type] +
                "]" +
                "바다(" + r + "," + c + ")"
            );

            finishIfNeeded(room);
            advanceTurn(room);
            broadcast(room);

            return;
        }

        if (!inside(r,c)) {
            sendError(ws,"칸 위치가 잘못되었습니다.");
            return;
        }

        if (room.board[r][c]) {
            sendError(ws,"그 칸에는 이미 기물이 있습니다.");
            return;
        }

        if (room.control[r][c] !== playerColor) {
            sendError(ws,"자신이 지배하는 칸에만 배치할 수 있습니다.");
            return;
        }

        room.board[r][c] = pending.piece;
        setControl(room, r, c, playerColor);

        room.pendingForge[playerColor] = null;

        const codes = {
            wildHorse: "W",
            necromancer: "N",
            turret: "T",
            cavalry: "C",
            tank: "TK"
        };

        addMove(
            room,
            "[" +
            codes[pending.piece.type] +
            "]" +
            squareName(r,c)
        );

        finishIfNeeded(room);
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

        setControl(room, action.tr, action.tc, playerColor);

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

        setControl(room, r, c, playerColor);

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

    lobbySockets.add(ws);
    ws.send(JSON.stringify(getRoomListPayload()));

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
         * 로비 목록 새로고침 요청.
         */
        if (
            msg.type === "listRooms"
        ) {
            ws.send(JSON.stringify(getRoomListPayload()));
            return;
        }


        /*
         * 방 생성.
         *
         * 코드가 자동으로 생성되고, 만든 사람이 곧바로 백으로 입장한다.
         * 비밀번호는 선택 사항이다.
         */
        if (
            msg.type === "createRoom"
        ) {

            const password =
                typeof msg.password === "string" && msg.password.trim()
                    ? msg.password.trim()
                    : null;

            const name =
                typeof msg.name === "string" && msg.name.trim()
                    ? msg.name.trim().slice(0, 20)
                    : null;

            const code = generateRoomCode();
            const room = makeRoom(code, password, name);

            rooms.set(code, room);

            room.players.white = ws;

            ws.room = code;
            ws.color = "white";

            lobbySockets.delete(ws);

            ws.send(
                JSON.stringify({
                    type: "joined",
                    color: "white",
                    room: code
                })
            );

            broadcast(room);
            broadcastLobby();

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

            const isNewRoom = !room;

            if (!room) {

                room =
                    makeRoom(code);

                rooms.set(
                    code,
                    room
                );
            }

            if (
                !isNewRoom &&
                room.password &&
                room.password !== String(msg.password || "")
            ) {
                sendError(
                    ws,
                    "비밀번호가 틀렸습니다."
                );
                return;
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

            lobbySockets.delete(ws);


            ws.send(
                JSON.stringify({
                    type: "joined",
                    color,
                    room: code
                })
            );


            broadcast(room);
            broadcastLobby();

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

        lobbySockets.delete(ws);

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

        broadcastLobby();
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
