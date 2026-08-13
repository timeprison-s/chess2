let socket=null,myColor=null,roomCode=null,boardState=null,control=null,seaState={},pendingForge={white:null,black:null},currentTurn="white",selected=null,gameEnded=false,moves=[],time={white:600,black:600},score={white:0,black:0},moveCount=0,colossusReady={white:false,black:false},colossusSacrificeReady={white:false,black:false},singularities=[];
let lastStateAt=Date.now(), localTimer=null;

function connect(){
  const protocol=location.protocol==="https:"?"wss:":"ws:";
  socket=new WebSocket(protocol+"//"+location.host);
  socket.onopen=()=>{document.getElementById("connectionStatus").textContent="서버 연결 완료"};
  socket.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==="joined"){
      myColor=m.color;roomCode=m.room;
      document.getElementById("lobby").classList.add("hidden");
      document.getElementById("game").classList.remove("hidden");
      document.getElementById("roomInfo").textContent=`ROOM: ${roomCode} / YOU: ${myColor.toUpperCase()}`;
      return;
    }
    if(m.type==="roomList"){
      renderRoomList(m.rooms||[]);
      return;
    }
    if(m.type==="state"){
      lastStateAt=Date.now();
      boardState=m.board;control=m.control;seaState=m.sea||{};pendingForge=m.pendingForge||{white:null,black:null};
      currentTurn=m.currentTurn;moves=m.moves;time=m.time;gameEnded=m.gameEnded;
      score=m.score;moveCount=m.moveCount;colossusReady=m.colossusReady;
      colossusSacrificeReady=m.colossusSacrificeReady||{white:false,black:false};
      singularities=m.singularities||[];
      if(pendingForge?.[myColor])selected=null;
      drawBoard();renderMoves();updateUI();updateForgePlacementBanner();
    }
    if(m.type==="error"){alert(m.message); selected=null; drawBoard()}
  };
  socket.onclose=()=>document.getElementById("connectionStatus").textContent="서버 연결 끊김";
}

function sendRaw(obj){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(obj))}

/*
 * 로비 화면 전환: 메뉴(진입) / 방 만들기 / 방 목록
 */
const lobbyMenu=document.getElementById("lobbyMenu");
const lobbyCreate=document.getElementById("lobbyCreate");
const lobbyList=document.getElementById("lobbyList");

function showLobbyView(view){
  lobbyMenu.classList.toggle("hidden",view!=="menu");
  lobbyCreate.classList.toggle("hidden",view!=="create");
  lobbyList.classList.toggle("hidden",view!=="list");
}

document.getElementById("menuCreateButton").addEventListener("click",()=>{
  showLobbyView("create");
});

document.getElementById("menuListButton").addEventListener("click",()=>{
  showLobbyView("list");
  sendRaw({type:"listRooms"});
});

document.getElementById("createBackButton").addEventListener("click",()=>{
  showLobbyView("menu");
});

document.getElementById("listBackButton").addEventListener("click",()=>{
  showLobbyView("menu");
});

document.getElementById("createRoomButton").addEventListener("click",()=>{
  if(!socket||socket.readyState!==WebSocket.OPEN)return alert("서버에 연결되지 않았다.");
  const name=document.getElementById("createNameInput").value.trim();
  const password=document.getElementById("createPasswordInput").value;
  sendRaw({type:"createRoom",name,password});
});

document.getElementById("refreshRoomsButton").addEventListener("click",()=>{
  sendRaw({type:"listRooms"});
});

/*
 * 방 목록 렌더링. 방 이름을 주로 보여주고 코드는 작게 함께 표시한다.
 * 비밀번호가 걸린 방은 자물쇠 표시를 하고, 참가 버튼을 누르면 비밀번호를 물어본다.
 */
function renderRoomList(rooms){
  const box=document.getElementById("roomList");
  box.innerHTML="";

  if(rooms.length===0){
    const empty=document.createElement("div");
    empty.className="room-list-empty";
    empty.textContent="방이 없습니다.";
    box.appendChild(empty);
    return;
  }

  for(const room of rooms){
    const row=document.createElement("div");
    row.className="room-row";

    const name=document.createElement("span");
    name.className="room-name";
    name.textContent=room.name||room.code;
    row.appendChild(name);

    const code=document.createElement("span");
    code.className="room-code";
    code.textContent=room.code;
    row.appendChild(code);

    if(room.hasPassword){
      const lock=document.createElement("span");
      lock.className="room-lock";
      lock.textContent="🔒";
      row.appendChild(lock);
    }

    const players=document.createElement("span");
    players.className="room-players";
    players.textContent=room.full?"가득참":`${room.playerCount}/2`;
    row.appendChild(players);

    const btn=document.createElement("button");
    btn.textContent="참가";
    btn.disabled=room.full;
    btn.onclick=()=>{
      let password="";
      if(room.hasPassword){
        password=prompt("비밀번호를 입력하세요:")||"";
      }
      sendRaw({type:"join",room:room.code,password});
    };
    row.appendChild(btn);

    box.appendChild(row);
  }
}

function sendAction(action){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:"action",action}))}

function inside(r,c){return r>=0&&r<8&&c>=0&&c<8}
function squareName(r,c){return "abcdefgh"[c]+(8-r)}
function squareLabel(r,c){return isSeaSquare(r,c)?`바다(${r},${c})`:squareName(r,c)}
function chebyshev(r1,c1,r2,c2){return Math.max(Math.abs(r1-r2),Math.abs(c1-c2))}
function clearPath(fr,fc,tr,tc){
  const dr=Math.sign(tr-fr),dc=Math.sign(tc-fc);
  let r=fr+dr,c=fc+dc;
  while(r!==tr||c!==tc){if(boardState[r][c])return false;r+=dr;c+=dc}
  return true;
}

/*
 * 이동 가능 여부 (클라이언트 미리보기용).
 * 서버가 최종 판정을 내리므로, 여기서는 색 검사를 하지 않는다
 * (자신의 기물도 좌클릭으로 죽일 수 있어야 하므로).
 */
function canMove(fr,fc,tr,tc){
  const p=boardState[fr]?.[fc];
  if(!p)return false;
  if(p.type==="turret"||p.type==="pawn"&&p.gun)return false;
  const dr=Math.abs(tr-fr),dc=Math.abs(tc-fc);
  if(p.type==="pawn"||p.type==="king"||p.type==="colossus")return dr<=1&&dc<=1&&(dr||dc);
  if(p.type==="knight")return(dr===2&&dc===1)||(dr===1&&dc===2);
  if(p.type==="rook")return(fr===tr||fc===tc)&&clearPath(fr,fc,tr,tc);
  if(p.type==="bishop")return dr===dc&&dr!==0&&clearPath(fr,fc,tr,tc);
  if(p.type==="queen")return((fr===tr||fc===tc)||dr===dc)&&clearPath(fr,fc,tr,tc);
  if(p.type==="wildHorse")return dr<=2&&dc<=2&&(dr||dc);
  if(p.type==="cavalry")return(fr===tr||fc===tc)&&(dr||dc);
  if(p.type==="necromancer")return(dr===dc&&dr!==0&&clearPath(fr,fc,tr,tc))||(dr<=1&&dc<=1&&(dr||dc));
  if(p.type==="tank")return(fr===tr||fc===tc)&&(dr||dc);
  return false;
}
function getCastlingMoves(r,c){
  const p=boardState[r]?.[c];
  if(!p||p.type!=="king"||p.hasMoved)return[];
  const out=[];
  const rk=boardState[r][7];
  if(rk&&rk.type==="rook"&&rk.color===p.color&&!rk.hasMoved&&!boardState[r][5]&&!boardState[r][6])out.push({r,c:c+2});
  const rq=boardState[r][0];
  if(rq&&rq.type==="rook"&&rq.color===p.color&&!rq.hasMoved&&!boardState[r][1]&&!boardState[r][2]&&!boardState[r][3])out.push({r,c:c-2});
  return out;
}
function getMoves(r,c){
  const out=[];
  for(let tr=0;tr<8;tr++)for(let tc=0;tc<8;tc++)if(canMove(r,c,tr,tc))out.push({r:tr,c:tc});
  const p=boardState[r]?.[c];
  if(p?.type==="king")out.push(...getCastlingMoves(r,c));
  return out;
}
function getGunTargets(r,c){
  const p=boardState[r]?.[c];
  if(!p?.gun)return[];
  const out=[];
  for(let tr=r-2;tr<=r+2;tr++)for(let tc=c-2;tc<=c+2;tc++)if(inside(tr,tc)&&!(tr===r&&tc===c)&&boardState[tr][tc])out.push({r:tr,c:tc});
  return out;
}
function getTurretTargets(r,c){
  const p=boardState[r]?.[c];
  if(!p||p.type!=="turret"||p.turretDisabled||p.ammo<=0)return[];
  const out=[];
  for(let tr=0;tr<8;tr++)for(let tc=0;tc<8;tc++){
    const dist=Math.max(Math.abs(tr-r),Math.abs(tc-c));
    if(dist<2||dist>3)continue;
    const q=boardState[tr][tc];
    if(q)out.push({r:tr,c:tc});
  }
  return out;
}

/*
 * 잠수함: 인접한(체비셰프 거리 1) 바다 칸의 함선만 공격 가능 (해전 전용).
 */
function getSubmarineTargets(r,c){
  const p=pieceAt(r,c);
  if(!p||p.type!=="submarine")return[];
  const out=[];
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if(dr===0&&dc===0)continue;
    const tr=r+dr,tc=c+dc;
    if(isSeaSquare(tr,tc)&&seaPieceAt(tr,tc))out.push({r:tr,c:tc});
  }
  return out;
}

/*
 * 전함: 자신 위치 기준 3*3(체비셰프 거리 <=1) 범위를 한꺼번에 포격한다.
 * 대상을 따로 고르지 않으므로, 자기 자신을 다시 클릭하면 발동한다.
 */
function getBattleshipBlast(r,c){
  const out=[];
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if(dr===0&&dc===0)continue;
    const tr=r+dr,tc=c+dc;
    if(pieceAt(tr,tc))out.push({r:tr,c:tc});
  }
  return out;
}

/*
 * 항공모함: 자신 기준 7*7(체비셰프 거리 <=3) 범위의 빈 칸으로 이동 가능.
 */
function getCarrierMoves(r,c){
  const p=pieceAt(r,c);
  if(!p||p.type!=="carrier")return[];
  const out=[];
  for(let tr=r-3;tr<=r+3;tr++)for(let tc=c-3;tc<=c+3;tc++){
    if(tr===r&&tc===c)continue;
    if(tr<-1||tr>8||tc<-1||tc>8)continue;
    if(!inside(tr,tc)&&!isSeaSquare(tr,tc))continue;
    if(!pieceAt(tr,tc))out.push({r:tr,c:tc});
  }
  return out;
}
function countOwn(type){
  let n=0;
  for(const row of boardState||[])for(const p of row)if(p&&p.color===myColor&&p.type===type)n++;
  return n;
}

/*
 * 연성(합성) 가능 여부 - 서버 판정 규칙과 동일하게 유지해야 한다.
 * 포탑 + 폰은 새 기물이 아니라 "포탑 재장전"(탄약 +1)이다.
 */
function combinable(a,b){
  if(!a||!b||a.color!==b.color||a.gun||b.gun)return false;
  if((a.type==="fleet")||(b.type==="fleet")){
    const other=a.type==="fleet"?b:a;
    return other.type!=="fleet"&&["pawn","rook","bishop"].includes(other.type);
  }
  return(a.type==="knight"&&b.type==="knight")||(a.type==="bishop"&&b.type==="bishop")||(a.type==="rook"&&b.type==="rook")||((a.type==="pawn"&&b.type==="rook")||(a.type==="rook"&&b.type==="pawn"))||((a.type==="pawn"&&b.type==="knight")||(a.type==="knight"&&b.type==="pawn"))||((a.type==="pawn"&&b.type==="turret")||(a.type==="turret"&&b.type==="pawn"));
}
const PIECE_LABEL={pawn:"폰",knight:"나이트",bishop:"비숍",rook:"룩",queen:"퀸",king:"킹",fleet:"함대 편제"};

/*
 * 연성 결과 판정. server.js의 forge 액션 판정 로직과 반드시 동일하게 유지한다.
 */
const RESULT_LABEL={wildHorse:"야생마",necromancer:"네크로맨서",tank:"전차",turret:"포탑",cavalry:"기마병",reload:"포탑 탄약 +1",fleet:"함대 편제",submarine:"잠수함",battleship:"전함",carrier:"항공모함"};
function combineResultInfo(a,b){
  let result=null;
  if(a.type==="fleet"||b.type==="fleet"){
    const other=a.type==="fleet"?b:a;
    const fusions={pawn:"submarine",rook:"battleship",bishop:"carrier"};
    result=fusions[other.type]||null;
  }
  else if(a.type==="knight"&&b.type==="knight")result="wildHorse";
  else if(a.type==="bishop"&&b.type==="bishop")result="necromancer";
  else if(a.type==="rook"&&b.type==="rook")result="tank";
  else if((a.type==="pawn"&&b.type==="rook")||(a.type==="rook"&&b.type==="pawn"))result="turret";
  else if((a.type==="pawn"&&b.type==="knight")||(a.type==="knight"&&b.type==="pawn"))result="cavalry";
  else if((a.type==="pawn"&&b.type==="turret")||(a.type==="turret"&&b.type==="pawn"))result="reload";
  if(!result)return null;
  return {result,label:RESULT_LABEL[result]};
}
function combinable3(a,b,c){
  if(!a||!b||!c)return false;
  if(a.color!==b.color||b.color!==c.color)return false;
  if(a.gun||b.gun||c.gun)return false;
  return a.type==="pawn"&&b.type==="pawn"&&c.type==="pawn";
}

/*
 * 기물 표시 글자(유니코드). 실제 보드 기물(symbol 보유)과
 * 연성대 미리보기용 가상 기물(symbol 없음) 모두에 사용한다.
 */
function pieceGlyph(p){
  if(!p)return "";
  if(p.type==="pawn"&&p.gun)return p.color==="white"?"♙":"♟";
  if(p.type==="wildHorse")return p.color==="white"?"♘":"♞";
  if(p.type==="necromancer")return p.color==="white"?"♗":"♝";
  if(p.type==="cavalry")return p.color==="white"?"♘":"♞";
  if(p.type==="tank")return "▣";
  if(p.type==="fleet")return "⚓";
  if(p.type==="colossus")return p.color==="white"?"♔":"♚";
  if(p.type==="turret")return p.color==="white"?"♖":"♜";
  if(p.symbol)return p.symbol;
  const std={pawn:{white:"♙",black:"♟"},knight:{white:"♘",black:"♞"},bishop:{white:"♗",black:"♝"},rook:{white:"♖",black:"♜"},queen:{white:"♕",black:"♛"},king:{white:"♔",black:"♚"}};
  return std[p.type]?.[p.color]||"?";
}

/*
 * 연성대: 이제 거리 제한이 없다. 아군 기물이면 보드 어디에 있든
 * 드래그(또는 클릭)해서 3*3 그리드 칸에 올리면 연성할 수 있다.
 * 제작 자체는 턴을 쓰지 않는다 - 완성된 기물을 보드에 배치할 때만 턴을 쓴다.
 */
function hasAnyCombinablePair(){
  const pieces=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=boardState[r]?.[c];if(p&&p.color===myColor)pieces.push(p)}
  for(let i=0;i<pieces.length;i++){
    for(let j=i+1;j<pieces.length;j++){
      if(combinable(pieces[i],pieces[j]))return true;
    }
  }
  return false;
}

let forgeCells=new Array(9).fill(null); // 각각 null 또는 {r,c}
let draggedFrom=null; // 드래그 중인 기물의 {r,c}

function forgeFilledCells(){
  return forgeCells
    .map((pos,i)=>pos?{i,r:pos.r,c:pos.c,p:pieceAt(pos.r,pos.c)}:null)
    .filter(x=>x&&x.p);
}

function renderForgeGrid(){
  const grid=document.getElementById("forgeGrid");
  grid.innerHTML="";
  for(let i=0;i<9;i++){
    const cellEl=document.createElement("div");
    cellEl.className="forge-cell";
    cellEl.dataset.index=i;

    const pos=forgeCells[i];
    const p=pos?pieceAt(pos.r,pos.c):null;

    /*
     * 참조하던 기물이 다른 액션(상대의 수, 자신의 이동 등)으로
     * 사라졌거나 더 이상 내 기물이 아니게 됐다면 자동으로 비운다.
     */
    if(pos&&(!p||p.color!==myColor)){
      forgeCells[i]=null;
    } else if(p){
      cellEl.classList.add("filled");
      const glyph=document.createElement("span");
      glyph.className=p.color==="white"?"white-piece":"black-piece";
      glyph.textContent=pieceGlyph(p);
      cellEl.appendChild(glyph);
    }

    cellEl.addEventListener("click",()=>{
      if(forgeCells[i]){forgeCells[i]=null;renderForge()}
    });

    cellEl.addEventListener("dragover",e=>{e.preventDefault();cellEl.classList.add("drag-over")});
    cellEl.addEventListener("dragleave",()=>cellEl.classList.remove("drag-over"));
    cellEl.addEventListener("drop",e=>{
      e.preventDefault();
      cellEl.classList.remove("drag-over");
      if(!draggedFrom)return;
      /* 같은 기물을 두 칸에 중복으로 놓지 못하게 함 */
      const dup=forgeCells.findIndex(pos=>pos&&pos.r===draggedFrom.r&&pos.c===draggedFrom.c);
      if(dup!==-1)forgeCells[dup]=null;
      forgeCells[i]=draggedFrom;
      draggedFrom=null;
      renderForge();
    });

    grid.appendChild(cellEl);
  }
}

function renderForgeOutput(){
  const outEl=document.getElementById("forgeOutputSlot");
  const infoEl=document.getElementById("forgeResultInfo");
  const confirmBtn=document.getElementById("forgeConfirm");

  outEl.innerHTML="";
  outEl.classList.remove("ready","invalid");

  const filled=forgeFilledCells();

  if(filled.length===0){
    const label=document.createElement("span");
    label.className="forge-slot-label";
    label.textContent="결과";
    outEl.appendChild(label);
    infoEl.textContent="";
    confirmBtn.classList.add("hidden");
    return;
  }

  if(filled.length!==2&&filled.length!==3){
    outEl.classList.add("invalid");
    infoEl.textContent="재료는 2개(일반 연성) 또는 폰 3개(함대 편제)를 놓아야 합니다.";
    confirmBtn.classList.add("hidden");
    return;
  }

  if(filled.length===3){
    const [A,B,C]=filled;
    const ok=combinable3(A.p,B.p,C.p);

    if(!ok){
      outEl.classList.add("invalid");
      infoEl.textContent="폰 3개만 함대 편제로 연성할 수 있습니다.";
      confirmBtn.classList.add("hidden");
      return;
    }

    const cannotForgeNow3=currentTurn!==myColor||gameEnded||!!pendingForge?.[myColor];

    outEl.classList.add("ready");
    const glyph3=document.createElement("span");
    glyph3.className=myColor==="white"?"white-piece":"black-piece";
    glyph3.textContent=pieceGlyph({type:"fleet",color:myColor});
    outEl.appendChild(glyph3);

    infoEl.textContent=`${PIECE_LABEL.pawn}(${squareLabel(A.r,A.c)}) + ${PIECE_LABEL.pawn}(${squareLabel(B.r,B.c)}) + ${PIECE_LABEL.pawn}(${squareLabel(C.r,C.c)}) → ${RESULT_LABEL.fleet} (만든 뒤 바다 칸에 배치, 배치 시 턴 소모)`;
    confirmBtn.classList.toggle("hidden",cannotForgeNow3);
    return;
  }

  const [A,B]=filled;
  const info=combinable(A.p,B.p)?combineResultInfo(A.p,B.p):null;

  if(!info){
    outEl.classList.add("invalid");
    infoEl.textContent="이 두 기물은 연성할 수 없습니다.";
    confirmBtn.classList.add("hidden");
    return;
  }

  const cannotForgeNow=currentTurn!==myColor||gameEnded||!!pendingForge?.[myColor];

  outEl.classList.add("ready");
  const glyph=document.createElement("span");
  glyph.className=myColor==="white"?"white-piece":"black-piece";
  glyph.textContent=info.result==="reload"?pieceGlyph({type:"turret",color:myColor}):pieceGlyph({type:info.result,color:myColor});
  outEl.appendChild(glyph);

  const isFleetFusion=["submarine","battleship","carrier"].includes(info.result);
  const tail=info.result==="reload"?"(제자리에서 즉시 적용, 턴 소모)":isFleetFusion?"(만든 뒤 바다 칸에 배치, 배치 시 턴 소모)":"(만든 뒤 지배하는 빈 칸에 배치, 배치 시 턴 소모)";
  infoEl.textContent=`${PIECE_LABEL[A.p.type]||A.p.type}(${squareLabel(A.r,A.c)}) + ${PIECE_LABEL[B.p.type]||B.p.type}(${squareLabel(B.r,B.c)}) → ${info.label} ${tail}`;
  confirmBtn.classList.toggle("hidden",cannotForgeNow);
}

function renderForge(){
  renderForgeGrid();
  renderForgeOutput();
}

function resetForgeCells(){
  forgeCells=new Array(9).fill(null);
  renderForge();
}

document.getElementById("forgeReset").addEventListener("click",resetForgeCells);

document.getElementById("forgeConfirm").addEventListener("click",()=>{
  const filled=forgeFilledCells();
  if(filled.length===3){
    const [A,B,C]=filled;
    if(!combinable3(A.p,B.p,C.p))return;
    sendAction({type:"forge",fr:A.r,fc:A.c,tr:B.r,tc:B.c,er:C.r,ec:C.c});
    resetForgeCells();
    return;
  }
  if(filled.length!==2)return;
  const [A,B]=filled;
  sendAction({type:"forge",fr:A.r,fc:A.c,tr:B.r,tc:B.c});
  resetForgeCells();
});

/*
 * 연성 기물 배치 모드: 서버가 pendingForge를 보내오면(연성 완료, 배치 대기)
 * 배너를 보여주고, 보드에서 지배하는 빈 칸을 클릭하면 배치(턴 소모)한다.
 */
function updateForgePlacementBanner(){
  const banner=document.getElementById("forgePlacementBanner");
  const pending=pendingForge?.[myColor];

  if(!pending){
    banner.classList.add("hidden");
    return;
  }

  banner.classList.remove("hidden");
  const glyphEl=document.getElementById("forgePendingGlyph");
  glyphEl.className=myColor==="white"?"white-piece forge-pending-glyph":"black-piece forge-pending-glyph";
  glyphEl.textContent=pieceGlyph(pending.piece);

  const hintEl=document.getElementById("forgePlacementHint");
  const isFleetFamily=["fleet","submarine","battleship","carrier"].includes(pending.piece.type);
  hintEl.textContent=isFleetFamily
    ?"보드를 둘러싼 바다 칸(검은 칸)의 빈 칸을 클릭해 배치하세요."
    :"지배하는 빈 칸을 클릭해 배치하세요.";
}

document.getElementById("forgePlacementCancel").addEventListener("click",()=>{
  sendAction({type:"cancelForge"});
});


/*
 * 네크로맨서 특이점 생성 대상: 선택된 네크로맨서 주위 3*3칸의 빈 칸(이미 특이점이 없는 곳).
 */
function getSingularityTargets(r,c){
  const p=boardState[r]?.[c];
  if(!p||p.type!=="necromancer"||p.color!==myColor)return[];
  const out=[];
  for(let tr=r-1;tr<=r+1;tr++)for(let tc=c-1;tc<=c+1;tc++){
    if(tr===r&&tc===c)continue;
    if(!inside(tr,tc))continue;
    if(boardState[tr][tc])continue;
    if(singularities.some(s=>s.r===tr&&s.c===tc))continue;
    out.push({r:tr,c:tc});
  }
  return out;
}

/*
 * 백프로모션: 폰이 자신의 뒷랭크(백=row7 / 흑=row0)의 빈 칸에 도달했을 때만
 * 클라이언트에서 선택 모달을 띄운다. 자신의 표준 기물을 잡으며 도달한 경우는
 * 서버가 자동으로 강제 변환하므로 모달이 필요 없다.
 */
function eligibleFreePromotion(fr,fc,tr,tc){
  const p=boardState[fr]?.[fc],q=boardState[tr]?.[tc];
  if(p?.type!=="pawn")return false;
  const backRank=p.color==="white"?7:0;
  if(tr!==backRank)return false;
  return !q;
}
function showPromotion(){
  return new Promise(resolve=>{
    const modal=document.getElementById("promotionModal");
    modal.classList.remove("hidden");
    modal.querySelectorAll("button").forEach(b=>b.onclick=()=>{modal.classList.add("hidden");resolve(b.dataset.piece)});
  });
}

/*
 * 화/냉 속성은 더 이상 문자 아이콘으로 표시하지 않는다.
 * 대신 drawBoard()에서 칸에 attr-fire(붉은 테두리)/attr-cold(푸른 테두리)
 * 클래스를 붙여 겉모습으로 구분한다.
 */
/*
 * 화/냉 속성은 칸이 아니라 기물 자체의 테두리(outline)로 표시한다
 * (piece-fire / piece-cold, drawBoard()의 el에 부착).
 */
const ATTR_ICON={armored:"🛡",piercing:"⚔"};

function isEdgeSquare(r,c){
  return r===0||r===7||c===0||c===7;
}

/*
 * 바다 칸(36칸) - 보드(0~7,0~7)를 감싸는 테두리 한 칸짜리 링.
 * 좌표는 -1~8 범위를 쓴다. server.js의 isSeaSquare와 동일하게 유지한다.
 */
function isSeaSquare(r,c){
  if(r<-1||r>8||c<-1||c>8)return false;
  return r===-1||r===8||c===-1||c===8;
}
function seaKey(r,c){return r+","+c}
function seaPieceAt(r,c){return seaState?.[seaKey(r,c)]||null}
function pieceAt(r,c){
  if(isSeaSquare(r,c))return seaPieceAt(r,c);
  return boardState?.[r]?.[c]||null;
}

function isPlaceable(r,c){
  const pending=pendingForge?.[myColor];
  if(!pending)return false;
  const isFleetFamily=["fleet","submarine","battleship","carrier"].includes(pending.piece.type);
  if(isFleetFamily){
    return isSeaSquare(r,c)&&!seaPieceAt(r,c);
  }
  if(!inside(r,c))return false;
  if(boardState[r][c])return false;
  return control?.[r]?.[c]===myColor;
}

function drawBoard(){
  const board=document.getElementById("board");
  board.innerHTML="";
  if(!boardState)return;

  let moves2=selected?getMoves(selected.r,selected.c):[],
      guns=selected?getGunTargets(selected.r,selected.c):[],
      turrets=selected?getTurretTargets(selected.r,selected.c):[],
      subTargets=selected?getSubmarineTargets(selected.r,selected.c):[],
      carrierMoves=selected?getCarrierMoves(selected.r,selected.c):[],
      singularityTargets=selected?getSingularityTargets(selected.r,selected.c):[];

  for(let dr=-1;dr<=8;dr++)for(let dc=-1;dc<=8;dc++){
    const r=myColor==="black"?7-dr:dr, c=myColor==="black"?7-dc:dc;
    const isSea=isSeaSquare(r,c);
    const s=document.createElement("div");
    s.className="square "+(isSea?"sea-square":((r+c)%2===0?"light":"dark"));
    const p=pieceAt(r,c);

    const ctrl=control?.[r]?.[c];
    if(ctrl==="white")s.classList.add("control-white");
    if(ctrl==="black")s.classList.add("control-black");

    if(isPlaceable(r,c)){
      s.classList.add("placeable");
    }

    if(p){
      const el=document.createElement("span");
      el.className=p.color==="white"?"white-piece":"black-piece";
      if(p.type==="pawn"&&p.gun)el.className+=" gun-pawn";
      /*
       * 야생마/기마병/네크로맨서는 심볼이 나이트·비숍과 겹치므로
       * 색깔 글로우 + 배지 글자로 구별한다.
       */
      if(p.type==="wildHorse")el.classList.add("wildhorse");
      if(p.type==="necromancer")el.classList.add("necromancer");
      if(p.type==="cavalry")el.classList.add("cavalry");
      if(p.type==="fleet")el.classList.add("fleet");
      if(p.type==="submarine")el.classList.add("submarine");
      if(p.type==="battleship")el.classList.add("battleship");
      if(p.type==="carrier")el.classList.add("carrier");
      if(p.attributes?.fire)el.classList.add("piece-fire");
      if(p.attributes?.cold)el.classList.add("piece-cold");
      el.textContent=pieceGlyph(p);

      /*
       * 아군 기물은 연성대 슬롯으로 드래그해서 놓을 수 있다.
       */
      if(p.color===myColor){
        el.draggable=true;
        el.classList.add("piece-draggable");
        el.addEventListener("dragstart",e=>{
          draggedFrom={r,c};
          e.dataTransfer.setData("text/plain",`${r},${c}`);
        });
      }

      if(p.type==="turret"){
        if(p.turretDisabled)el.classList.add("turret-disabled");
        const ammoTag=document.createElement("div");
        ammoTag.className="ammo";
        ammoTag.textContent=p.ammo;
        s.appendChild(el);
        s.appendChild(ammoTag);
      } else {
        s.appendChild(el);
      }

      if(p.attributes){
        const icons=Object.keys(ATTR_ICON).filter(k=>p.attributes[k]);
        if(icons.length){
          const tag=document.createElement("div");
          tag.className="attr-icons";
          tag.textContent=icons.map(k=>ATTR_ICON[k]).join("");
          s.appendChild(tag);
        }
        if(p.attributes.armored){
          const lifeTag=document.createElement("div");
          lifeTag.className="life-tag";
          lifeTag.textContent="♥"+p.lives;
          s.appendChild(lifeTag);
        }
      }
    }

    const sing=singularities.find(x=>x.r===r&&x.c===c);
    if(sing){
      s.classList.add("singularity");
      if(sing.needsRepair)s.classList.add("singularity-needs-repair");
    }

    if(selected?.r===r&&selected?.c===c)s.classList.add("selected");
    if(moves2.some(x=>x.r===r&&x.c===c)||carrierMoves.some(x=>x.r===r&&x.c===c)){s.classList.add("possible");if(p)s.classList.add("capture");else s.classList.add("empty")}
    if(guns.some(x=>x.r===r&&x.c===c)||turrets.some(x=>x.r===r&&x.c===c)||subTargets.some(x=>x.r===r&&x.c===c))s.classList.add("attack");
    if(selected&&pieceAt(selected.r,selected.c)?.type==="battleship"&&getBattleshipBlast(selected.r,selected.c).some(x=>x.r===r&&x.c===c))s.classList.add("attack");
    if(singularityTargets.some(x=>x.r===r&&x.c===c))s.classList.add("singularity-target");

    s.addEventListener("click",()=>handleSquareClick(r,c));
    s.addEventListener("contextmenu",e=>{e.preventDefault();handleSquareRightClick(r,c)});
    board.appendChild(s);
  }
}

async function handleSquareClick(r,c){
  if(gameEnded)return;

  /*
   * 배치를 기다리는 연성 기물이 있으면, 보드 클릭은 오직
   * (지배하는 빈 칸에) 배치하는 동작으로만 취급된다.
   */
  if(pendingForge?.[myColor]){
    if(isPlaceable(r,c)){
      sendAction({type:"placeForged",r,c});
    }
    return;
  }

  /*
   * 적에게 점령당했다가 벗어난 자신의 특이점을 클릭하면 수리(턴 소모)한다.
   */
  const sing=singularities.find(s=>s.r===r&&s.c===c&&s.color===myColor&&s.needsRepair);
  if(sing&&currentTurn===myColor){
    const occupant=boardState[r][c];
    if(!occupant||occupant.color===myColor){
      sendAction({type:"repairSingularity",r,c});
      selected=null;
      return;
    }
  }

  if(currentTurn!==myColor)return;

  const p=pieceAt(r,c);
  if(!selected){
    if(p?.color===myColor){selected={r,c};drawBoard()}
    return;
  }

  const fr=selected.r,fc=selected.c,sp=pieceAt(fr,fc);

  if(fr===r&&fc===c){
    /*
     * 전함은 대상을 따로 고르지 않고 자기 자신을 다시 클릭하면
     * 3*3 포격이 즉시 발동한다.
     */
    if(sp?.type==="battleship"&&sp.color===myColor&&getBattleshipBlast(fr,fc).length){
      sendAction({type:"battleshipAttack",fr,fc});
      selected=null;
      return;
    }
    selected=null;drawBoard();return;
  }

  if(sp?.type==="submarine"&&getSubmarineTargets(fr,fc).some(x=>x.r===r&&x.c===c)){
    sendAction({type:"submarineAttack",fr,fc,tr:r,tc:c});
    selected=null;
    return;
  }

  if(sp?.type==="carrier"&&getCarrierMoves(fr,fc).some(x=>x.r===r&&x.c===c)){
    sendAction({type:"carrierMove",fr,fc,tr:r,tc:c});
    selected=null;
    return;
  }

  if(sp?.gun&&getGunTargets(fr,fc).some(x=>x.r===r&&x.c===c)){
    sendAction({type:"gunAttack",fr,fc,tr:r,tc:c});
    selected=null;
    return;
  }

  if(sp?.type==="turret"&&getTurretTargets(fr,fc).some(x=>x.r===r&&x.c===c)){
    sendAction({type:"turretAttack",fr,fc,tr:r,tc:c});
    selected=null;
    return;
  }

  if(getMoves(fr,fc).some(x=>x.r===r&&x.c===c)){
    let promotion=null;
    if(eligibleFreePromotion(fr,fc,r,c)){promotion=await showPromotion()}
    sendAction({type:"move",fr,fc,tr:r,tc:c,promotion});
    selected=null;
    return;
  }

  if(p?.color===myColor){selected={r,c};drawBoard();return}
}

/*
 * 우클릭: 선택된 기물이 자신의 네크로맨서일 때, 주위 3*3의 빈 칸에 특이점을 생성한다.
 */
function handleSquareRightClick(r,c){
  if(gameEnded||currentTurn!==myColor||!selected)return;
  const targets=getSingularityTargets(selected.r,selected.c);
  if(targets.some(x=>x.r===r&&x.c===c)){
    sendAction({type:"createSingularity",necroR:selected.r,necroC:selected.c,r,c});
    selected=null;
    drawBoard();
  }
}

document.addEventListener("keydown",e=>{
  if(e.key.toLowerCase()!=="g"||!selected||currentTurn!==myColor)return;
  const p=boardState[selected.r][selected.c];
  if(p?.type==="pawn"&&!p.gun){sendAction({type:"gun",r:selected.r,c:selected.c});selected=null}
});

function renderMoves(){
  const list=document.getElementById("moveList");
  list.innerHTML="";
  for(let i=0;i<moves.length;i+=2){
    const row=document.createElement("div");
    row.className="move";
    row.textContent=`${i/2+1}. ${moves[i]||""}${moves[i+1]?" "+moves[i+1]:""}`;
    list.appendChild(row);
  }
  list.scrollTop=list.scrollHeight;
}

function formatTime(s){return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")}

function updateUI(){
  const elapsed=Math.floor((Date.now()-lastStateAt)/1000);
  const shownWhite=Math.max(0,time.white-(currentTurn==="white"&&!gameEnded?elapsed:0));
  const shownBlack=Math.max(0,time.black-(currentTurn==="black"&&!gameEnded?elapsed:0));

  document.getElementById("whiteTimer").textContent=formatTime(shownWhite);
  document.getElementById("blackTimer").textContent=formatTime(shownBlack);
  document.getElementById("whitePlayer").classList.toggle("active",currentTurn==="white");
  document.getElementById("blackPlayer").classList.toggle("active",currentTurn==="black");

  let st=document.getElementById("status");
  st.textContent=gameEnded?"GAME OVER":currentTurn===myColor?"YOUR TURN":"OPPONENT'S TURN";

  document.getElementById("whiteScore").textContent=`${score.white}점`;
  document.getElementById("blackScore").textContent=`${score.black}점`;
  document.getElementById("moveCounter").textContent=`전체 수: ${moveCount}`;

  const colossusAvailable=(colossusReady[myColor]||colossusSacrificeReady[myColor]);
  document.getElementById("colossusButton").classList.toggle("hidden",!colossusAvailable||currentTurn!==myColor||gameEnded);

  renderForge();
}

document.getElementById("restartButton").addEventListener("click",()=>sendAction({type:"restart"}));
document.getElementById("colossusButton").addEventListener("click",()=>{
  const raw=prompt("거신병을 소환할 빈 칸을 입력하세요. 예: e4");
  if(!raw)return;
  const f=raw.toLowerCase().match(/^([a-h])([1-8])$/);
  if(!f)return alert("칸 입력이 잘못되었습니다.");
  const c="abcdefgh".indexOf(f[1]),r=8-Number(f[2]);
  sendAction({type:"summonColossus",r,c});
});

connect();

clearInterval(localTimer);
localTimer=setInterval(()=>{if(boardState)updateUI()},250);
