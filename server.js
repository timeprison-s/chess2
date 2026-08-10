const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const rooms = new Map();

const SCORE = {
    pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 2,
    wildHorse: 4, necromancer: 4, cavalry: 6, turret: 0,
    gunPawn: 3, tank: 0, colossus: 0
};

function scoreOf(p) {
    if (!p) return 0;
    if (p.type === "pawn" && p.gun) return SCORE.gunPawn;
    return SCORE[p.type] ?? 0;
}

function symbolFor(type, color) {
    const white = color === "white";
    return {
        pawn: white ? "♙" : "♟", knight: white ? "♘" : "♞",
        bishop: white ? "♗" : "♝", rook: white ? "♖" : "♜",
        queen: white ? "♕" : "♛", king: white ? "♔" : "♚",
        wildHorse: white ? "♘" : "♞", necromancer: white ? "♗" : "♝",
        cavalry: white ? "♘" : "♞", turret: white ? "♖" : "♜",
        tank: white ? "♖" : "♜", colossus: white ? "♔" : "♚"
    }[type] || "?";
}

function createPiece(type, color, symbol = symbolFor(type, color)) {
    return {
        type, color, symbol, gun: false,
        ammo: type === "turret" ? 8 : 0,
        maxAmmo: type === "turret" ? 8 : 0,
        turretHits: 0, turretDisabled: false,
        deathRow: null, deathCol: null, hasMoved: false,
        oneShot: type === "tank"
    };
}

function initialBoard() {
    return [
        [createPiece("rook","black"),createPiece("knight","black"),createPiece("bishop","black"),createPiece("queen","black"),createPiece("king","black"),createPiece("bishop","black"),createPiece("knight","black"),createPiece("rook","black")],
        Array.from({length:8},()=>createPiece("pawn","black")),
        Array(8).fill(null),Array(8).fill(null),Array(8).fill(null),Array(8).fill(null),
        Array.from({length:8},()=>createPiece("pawn","white")),
        [createPiece("rook","white"),createPiece("knight","white"),createPiece("bishop","white"),createPiece("queen","white"),createPiece("king","white"),createPiece("bishop","white"),createPiece("knight","white"),createPiece("rook","white")]
    ];
}

function makeRoom(code) {
    return {
        code, board: initialBoard(), players: {white:null, black:null}, currentTurn:"white",
        extraTurns:{white:0,black:0}, frozenTurns:{white:0,black:0},
        deadPieces:{white:[],black:[]}, moves:[], moveCount:0,
        score:{white:0,black:0}, time:{white:600,black:600}, gameEnded:false,
        castling:{white:{king:false, queen:false}, black:{king:false, queen:false}},
        colossusUsed:{white:false,black:false}
    };
}

function inside(r,c){return r>=0&&r<8&&c>=0&&c<8;}
function clearPath(board,fr,fc,tr,tc){
    const dr=Math.sign(tr-fr),dc=Math.sign(tc-fc); let r=fr+dr,c=fc+dc;
    while(r!==tr||c!==tc){if(board[r][c])return false;r+=dr;c+=dc;} return true;
}

function canMove(room,fr,fc,tr,tc,ignoreTargetColor=false){
    if(!inside(tr,tc))return false;
    const p=room.board[fr]?.[fc], target=room.board[tr]?.[tc];
    if(!p)return false;
    if(!ignoreTargetColor && target && target.color===p.color)return false;
    if(p.type==="turret"||p.type==="pawn"&&p.gun)return false;
    const dr=Math.abs(tr-fr),dc=Math.abs(tc-fc);
    if(p.type==="pawn"||p.type==="king"||p.type==="colossus") return dr<=1&&dc<=1&&(dr||dc);
    if(p.type==="knight") return (dr===2&&dc===1)||(dr===1&&dc===2);
    if(p.type==="rook"||p.type==="tank") return (fr===tr||fc===tc)&&clearPath(room.board,fr,fc,tr,tc);
    if(p.type==="bishop") return dr===dc&&dr!==0&&clearPath(room.board,fr,fc,tr,tc);
    if(p.type==="queen") return ((fr===tr||fc===tc)||dr===dc)&&clearPath(room.board,fr,fc,tr,tc);
    if(p.type==="wildHorse") return dr<=2&&dc<=2&&(dr||dc);
    if(p.type==="cavalry") return (fr===tr||fc===tc)&&(dr||dc);
    if(p.type==="necromancer") return (dr===dc&&dr!==0&&clearPath(room.board,fr,fc,tr,tc)) || (dr<=1&&dc<=1&&(dr||dc));
    return false;
}

function squareName(r,c){return "abcdefgh"[c]+(8-r);}
function addMove(room,text){room.moves.push(text);}

function capture(room,r,c,score=true){
    const p=room.board[r]?.[c]; if(!p)return null;
    p.deathRow=r;p.deathCol=c;
    room.deadPieces[p.color].push(p); room.board[r][c]=null;
    if(score) room.score[room.currentTurn]+=scoreOf(p);
    if(p.type==="king") room.frozenTurns[p.color]=2;
    return p;
}

function killSquare(room,r,c){if(inside(r,c))capture(room,r,c);}
function finishIfNeeded(room){
    let white=0,black=0;
    for(const row of room.board)for(const p of row)if(p)p.color==="white"?white++:black++;
    if(!white){room.gameEnded=true;return "black";}
    if(!black){room.gameEnded=true;return "white";}
    return null;
}
function nextTurn(room){
    room.currentTurn=room.currentTurn==="white"?"black":"white";
    if(room.extraTurns[room.currentTurn]>0){room.extraTurns[room.currentTurn]--;return;}
    if(room.frozenTurns[room.currentTurn]>0){room.frozenTurns[room.currentTurn]--;room.currentTurn=room.currentTurn==="white"?"black":"white";}
}

function cardinalBlast(room,r,c){
    [[r,c],[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>killSquare(room,rr,cc));
}

function tankBlast(room,fr,fc,tr,tc){
    const cells=[]; const dr=Math.sign(tr-fr),dc=Math.sign(tc-fc); let r=fr,c=fc;
    while(true){cells.push([r,c]);if(r===tr&&c===tc)break;r+=dr;c+=dc;}
    const all=new Set();
    for(const [rr,cc] of cells){for(let ar=-1;ar<=1;ar++)for(let ac=-1;ac<=1;ac++){if(ar===0&&ac===0||Math.abs(ar)+Math.abs(ac)<=1)all.add(rr+","+(cc+ac));}}
    // path plus orthogonal adjacent squares
    for(const [rr,cc] of cells){all.add(rr+","+cc);all.add((rr-1)+","+cc);all.add((rr+1)+","+cc);all.add(rr+","+(cc-1));all.add(rr+","+(cc+1));}
    for(const key of all){const [rr,cc]=key.split(",").map(Number);killSquare(room,rr,cc);}
}

function hasColossusResources(room,color){
    const need={pawn:4,knight:2,bishop:2,queen:1,king:1,rook:1};
    const have={pawn:0,knight:0,bishop:0,queen:0,king:0,rook:0};
    for(const row of room.board)for(const p of row)if(p&&p.color===color&&have[p.type]!==undefined)have[p.type]++;
    return Object.keys(need).every(k=>have[k]>=need[k]);
}
function consumeColossusResources(room,color){
    const need={pawn:4,knight:2,bishop:2,queen:1,king:1,rook:1};
    for(const type of Object.keys(need)){
        let left=need[type];
        for(let r=0;r<8&&left;r++)for(let c=0;c<8&&left;c++){
            if(room.board[r][c]?.color===color&&room.board[r][c].type===type){room.board[r][c]=null;left--;}
        }
    }
}

function findEmpty(room,r,c){return inside(r,c)&&!room.board[r][c];}

function broadcast(room){
    const data=JSON.stringify({type:"state",board:room.board,currentTurn:room.currentTurn,moves:room.moves,time:room.time,gameEnded:room.gameEnded,moveCount:room.moveCount,score:room.score,players:{white:!!room.players.white,black:!!room.players.black},colossusReady:{white:room.moveCount>=30&&hasColossusResources(room,"white")&&!room.colossusUsed.white,black:room.moveCount>=30&&hasColossusResources(room,"black")&&!room.colossusUsed.black}});
    for(const color of ["white","black"]){const ws=room.players[color];if(ws&&ws.readyState===WebSocket.OPEN)ws.send(data);}
}
function sendError(ws,message){ws.send(JSON.stringify({type:"error",message}));}

function validPromotion(x){return ["pawn","knight","bishop","rook","queen","king"].includes(x);}

function handleAction(room,ws,action){
    let color=room.players.white===ws?"white":room.players.black===ws?"black":null;
    if(!color){sendError(ws,"게임에 참가하지 않았습니다.");return;}
    if(action.type==="restart"){
        if(!room.gameEnded){sendError(ws,"게임이 아직 끝나지 않았습니다.");return;}
        const fresh=makeRoom(room.code); Object.assign(room,fresh); broadcast(room); return;
    }
    if(room.gameEnded){sendError(ws,"게임이 종료되었습니다.");return;}
    if(room.currentTurn!==color){sendError(ws,"상대방의 턴입니다.");return;}
    if(room.frozenTurns[color]>0){sendError(ws,"킹이 잡혀 현재 움직일 수 없습니다.");return;}

    if(action.type==="move"){
        const {fr,fc,tr,tc}=action; const p=room.board[fr]?.[fc],target=room.board[tr]?.[tc];
        if(!p||p.color!==color){sendError(ws,"잘못된 기물입니다.");return;}
        if(!canMove(room,fr,fc,tr,tc,true)){sendError(ws,"불가능한 이동입니다.");return;}
        if(p.type==="colossus"){
            room.board[fr][fc]=null;
            for(let r=tr-2;r<=tr+2;r++)for(let c=tc-2;c<=tc+2;c++)killSquare(room,r,c);
            addMove(room,squareName(fr,fc)+"[COLOSSUS]"+squareName(tr,tc));
            room.moveCount++; finishIfNeeded(room); nextTurn(room); broadcast(room); return;
        }
        if(p.type==="tank"){
            if(!canMove(room,fr,fc,tr,tc,true)){sendError(ws,"전차의 이동 경로가 막혔습니다.");return;}
            room.board[fr][fc]=null; tankBlast(room,fr,fc,tr,tc);
            addMove(room,squareName(fr,fc)+"[TANK]"+squareName(tr,tc)); room.moveCount++; finishIfNeeded(room); nextTurn(room); broadcast(room); return;
        }
        const backward=(p.type==="pawn")&&((color==="white"&&tr>fr)||(color==="black"&&tr<fr));
        const specialPromotion=room.moveCount<5&&backward&&target&&target.color===color&&(target.type==="rook"||target.type==="queen");
        if(target&&target.color===color&&!specialPromotion&&p.type!=="pawn"&&p.type!=="king"&&p.type!=="queen"&&p.type!=="rook"&&p.type!=="bishop"&&p.type!=="knight"&&p.type!=="wildHorse"&&p.type!=="necromancer"&&p.type!=="cavalry"){sendError(ws,"이동할 수 없습니다.");return;}
        let notation=squareName(fr,fc)+(target?"x":"-")+squareName(tr,tc);
        if(target)capture(room,tr,tc);
        if(specialPromotion){
            const promotion=validPromotion(action.promotion)?action.promotion:"queen";
            room.board[tr][tc]=createPiece(promotion,color); addMove(room,notation+"="+promotion.toUpperCase());
        }else{
            p.hasMoved=true; room.board[tr][tc]=p; room.board[fr][fc]=null; addMove(room,notation);
        }
        room.moveCount++; finishIfNeeded(room); nextTurn(room); broadcast(room); return;
    }

    if(action.type==="castle"){
        const side=action.side; if(side!=="king"&&side!=="queen"){sendError(ws,"잘못된 캐슬링입니다.");return;}
        const row=color==="white"?7:0, k=room.board[row][4]; const rookCol=side==="king"?7:0, rook=room.board[row][rookCol];
        if(!k||k.type!=="king"||k.color!==color||k.hasMoved||!rook||rook.type!=="rook"||rook.color!==color||rook.hasMoved){sendError(ws,"캐슬링 조건이 아닙니다.");return;}
        const start=side==="king"?5:1, end=side==="king"?6:3; for(let c=start;c<=(side==="king"?6:3);c++)if(room.board[row][c]){sendError(ws,"사이에 기물이 있습니다.");return;}
        room.board[row][4]=null;room.board[row][rookCol]=null;k.hasMoved=true;rook.hasMoved=true;room.board[row][end]=rook;room.board[row][side==="king"?6:2]=k;
        addMove(room,side==="king"?"O-O":"O-O-O"); room.moveCount++; nextTurn(room); broadcast(room); return;
    }

    if(action.type==="gun"){
        const p=room.board[action.r]?.[action.c];if(!p||p.color!==color||p.type!=="pawn"||p.gun){sendError(ws,"총을 장착할 수 없습니다.");return;}p.gun=true;addMove(room,squareName(action.r,action.c)+"[G]");room.moveCount++;nextTurn(room);broadcast(room);return;
    }
    if(action.type==="gunAttack"){
        const p=room.board[action.fr]?.[action.fc],target=room.board[action.tr]?.[action.tc];if(!p||p.color!==color||!p.gun||!target||target.color===color){sendError(ws,"총 공격이 불가능합니다.");return;}
        if(Math.abs(action.tr-action.fr)>2||Math.abs(action.tc-action.fc)>2){sendError(ws,"총의 5x5 범위를 벗어났습니다.");return;}
        capture(room,action.tr,action.tc);addMove(room,squareName(action.fr,action.fc)+"[G]x"+squareName(action.tr,action.tc));room.moveCount++;finishIfNeeded(room);nextTurn(room);broadcast(room);return;
    }
    if(action.type==="turretAttack"){
        const t=room.board[action.fr]?.[action.fc],target=room.board[action.tr]?.[action.tc];if(!t||t.color!==color||t.type!=="turret"||t.turretDisabled||t.ammo<=0||!target||target.color===color){sendError(ws,"포탄 공격이 불가능합니다.");return;}
        t.ammo--;cardinalBlast(room,action.tr,action.tc);addMove(room,squareName(action.fr,action.fc)+"[CANNON]"+squareName(action.tr,action.tc));room.moveCount++;finishIfNeeded(room);nextTurn(room);broadcast(room);return;
    }
    if(action.type==="combine"){
        const a=room.board[action.fr]?.[action.fc],b=room.board[action.tr]?.[action.tc];if(!a||!b||a.color!==color||b.color!==color){sendError(ws,"합체할 수 없습니다.");return;}
        let result=null;if(a.type==="knight"&&b.type==="knight")result="wildHorse";else if(a.type==="bishop"&&b.type==="bishop")result="necromancer";else if((a.type==="pawn"&&b.type==="rook")||(a.type==="rook"&&b.type==="pawn"))result="turret";else if((a.type==="pawn"&&b.type==="knight")||(a.type==="knight"&&b.type==="pawn"))result="cavalry";else if(a.type==="rook"&&b.type==="rook")result="tank";
        if(!result||a.gun||b.gun){sendError(ws,"이 두 기물은 합체할 수 없습니다.");return;}
        let finalR=action.tr,finalC=action.tc;if(result==="turret"||result==="cavalry"){if(a.type!=="pawn"){finalR=action.fr;finalC=action.fc;}}
        room.board[action.fr][action.fc]=null;room.board[action.tr][action.tc]=null;room.board[finalR][finalC]=createPiece(result,color);addMove(room,squareName(action.fr,action.fc)+"+"+squareName(action.tr,action.tc)+"["+result.toUpperCase()+"]");room.moveCount++;nextTurn(room);broadcast(room);return;
    }
    if(action.type==="summonColossus"){
        if(room.moveCount<30||room.colossusUsed[color]||!hasColossusResources(room,color)){sendError(ws,"거신병 소환 조건이 아닙니다.");return;}
        const r=Number(action.r),c=Number(action.c);if(!findEmpty(room,r,c)){sendError(ws,"거신병을 놓을 빈 칸을 선택하십시오.");return;}
        consumeColossusResources(room,color);room.board[r][c]=createPiece("colossus",color);room.colossusUsed[color]=true;addMove(room,"[COLOSSUS]"+squareName(r,c));room.moveCount++;nextTurn(room);broadcast(room);return;
    }

    if(action.type==="resurrect"){
        const necro=room.board[action.nr]?.[action.nc],list=room.deadPieces[color];if(!necro||necro.color!==color||necro.type!=="necromancer"){sendError(ws,"네크로맨서가 아닙니다.");return;}
        const index=list.findIndex(p=>p.deathRow===action.tr&&p.deathCol===action.tc&&p.type!=="king"&&p.type!=="queen");if(index<0||room.board[action.tr][action.tc]){sendError(ws,"부활시킬 수 없습니다.");return;}
        const revived=list.splice(index,1)[0];revived.deathRow=null;revived.deathCol=null;room.board[action.tr][action.tc]=revived;addMove(room,"N+"+revived.type+"@"+squareName(action.tr,action.tc));room.extraTurns[color==="white"?"black":"white"]++;room.moveCount++;nextTurn(room);broadcast(room);return;
    }
}

const server=http.createServer((req,res)=>{
    const rel=req.url==="/"?"index.html":req.url.replace(/^\//,"");
    const filePath=path.join(__dirname,"public",rel);
    if(!filePath.startsWith(path.join(__dirname,"public"))||!fs.existsSync(filePath)){res.writeHead(404);res.end("Not Found");return;}
    const ext=path.extname(filePath);const types={".html":"text/html",".css":"text/css",".js":"application/javascript"};res.writeHead(200,{"Content-Type":types[ext]||"text/plain"});res.end(fs.readFileSync(filePath));
});
const wss=new WebSocket.Server({server});
wss.on("connection",ws=>{
    ws.on("message",raw=>{
        let msg;try{msg=JSON.parse(raw.toString());}catch{sendError(ws,"잘못된 데이터입니다.");return;}
        if(msg.type==="join"){
            const code=String(msg.room||"").trim().toUpperCase();if(!code){sendError(ws,"방 코드를 입력하세요.");return;}
            let room=rooms.get(code);if(!room){room=makeRoom(code);rooms.set(code,room);}
            let color=!room.players.white?"white":!room.players.black?"black":null;if(!color){sendError(ws,"방이 가득 찼습니다.");return;}
            room.players[color]=ws;ws.room=code;ws.color=color;ws.send(JSON.stringify({type:"joined",color,room:code}));broadcast(room);return;
        }
        if(msg.type==="action"){const room=rooms.get(ws.room);if(room)handleAction(room,ws,msg.action);else sendError(ws,"방을 찾을 수 없습니다.");}
    });
    ws.on("close",()=>{const room=rooms.get(ws.room);if(!room)return;if(room.players.white===ws)room.players.white=null;if(room.players.black===ws)room.players.black=null;if(!room.players.white&&!room.players.black)rooms.delete(ws.room);});
});
setInterval(()=>{for(const room of rooms.values()){if(room.gameEnded||!room.players.white||!room.players.black)continue;room.time[room.currentTurn]--;if(room.time[room.currentTurn]<=0){room.time[room.currentTurn]=0;room.gameEnded=true;}broadcast(room);}},1000);
server.listen(PORT,()=>console.log(`Custom Chess server running on http://localhost:${PORT}`));
