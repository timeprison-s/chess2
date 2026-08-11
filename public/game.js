let socket=null,myColor=null,roomCode=null,boardState=null,currentTurn="white",selected=null,gameEnded=false,moves=[],time={white:600,black:600},score={white:0,black:0},moveCount=0,colossusReady={white:false,black:false},colossusSacrificeReady={white:false,black:false},singularities=[];
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
      boardState=m.board;currentTurn=m.currentTurn;moves=m.moves;time=m.time;gameEnded=m.gameEnded;
      score=m.score;moveCount=m.moveCount;colossusReady=m.colossusReady;
      colossusSacrificeReady=m.colossusSacrificeReady||{white:false,black:false};
      singularities=m.singularities||[];
      drawBoard();renderMoves();updateUI();
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
  for(let tr=0;tr<8;tr++)for(let tc=0;tc<8;tc++){const q=boardState[tr][tc];if(q&&q.type!=="king")out.push({r:tr,c:tc})}
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
  return(a.type==="knight"&&b.type==="knight")||(a.type==="bishop"&&b.type==="bishop")||(a.type==="rook"&&b.type==="rook")||((a.type==="pawn"&&b.type==="rook")||(a.type==="rook"&&b.type==="pawn"))||((a.type==="pawn"&&b.type==="knight")||(a.type==="knight"&&b.type==="pawn"))||((a.type==="pawn"&&b.type==="turret")||(a.type==="turret"&&b.type==="pawn"));
}
const PIECE_LABEL={pawn:"폰",knight:"나이트",bishop:"비숍",rook:"룩",queen:"퀸",king:"킹"};

/*
 * 연성 결과 판정. server.js의 forge 액션 판정 로직과 반드시 동일하게 유지한다.
 */
const RESULT_LABEL={wildHorse:"야생마",necromancer:"네크로맨서",tank:"전차",turret:"포탑",cavalry:"기마병",reload:"포탑 탄약 +1"};
function combineResultInfo(a,b){
  let result=null;
  if(a.type==="knight"&&b.type==="knight")result="wildHorse";
  else if(a.type==="bishop"&&b.type==="bishop")result="necromancer";
  else if(a.type==="rook"&&b.type==="rook")result="tank";
  else if((a.type==="pawn"&&b.type==="rook")||(a.type==="rook"&&b.type==="pawn"))result="turret";
  else if((a.type==="pawn"&&b.type==="knight")||(a.type==="knight"&&b.type==="pawn"))result="cavalry";
  else if((a.type==="pawn"&&b.type==="turret")||(a.type==="turret"&&b.type==="pawn"))result="reload";
  if(!result)return null;
  return {result,label:RESULT_LABEL[result]};
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
  if(p.type==="colossus")return p.color==="white"?"♔":"♚";
  if(p.type==="turret")return p.color==="white"?"♖":"♜";
  if(p.symbol)return p.symbol;
  const std={pawn:{white:"♙",black:"♟"},knight:{white:"♘",black:"♞"},bishop:{white:"♗",black:"♝"},rook:{white:"♖",black:"♜"},queen:{white:"♕",black:"♛"},king:{white:"♔",black:"♚"}};
  return std[p.type]?.[p.color]||"?";
}

/*
 * 연성대: 이제 거리 제한이 없다. 아군 기물이면 보드 어디에 있든
 * 드래그(또는 클릭)해서 재료 슬롯 2칸에 올리면 연성할 수 있다.
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

/*
 * 두 재료 좌표로부터 최종 소환 위치를 계산한다.
 * (서버 로직과 반드시 동일하게 유지: 포탑=룩 자리, 기마병=폰 자리,
 *  포탑 재장전=포탑 자리, 그 외=두 좌표 중간지점 반올림)
 */
function computeForgeFinalPos(A,B,result){
  let finalR=Math.round((A.r+B.r)/2),finalC=Math.round((A.c+B.c)/2);
  if(result==="turret"){
    const rookAt=A.p.type==="rook"?A:B;
    finalR=rookAt.r;finalC=rookAt.c;
  } else if(result==="cavalry"){
    const pawnAt=A.p.type==="pawn"?A:B;
    finalR=pawnAt.r;finalC=pawnAt.c;
  } else if(result==="reload"){
    const turretAt=A.p.type==="turret"?A:B;
    finalR=turretAt.r;finalC=turretAt.c;
  }
  return {finalR,finalC};
}

let forgeModalOpen=false;
let forgeSlots={A:null,B:null}; // 각각 null 또는 {r,c}
let draggedFrom=null; // 드래그 중인 기물의 {r,c}

function forgeSlotPiece(slot){
  const pos=forgeSlots[slot];
  return pos?boardState[pos.r]?.[pos.c]:null;
}

function renderForgeSlot(slot){
  const el=document.getElementById(slot==="A"?"forgeSlotA":"forgeSlotB");
  const p=forgeSlotPiece(slot);
  el.innerHTML="";
  el.classList.toggle("filled",!!p);
  if(p){
    const glyph=document.createElement("span");
    glyph.className=p.color==="white"?"white-piece":"black-piece";
    glyph.textContent=pieceGlyph(p);
    el.appendChild(glyph);
  } else {
    const label=document.createElement("span");
    label.className="forge-slot-label";
    label.textContent=slot==="A"?"재료 1":"재료 2";
    el.appendChild(label);
  }
}

function renderForgeOutput(){
  const outEl=document.getElementById("forgeOutputSlot");
  const infoEl=document.getElementById("forgeResultInfo");
  const confirmBtn=document.getElementById("forgeConfirm");

  outEl.innerHTML="";
  outEl.classList.remove("ready","invalid");

  const pa=forgeSlotPiece("A"),pb=forgeSlotPiece("B");

  if(!pa||!pb){
    const label=document.createElement("span");
    label.className="forge-slot-label";
    label.textContent="결과";
    outEl.appendChild(label);
    infoEl.textContent="";
    confirmBtn.classList.add("hidden");
    return;
  }

  if(forgeSlots.A.r===forgeSlots.B.r&&forgeSlots.A.c===forgeSlots.B.c){
    outEl.classList.add("invalid");
    infoEl.textContent="같은 기물을 두 번 놓을 수 없습니다.";
    confirmBtn.classList.add("hidden");
    return;
  }

  const info=combinable(pa,pb)?combineResultInfo(pa,pb):null;

  if(!info){
    outEl.classList.add("invalid");
    infoEl.textContent="이 두 기물은 연성할 수 없습니다.";
    confirmBtn.classList.add("hidden");
    return;
  }

  const A={r:forgeSlots.A.r,c:forgeSlots.A.c,p:pa};
  const B={r:forgeSlots.B.r,c:forgeSlots.B.c,p:pb};
  const {finalR,finalC}=computeForgeFinalPos(A,B,info.result);
  const occupant=boardState[finalR]?.[finalC];
  const blocked=occupant&&!(finalR===A.r&&finalC===A.c)&&!(finalR===B.r&&finalC===B.c);

  if(blocked){
    outEl.classList.add("invalid");
    infoEl.textContent=`소환 위치(${squareName(finalR,finalC)})에 다른 기물이 있어 연성할 수 없습니다.`;
    confirmBtn.classList.add("hidden");
    return;
  }

  outEl.classList.add("ready");
  const glyph=document.createElement("span");
  glyph.className=myColor==="white"?"white-piece":"black-piece";
  glyph.textContent=info.result==="reload"?pieceGlyph({type:"turret",color:myColor}):pieceGlyph({type:info.result,color:myColor});
  outEl.appendChild(glyph);

  infoEl.textContent=`${PIECE_LABEL[pa.type]||pa.type}(${squareName(forgeSlots.A.r,forgeSlots.A.c)}) + ${PIECE_LABEL[pb.type]||pb.type}(${squareName(forgeSlots.B.r,forgeSlots.B.c)}) → ${info.label}`;
  confirmBtn.classList.remove("hidden");
}

function renderForge(){
  renderForgeSlot("A");
  renderForgeSlot("B");
  renderForgeOutput();
}

/*
 * 슬롯에 기물을 배정한다. 드래그로 놓든, 클릭으로 놓든 이 함수를 거친다.
 * 빈 슬롯이 있으면 그쪽에 채우고, 둘 다 차있으면 재료1을 덮어쓴다.
 */
function assignForgeSlot(r,c){
  const p=boardState[r]?.[c];
  if(!p||p.color!==myColor)return;

  if(!forgeSlots.A){
    forgeSlots.A={r,c};
  } else if(!forgeSlots.B){
    forgeSlots.B={r,c};
  } else {
    forgeSlots.A={r,c};
    forgeSlots.B=null;
  }
  renderForge();
}

function clearForgeSlot(slot){
  forgeSlots[slot]=null;
  renderForge();
}

function openForgeModal(){
  forgeSlots={A:null,B:null};
  forgeModalOpen=true;
  renderForge();
  document.getElementById("forgeModal").classList.remove("hidden");
}

function closeForgeModal(){
  forgeModalOpen=false;
  forgeSlots={A:null,B:null};
  document.getElementById("forgeModal").classList.add("hidden");
}

document.getElementById("forgeButton").addEventListener("click",openForgeModal);
document.getElementById("forgeCancel").addEventListener("click",closeForgeModal);

document.getElementById("forgeSlotA").addEventListener("click",()=>{if(forgeSlots.A)clearForgeSlot("A")});
document.getElementById("forgeSlotB").addEventListener("click",()=>{if(forgeSlots.B)clearForgeSlot("B")});

for(const slotName of ["A","B"]){
  const el=document.getElementById(slotName==="A"?"forgeSlotA":"forgeSlotB");
  el.addEventListener("dragover",e=>{e.preventDefault();el.classList.add("drag-over")});
  el.addEventListener("dragleave",()=>el.classList.remove("drag-over"));
  el.addEventListener("drop",e=>{
    e.preventDefault();
    el.classList.remove("drag-over");
    if(!draggedFrom)return;
    forgeSlots[slotName]=draggedFrom;
    draggedFrom=null;
    renderForge();
  });
}

document.getElementById("forgeConfirm").addEventListener("click",()=>{
  const pa=forgeSlotPiece("A"),pb=forgeSlotPiece("B");
  if(!pa||!pb)return;
  sendAction({type:"forge",fr:forgeSlots.A.r,fc:forgeSlots.A.c,tr:forgeSlots.B.r,tc:forgeSlots.B.c});
  closeForgeModal();
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

function drawBoard(){
  const board=document.getElementById("board");
  board.innerHTML="";
  if(!boardState)return;

  let moves2=selected?getMoves(selected.r,selected.c):[],
      guns=selected?getGunTargets(selected.r,selected.c):[],
      turrets=selected?getTurretTargets(selected.r,selected.c):[],
      singularityTargets=selected?getSingularityTargets(selected.r,selected.c):[];

  for(let dr=0;dr<8;dr++)for(let dc=0;dc<8;dc++){
    const r=myColor==="black"?7-dr:dr, c=myColor==="black"?7-dc:dc;
    const s=document.createElement("div");
    s.className="square "+((r+c)%2===0?"light":"dark");
    const p=boardState[r][c];

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
    if(moves2.some(x=>x.r===r&&x.c===c)){s.classList.add("possible");if(p)s.classList.add("capture");else s.classList.add("empty")}
    if(guns.some(x=>x.r===r&&x.c===c)||turrets.some(x=>x.r===r&&x.c===c))s.classList.add("attack");
    if(singularityTargets.some(x=>x.r===r&&x.c===c))s.classList.add("singularity-target");

    s.addEventListener("click",()=>handleSquareClick(r,c));
    s.addEventListener("contextmenu",e=>{e.preventDefault();handleSquareRightClick(r,c)});
    board.appendChild(s);
  }
}

async function handleSquareClick(r,c){
  if(gameEnded)return;

  /*
   * 연성대가 열려있는 동안엔 보드 클릭이 일반 게임 동작 대신
   * 슬롯에 기물을 놓는 동작으로 취급된다 (드래그의 클릭 대체 수단).
   */
  if(forgeModalOpen){
    assignForgeSlot(r,c);
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

  const p=boardState[r][c];
  if(!selected){
    if(p?.color===myColor){selected={r,c};drawBoard()}
    return;
  }

  const fr=selected.r,fc=selected.c,sp=boardState[fr][fc];

  if(fr===r&&fc===c){selected=null;drawBoard();return}

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

  const forgeAvailable=currentTurn===myColor&&!gameEnded&&boardState&&!forgeModalOpen&&hasAnyCombinablePair();
  document.getElementById("forgeButton").classList.toggle("hidden",!forgeAvailable);
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
