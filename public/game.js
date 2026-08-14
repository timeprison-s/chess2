// 개잼체스 1.0 Alpha v0.3.0
// pieces + engine + UI/network client

// ===== 기물 / 특성 / 조합 =====
const TRAIT_LABELS = {
  fire: "화",
  cold: "냉",
  armor: "장갑",
  heavyArmor: "중장갑",
  mobility: "기동",
  stealth: "은신",
  berserk: "폭주",
  breakthrough: "돌파",
  piercing: "관통",
  blessing: "가호",
  detection: "탐지",
  confusion: "혼란",
  hypnosis: "최면",
  overwhelm: "압도",
  barrage: "포격",
  glass: "유리",
  freedom: "자유",
  command: "지휘",
};

const LOADOUTS = [
  ["cavalry","기마병"],
  ["infantry","보병"],
  ["kamikaze","자살특공대"],
  ["viking","바이킹"],
  ["tank_tree","전차류"],
  ["fleet_tree","함대류"],
  ["necromancer","네크로맨서"],
  ["rocket","로켓"],
  ["commander","지휘관"],
  ["pope","교황"],
  ["radar","레이더"],
  ["ninja","닌자"],
  ["hypnotist","최면술사"],
];

const basic = {
  pawn:   {name:"폰", symbol:"P", move:{kind:"king"}, attack:{kind:"king"}, traits:[], synthetic:false},
  rook:   {name:"룩", symbol:"R", move:{kind:"rook"}, attack:{kind:"rook"}, traits:[], synthetic:false},
  knight: {name:"나이트", symbol:"N", move:{kind:"knight"}, attack:{kind:"knight"}, traits:[], synthetic:false},
  bishop: {name:"비숍", symbol:"B", move:{kind:"bishop"}, attack:{kind:"bishop"}, traits:[], synthetic:false},
  queen:  {name:"퀸", symbol:"Q", move:{kind:"queen"}, attack:{kind:"queen"}, traits:[], synthetic:false},
  king:   {name:"킹", symbol:"K", move:{kind:"king"}, attack:{kind:"king"}, traits:[], synthetic:false},
};

const special = {
  cavalry: {
    name:"기마병", symbol:"기",
    move:{kind:"rook"}, attack:{kind:"square", radius:1, moving:true},
    traits:["mobility"], synthetic:true
  },
  tank: {
    name:"전차", symbol:"전",
    move:{kind:"square", radius:2},
    attack:{
      kind:"multi",
      modes:[
        {kind:"square", radius:1, moving:true},
        {kind:"squareRing", radius:2, inner:1, stationary:true}
      ]
    },
    traits:["mobility","armor"], synthetic:true
  },
  heavyTank: {
    name:"중전차", symbol:"중",
    move:{kind:"square", radius:2},
    attack:{
      kind:"multi",
      modes:[
        {kind:"square", radius:1, moving:true},
        {kind:"diamondRing", radius:3, inner:2, stationary:true}
      ]
    },
    traits:["mobility","armor","barrage"], synthetic:true
  },
  superHeavyTank: {
    name:"초중전차", symbol:"초",
    move:{kind:"diamond", radius:2},
    attack:{kind:"diamond", radius:2, stationary:true},
    traits:["piercing","breakthrough","heavyArmor","barrage"], synthetic:true
  },
  rocket: {
    name:"로켓", symbol:"로",
    move:{kind:"none"},
    attack:{kind:"diamondRing", radius:3, inner:2, stationary:true},
    traits:["berserk","barrage"], synthetic:true
  },
  commander: {
    name:"지휘관", symbol:"지",
    move:{kind:"king"}, attack:{kind:"none"},
    traits:["command"], synthetic:true
  },
  infantry: {
    name:"보병", symbol:"보",
    move:{kind:"square", radius:1},
    attack:{kind:"diamond", radius:2, moving:true},
    traits:[], synthetic:true
  },
  kamikaze: {
    name:"자살특공대", symbol:"자",
    move:{kind:"diamond", radius:2},
    attack:{kind:"square", radius:1, moving:true},
    traits:["barrage","glass","stealth"], synthetic:true
  },
  viking: {
    name:"바이킹", symbol:"바",
    move:{kind:"square", radius:1},
    attack:{kind:"square", radius:1, moving:true},
    traits:["freedom","berserk"], synthetic:true
  },
  pope: {
    name:"교황", symbol:"교",
    move:{kind:"none"}, attack:{kind:"none"},
    traits:["blessing"], synthetic:true
  },
  ninja: {
    name:"닌자", symbol:"닌",
    move:{kind:"square", radius:2},
    attack:{kind:"square", radius:1, moving:true},
    traits:["mobility","stealth"], synthetic:true
  },
  radar: {
    name:"레이더", symbol:"레",
    move:{kind:"none"}, attack:{kind:"none"},
    traits:["detection","armor"], detectionRadius:3, synthetic:true
  },
  hypnotist: {
    name:"최면술사", symbol:"최",
    move:{kind:"king"}, attack:{kind:"none"},
    traits:["hypnosis"], synthetic:true
  },
  hero: {
    name:"영웅", symbol:"영",
    move:{kind:"diamond", radius:2},
    attack:{kind:"diamond", radius:2, moving:true},
    traits:["overwhelm"], overwhelmRadius:2, synthetic:true
  },
  necromancer: {
    name:"네크로맨서", symbol:"네",
    move:{kind:"none"}, attack:{kind:"none"},
    traits:[], synthetic:true, placeholder:true
  },

  fleetFrame: {
    name:"함대 틀", symbol:"틀",
    move:{kind:"none"}, attack:{kind:"none"},
    traits:[], synthetic:true, naval:true
  },
  submarine: {
    name:"잠수함", symbol:"잠",
    move:{kind:"diamond", radius:2},
    attack:{kind:"square", radius:1, stationary:true, seaOnlyTarget:true},
    traits:["armor","stealth"], synthetic:true, naval:true
  },
  battleship: {
    name:"전함", symbol:"함",
    move:{kind:"diamond", radius:3},
    attack:{kind:"square", radius:2, stationary:true, canLandAttack:true},
    traits:["armor","detection"], detectionRadius:1,
    barrageOnLand:true, synthetic:true, naval:true
  },
  superBattleship: {
    name:"초중전함", symbol:"대",
    move:{kind:"diamond", radius:3},
    attack:{kind:"square", radius:2, stationary:true, canLandAttack:true},
    traits:["heavyArmor","piercing","barrage","detection"], detectionRadius:2,
    synthetic:true, naval:true
  },
  carrier: {
    name:"항공모함", symbol:"항",
    move:{kind:"diamond", radius:2},
    attack:{kind:"diamond", radius:4, stationary:true, canLandAttack:true},
    traits:["heavyArmor","berserk"], synthetic:true, naval:true,
    baseAttack:0.5, inflictsConfusion:true
  }
};

const PIECES = {...basic, ...special};

const RECIPES = [
  {result:"cavalry", requires:["knight","pawn"], loadout:"cavalry"},
  {result:"tank", requires:["rook","rook"], loadout:"tank_tree"},
  {result:"heavyTank", requires:["tank","knight"], loadout:"tank_tree"},
  {result:"superHeavyTank", requires:["tank","tank"], loadout:"tank_tree"},
  {result:"rocket", requires:["rook","pawn","pawn","pawn"], loadout:"rocket"},
  {result:"commander", requires:["queen","knight"], loadout:"commander"},
  {result:"infantry", requires:["pawn","pawn"], loadout:"infantry"},
  {result:"kamikaze", requires:["infantry"], loadout:"kamikaze"},
  {result:"infantry", requires:["kamikaze"], loadout:"infantry"},
  {result:"viking", requires:["knight","pawn","pawn"], loadout:"viking"},
  {result:"pope", requires:["bishop","bishop"], loadout:"pope"},
  {result:"ninja", requires:["infantry","pawn"], loadout:"ninja"},
  {result:"radar", requires:["rook","pawn","pawn"], loadout:"radar"},
  {result:"hypnotist", requires:["bishop","bishop","bishop"], loadout:"hypnotist"},

  {result:"fleetFrame", requires:["pawn","pawn","pawn"], loadout:"fleet_tree"},
  {result:"submarine", requires:["fleetFrame","pawn"], loadout:"fleet_tree"},
  {result:"battleship", requires:["fleetFrame","rook"], loadout:"fleet_tree"},
  {result:"superBattleship", requires:["battleship","battleship"], loadout:"fleet_tree"},
  {result:"carrier", requires:["fleetFrame","bishop"], loadout:"fleet_tree"},
];

function recipeFor(types, loadout) {
  const sorted = [...types].sort().join("|");
  return RECIPES.find(r =>
    r.requires.slice().sort().join("|") === sorted &&
    loadout.includes(r.loadout)
  ) || null;
}

function traitNames(traits=[]) {
  return traits.map(t => TRAIT_LABELS[t] || t);
}

// ===== 게임 엔진 =====
const SIZE = 14;
const LAND_MIN = 2;
const LAND_MAX = 11;

function id() {
  return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
}
function other(color) { return color === "white" ? "black" : "white"; }
function inBounds(r,c) { return r>=0 && c>=0 && r<SIZE && c<SIZE; }
function isLand(r,c) { return r>=LAND_MIN && r<=LAND_MAX && c>=LAND_MIN && c<=LAND_MAX; }
function isSea(r,c) { return inBounds(r,c) && !isLand(r,c); }
function key(r,c){ return `${r},${c}`; }
function at(state,r,c){ return state.pieces.find(p=>p.r===r && p.c===c) || null; }
function harborAt(state,r,c){ return state.harbors.find(h=>h.r===r && h.c===c) || null; }

function initialTerritory(r,c) {
  if (r <= 4) return "black";
  if (r >= 9) return "white";
  return "neutral";
}

function makePiece(type,color,r,c) {
  const d = PIECES[type];
  const p = {
    id:id(), type, color, controller:color, r,c,
    hp:1, origin:{r,c}, synthetic:!!d.synthetic,
    prince:false, cooldownUntilOwnTurn:0,
    hypnosisUntilPly:null, tempCommands:[],
  };
  p.hp = maxHp(p, null);
  return p;
}

function createInitialState(loadouts={white:[],black:[]}) {
  const territory = {};
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) territory[key(r,c)] = initialTerritory(r,c);

  const order = ["rook","bishop","knight","bishop","queen","king","knight","bishop","knight","rook"];
  const pieces = [];
  for (let i=0;i<10;i++) {
    pieces.push(makePiece(order[i],"black",2,2+i));
    pieces.push(makePiece("pawn","black",3,2+i));
    pieces.push(makePiece("pawn","white",10,2+i));
    pieces.push(makePiece(order[i],"white",11,2+i));
  }

  return {
    version:1,
    turn:"white",
    ply:0,
    ownTurns:{white:0,black:0},
    territory,
    pieces,
    harbors:[],
    portsPlaced:{white:0,black:0},
    loadouts,
    kingDead:{white:false,black:false},
    kingDeathOwnTurn:{white:null,black:null},
    princeCoronationOwnTurn:{white:null,black:null},
    revivals:[],
    winner:null,
    clocks:{white:600000,black:600000},
    turnStartedAt:Date.now(),
    log:["게임 시작. 백의 차례."],
  };
}

function pieceDef(p){ return PIECES[p.type]; }

function isConfused(state,p) {
  if (state.kingDead[p.color]) return true;
  return p.confusionUntilPly != null && state.ply < p.confusionUntilPly;
}

function effectiveTraits(state,p) {
  if (isConfused(state,p)) return [];
  return [...(pieceDef(p).traits || [])];
}

function hasTrait(state,p,t) {
  return effectiveTraits(state,p).includes(t);
}

function maxHp(p,state) {
  if (state && isConfused(state,p)) return 0.5;
  const traits = pieceDef(p).traits || [];
  let hp = 1;
  if (traits.includes("cold")) hp += 2;
  if (traits.includes("armor")) hp += 1;
  if (traits.includes("heavyArmor")) hp += 3;
  if (state && (p.tempCommands||[]).some(x => x.kind==="lastStand" && state.ply < x.untilPly)) hp += 1;
  return hp;
}

function attackPower(state,p) {
  if (isConfused(state,p)) return 0.5;
  const d = pieceDef(p);
  let atk = d.baseAttack ?? 1;
  const tr = effectiveTraits(state,p);
  if (tr.includes("fire")) atk += 1;
  if (tr.includes("piercing")) atk += 3;
  return atk;
}

function effectiveMove(state,p) {
  if (isConfused(state,p)) return {kind:"king"};
  return pieceDef(p).move;
}

function pathClear(state,fr,fc,tr,tc) {
  const dr = Math.sign(tr-fr), dc = Math.sign(tc-fc);
  let r=fr+dr,c=fc+dc;
  while(r!==tr || c!==tc) {
    if (at(state,r,c)) return false;
    r+=dr;c+=dc;
  }
  return true;
}

function shapeAllows(state,p,shape,tr,tc) {
  if (!shape || shape.kind==="none") return false;
  const dr = tr-p.r, dc = tc-p.c;
  const ar = Math.abs(dr), ac = Math.abs(dc);
  if (ar===0 && ac===0) return false;

  switch(shape.kind) {
    case "king": return ar<=1 && ac<=1;
    case "square": return Math.max(ar,ac)<=shape.radius;
    case "diamond": return ar+ac<=shape.radius;
    case "squareRing": return Math.max(ar,ac)<=shape.radius && Math.max(ar,ac)>shape.inner;
    case "diamondRing": return ar+ac<=shape.radius && ar+ac>shape.inner;
    case "knight": return (ar===2&&ac===1)||(ar===1&&ac===2);
    case "rook":
      return (dr===0 || dc===0) && pathClear(state,p.r,p.c,tr,tc);
    case "bishop":
      return ar===ac && pathClear(state,p.r,p.c,tr,tc);
    case "queen":
      return ((dr===0||dc===0)||ar===ac) && pathClear(state,p.r,p.c,tr,tc);
  }
  return false;
}

function attackModeFor(state,p,tr,tc) {
  if (isConfused(state,p)) {
    return shapeAllows(state,p,{kind:"king"},tr,tc) ? {kind:"king",moving:true} : null;
  }
  const a = pieceDef(p).attack;
  if (!a || a.kind==="none") return null;
  if (a.kind==="multi") {
    for (const mode of a.modes) if (shapeAllows(state,p,mode,tr,tc)) return mode;
    return null;
  }
  return shapeAllows(state,p,a,tr,tc) ? a : null;
}

function domainAllowsMove(state,p,r,c) {
  const d = pieceDef(p);
  if (hasTrait(state,p,"freedom")) return true;
  if (d.naval) return isSea(r,c);
  return isLand(r,c);
}

function canMove(state,p,tr,tc,viewer=null) {
  if (!inBounds(tr,tc)) return false;
  if (!domainAllowsMove(state,p,tr,tc)) return false;
  if (!shapeAllows(state,p,effectiveMove(state,p),tr,tc)) return false;

  const target = at(state,tr,tc);
  if (!target) return true;

  // 안 보이는 은신 기물은 빈 칸처럼 취급 -> 실제 이동 시 충돌사망 판정
  if (viewer && !isVisibleTo(state,target,viewer)) return true;
  return false;
}

function canAttackPoint(state,p,tr,tc,viewer=null) {
  if (!inBounds(tr,tc)) return false;
  const mode = attackModeFor(state,p,tr,tc);
  if (!mode) return false;
  const d = pieceDef(p);
  if (mode.seaOnlyTarget && !isSea(tr,tc)) return false;

  const target = at(state,tr,tc);
  if (mode.stationary) return true; // 좌표 포격 허용
  if (!target) return false;
  if (viewer && !isVisibleTo(state,target,viewer)) return false;
  return true;
}

function detectionCovers(state,viewer,r,c) {
  return state.pieces.some(p => {
    if (p.controller !== viewer) return false;
    if (!hasTrait(state,p,"detection")) return false;
    const rad = pieceDef(p).detectionRadius ?? 0;
    return Math.max(Math.abs(p.r-r),Math.abs(p.c-c)) <= rad;
  });
}

function isVisibleTo(state,p,viewer) {
  if (p.controller === viewer) return true;
  if (!hasTrait(state,p,"stealth")) return true;
  return detectionCovers(state,viewer,p.r,p.c);
}

function addLog(state,msg) {
  state.log.push(msg);
  if (state.log.length>80) state.log.shift();
}

function captureTerritory(state,p,r,c) {
  const owner = p.controller;
  const k = key(r,c);
  if (state.territory[k] !== owner) state.territory[k] = owner;
}

function checkVictory(state) {
  for (const color of ["white","black"]) {
    let all = true;
    for (let r=LAND_MIN;r<=LAND_MAX;r++) {
      for (let c=LAND_MIN;c<=LAND_MAX;c++) {
        if (state.territory[key(r,c)] !== color) { all=false; break; }
      }
      if (!all) break;
    }
    if (all) state.winner = color;
  }
}

function destroyEnemyHarborOnEntry(state,p,r,c) {
  const idx = state.harbors.findIndex(h=>h.r===r && h.c===c && h.color!==p.controller);
  if (idx>=0) {
    addLog(state, `${p.controller==="white"?"백":"흑"}이 상대 항구를 파괴.`);
    state.harbors.splice(idx,1);
  }
}

function removePiece(state,p,reason="사망") {
  const idx = state.pieces.findIndex(x=>x.id===p.id);
  if (idx<0) return;

  // 가호: 합성 기물은 적용 안 됨. 교황의 3개 열 오라를 동적으로 판정.
  const blessed = !p.synthetic && isBlessedByPope(state,p);
  if (blessed) {
    state.revivals.push({
      piece: structuredClone(p),
      dueOwnTurn: state.ownTurns[p.color] + 2
    });
    addLog(state, `${PIECES[p.type].name} 가호 발동: 2턴 뒤 부활 예정.`);
  }

  if (p.type === "king") {
    state.kingDead[p.color] = true;
    state.kingDeathOwnTurn[p.color] = state.ownTurns[p.color];
    const prince = state.pieces.find(x=>x.color===p.color && x.prince && x.id!==p.id);
    state.princeCoronationOwnTurn[p.color] = prince ? state.ownTurns[p.color] + 2 : null;
    addLog(state, `${p.color==="white"?"백":"흑"} 왕 사망: 전군 혼란.`);
  }

  state.pieces.splice(idx,1);
}

function isBlessedByPope(state,p) {
  return state.pieces.some(x =>
    x.color===p.color &&
    x.type==="pope" &&
    Math.abs(x.c-p.c)<=1 &&
    !isConfused(state,x)
  );
}

function damageOne(state,attacker,target,amount,{instantKill=false,inflictConfusion=false}={}) {
  if (!target) return false;
  if (instantKill) target.hp = 0;
  else target.hp -= amount;
  if (inflictConfusion && target.hp>0) {
    target.confusionUntilPly = state.ply + 3;
    target.hp = Math.min(target.hp,0.5);
  }
  if (target.hp <= 0) {
    removePiece(state,target);
    return true;
  }
  return false;
}

function commandFlags(state,p) {
  const active = (p.tempCommands||[]).filter(x=>state.ply < x.untilPly);
  return {
    lastStand: active.some(x=>x.kind==="lastStand"),
    indiscriminate: active.some(x=>x.kind==="indiscriminate"),
  };
}

function applyLastStandFloor(state,p) {
  const f = commandFlags(state,p);
  if (f.lastStand) return 1;
  return 0;
}

function movePiece(state,p,tr,tc,viewer) {
  if (!canMove(state,p,tr,tc,viewer)) return {ok:false,msg:"이동 불가"};
  const hidden = at(state,tr,tc);
  if (hidden && !isVisibleTo(state,hidden,viewer)) {
    // 은신 함정: 이동한 기물이 죽음
    addLog(state, `${PIECES[p.type].name}이 은신 기물과 충돌하여 사망.`);
    removePiece(state,p);
    return {ok:true, action:"move", moved:false};
  }
  p.r=tr;p.c=tc;
  captureTerritory(state,p,tr,tc);
  destroyEnemyHarborOnEntry(state,p,tr,tc);
  checkVictory(state);
  return {ok:true, action:"move", moved:true};
}

function barrageTargets(state,r,c) {
  return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]
    .filter(([rr,cc])=>inBounds(rr,cc))
    .map(([rr,cc])=>at(state,rr,cc))
    .filter(Boolean);
}

function attackPoint(state,p,tr,tc,viewer) {
  const mode = attackModeFor(state,p,tr,tc);
  if (!mode || !canAttackPoint(state,p,tr,tc,viewer)) return {ok:false,msg:"공격 불가"};

  const d = pieceDef(p);
  const amount = attackPower(state,p);
  const primary = at(state,tr,tc);
  const primaryWasThere = !!primary;
  let primaryKilled = false;

  if (primary) {
    primaryKilled = damageOne(state,p,primary,amount,{inflictConfusion:!!d.inflictsConfusion});
    addLog(state, `${d.name} 공격 → ${PIECES[primary.type].name} (${amount} 피해)`);
  } else {
    addLog(state, `${d.name} 좌표 포격 (${tr}, ${tc})`);
  }

  let doBarrage = hasTrait(state,p,"barrage");
  if (d.barrageOnLand) doBarrage = isLand(tr,tc);
  if (doBarrage) {
    for (const t of [...barrageTargets(state,tr,tc)]) {
      if (primary && t.id===primary.id) continue;
      damageOne(state,p,t,amount);
    }
  }

  const flags = commandFlags(state,p);
  if (flags.indiscriminate) {
    for (const t of [...barrageTargets(state,tr,tc)]) damageOne(state,p,t,999,{instantKill:true});
  }

  if (hasTrait(state,p,"glass")) {
    const still = state.pieces.find(x=>x.id===p.id);
    if (still) removePiece(state,still);
  }

  if (hasTrait(state,p,"berserk")) {
    p.cooldownUntilOwnTurn = state.ownTurns[p.color] + 2;
  }

  // 이동공격: 실제 대상이 있었고 처치했을 때만 진입
  if (mode.moving && primaryWasThere && primaryKilled) {
    const still = state.pieces.find(x=>x.id===p.id);
    if (still && !at(state,tr,tc) && domainAllowsMove(state,still,tr,tc)) {
      still.r=tr; still.c=tc;
      captureTerritory(state,still,tr,tc);
      destroyEnemyHarborOnEntry(state,still,tr,tc);
      checkVictory(state);
    }
  }
  return {ok:true, action:"attack"};
}

function canAct(state,p,color) {
  if (!p || p.controller!==color) return false;
  if (p.cooldownUntilOwnTurn && state.ownTurns[p.color] < p.cooldownUntilOwnTurn) return false;
  return true;
}

function endTurn(state) {
  const acted = state.turn;
  state.ownTurns[acted] += 1;
  state.ply += 1;

  // 최면 만료
  for (const p of state.pieces) {
    if (p.hypnosisUntilPly != null && state.ply >= p.hypnosisUntilPly) {
      p.controller = p.color;
      p.hypnosisUntilPly = null;
    }
    p.tempCommands = (p.tempCommands||[]).filter(x=>state.ply < x.untilPly);
    const mh = maxHp(p,state);
    if (p.hp > mh) p.hp = mh;
  }

  // 왕자 즉위
  for (const color of ["white","black"]) {
    const due = state.princeCoronationOwnTurn[color];
    if (state.kingDead[color] && due != null && state.ownTurns[color] >= due) {
      const prince = state.pieces.find(p=>p.color===color && p.prince && p.type==="pawn");
      if (prince) {
        prince.type="king";
        prince.prince=false;
        prince.hp=Math.min(Math.max(prince.hp,1),1);
        state.kingDead[color]=false;
        state.kingDeathOwnTurn[color]=null;
        state.princeCoronationOwnTurn[color]=null;
        addLog(state, `${color==="white"?"백":"흑"} 왕자 즉위. 혼란 해제.`);
      } else {
        state.princeCoronationOwnTurn[color]=null;
      }
    }
  }

  // 부활
  for (let i=state.revivals.length-1;i>=0;i--) {
    const rv=state.revivals[i], color=rv.piece.color;
    if (state.ownTurns[color] >= rv.dueOwnTurn) {
      const {r,c}=rv.piece.origin;
      if (!at(state,r,c)) {
        const p=rv.piece;
        p.id=id(); p.r=r;p.c=c;p.hp=maxHp(p,state);
        p.prince=false;p.controller=p.color;p.hypnosisUntilPly=null;
        state.pieces.push(p);
        addLog(state, `${PIECES[p.type].name} 가호 부활 성공.`);
      } else addLog(state, `${PIECES[rv.piece.type].name} 가호 부활 실패: 원래 자리가 막힘.`);
      state.revivals.splice(i,1);
    }
  }

  state.turn = other(acted);
  if (!state.winner) addLog(state, `${state.turn==="white"?"백":"흑"}의 차례.`);
}

function canAppointPrince(state,color) {
  if (!state.kingDead[color]) return true;
  const deadAt = state.kingDeathOwnTurn[color];
  return deadAt != null && state.ownTurns[color] >= deadAt + 4;
}

function appointPrince(state,p) {
  const color=state.turn;
  if (!canAppointPrince(state,color)) return {ok:false,msg:"아직 왕자를 정할 수 없음."};
  if (!p || p.controller!==color || p.color!==color || p.type!=="pawn") return {ok:false,msg:"자기 폰만 왕자로 지정 가능."};
  for (const x of state.pieces) if (x.color===color) x.prince=false;
  p.prince=true;
  if (state.kingDead[color]) state.princeCoronationOwnTurn[color] = state.ownTurns[color] + 2;
  addLog(state, `${color==="white"?"백":"흑"} 왕자 지정.`);
  return {ok:true};
}

function canInstallHarbor(state,color,r,c) {
  if (!state.loadouts[color]?.includes("fleet_tree")) return false;
  if (state.portsPlaced[color]>=3) return false;
  if (!isLand(r,c) || at(state,r,c) || harborAt(state,r,c)) return false;
  return [[1,0],[-1,0],[0,1],[0,-1]].some(([dr,dc])=>{
    const rr=r+dr,cc=c+dc;
    return isSea(rr,cc) && state.territory[key(rr,cc)]===color;
  });
}

function installHarbor(state,color,r,c) {
  if (!canInstallHarbor(state,color,r,c)) return {ok:false,msg:"항구 설치 불가"};
  state.harbors.push({id:id(),color,r,c});
  state.portsPlaced[color]+=1;
  addLog(state, `${color==="white"?"백":"흑"} 항구 설치 (${state.portsPlaced[color]}/3)`);
  return {ok:true};
}

function canPlaceCraft(state,color,type,r,c) {
  const d=PIECES[type];
  if (!d) return false;
  if (at(state,r,c)) return false;
  if (d.naval) {
    if (!isSea(r,c) || state.territory[key(r,c)]!==color) return false;
    return state.harbors.some(h =>
      h.color===color &&
      Math.abs(h.r-r)+Math.abs(h.c-c)===1
    );
  }
  return isLand(r,c) && state.territory[key(r,c)]===color;
}

function placeCraft(state,color,type,r,c) {
  if (!canPlaceCraft(state,color,type,r,c)) return {ok:false,msg:"배치 불가"};
  const p=makePiece(type,color,r,c);
  p.synthetic=true;
  state.pieces.push(p);
  addLog(state, `${PIECES[type].name} 배치.`);
  return {ok:true,piece:p};
}

function consumePieces(state,ids) {
  state.pieces = state.pieces.filter(p=>!ids.includes(p.id));
}

function applyHypnosis(state,caster,target) {
  if (!caster || caster.type!=="hypnotist" || isConfused(state,caster)) return {ok:false,msg:"최면 사용 불가"};
  if (!target || target.controller===caster.controller) return {ok:false,msg:"상대 기물만 가능"};
  if (Math.max(Math.abs(caster.r-target.r),Math.abs(caster.c-target.c))>2) return {ok:false,msg:"최면 범위 밖"};
  target.controller=caster.controller;
  target.hypnosisUntilPly=state.ply+3;
  addLog(state, `${PIECES[target.type].name} 최면: 3수 동안 ${caster.controller==="white"?"백":"흑"} 통제.`);
  return {ok:true};
}

function applyCommand(state,commander,target,kind) {
  if (!commander || commander.type!=="commander" || isConfused(state,commander)) return {ok:false,msg:"지휘 사용 불가"};
  if (!target || target.controller!==commander.controller) return {ok:false,msg:"아군 기물만 지휘 가능"};
  if (Math.max(Math.abs(commander.r-target.r),Math.abs(commander.c-target.c))>2) return {ok:false,msg:"지휘 범위 밖"};
  target.tempCommands = (target.tempCommands||[]).filter(x=>x.kind!==kind);
  target.tempCommands.push({kind,untilPly:state.ply+3});
  if (kind==="lastStand") target.hp += 1;
  addLog(state, `${PIECES[target.type].name}에 ${kind==="lastStand"?"최후의 저항":"무차별 공격"} 부여.`);
  return {ok:true};
}

function isOverwhelmed(state,p) {
  if (isConfused(state,p)) return false;
  return state.pieces.some(h =>
    h.type==="hero" &&
    h.controller!==p.controller &&
    !isConfused(state,h) &&
    Math.max(Math.abs(h.r-p.r),Math.abs(h.c-p.c))<=2
  );
}

function normalizeHpAfterStateEffects(state) {
  for (const p of state.pieces) {
    const mh=maxHp(p,state) + applyLastStandFloor(state,p);
    if (p.hp>mh) p.hp=mh;
  }
}


// ===== 기물 SVG 이미지 =====
const CHESS_GLYPHS = {
  pawn:"♟", rook:"♜", knight:"♞", bishop:"♝", queen:"♛", king:"♚"
};

function svgWrap(body, label="기물") {
  return `<svg class="piece-art" viewBox="0 0 48 48" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}


function princeCrownArt() {
  return `<svg viewBox="0 0 32 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 6l7 5 6-9 6 9 7-5-3 13H6L3 6z"
      fill="currentColor" stroke="rgba(35,29,10,.85)" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M7 17h18" fill="none" stroke="rgba(255,245,188,.75)" stroke-width="1.2"/>
  </svg>`;
}

function harborArt() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3v13M8 7h8M7 13c0 4 2 7 5 8 3-1 5-4 5-8M4 14c1 5 4 8 8 8s7-3 8-8"
      fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="4" r="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/>
  </svg>`;
}

function pieceArt(type) {
  const name = PIECES[type]?.name || type;
  if (CHESS_GLYPHS[type]) {
    return svgWrap(`<text class="glyph" x="24" y="25">${CHESS_GLYPHS[type]}</text>`, name);
  }

  const art = {
    cavalry: `<path class="body" d="M13 39h25l-2-6-7-3 5-5-2-10-6-6-9 3 5 6-9 5-3 9z"/><circle class="cut" cx="27" cy="15" r="1.7"/>`,
    tank: `<rect class="body" x="8" y="29" width="32" height="8" rx="3"/><rect class="body" x="14" y="22" width="18" height="8" rx="2"/><rect class="body" x="20" y="17" width="10" height="6" rx="2"/><rect class="body" x="28" y="18" width="13" height="3" rx="1.5"/><circle class="cut" cx="15" cy="34" r="2"/><circle class="cut" cx="24" cy="34" r="2"/><circle class="cut" cx="33" cy="34" r="2"/>`,
    heavyTank: `<rect class="body" x="6" y="28" width="36" height="10" rx="3"/><rect class="body" x="12" y="20" width="22" height="9" rx="2"/><rect class="body" x="18" y="14" width="14" height="7" rx="2"/><rect class="body" x="30" y="16" width="14" height="4" rx="2"/><circle class="cut" cx="13" cy="34" r="2.2"/><circle class="cut" cx="22" cy="34" r="2.2"/><circle class="cut" cx="31" cy="34" r="2.2"/><circle class="cut" cx="38" cy="34" r="2.2"/>`,
    superHeavyTank: `<rect class="body" x="4" y="28" width="40" height="11" rx="3"/><rect class="body" x="10" y="18" width="25" height="11" rx="2"/><rect class="body" x="16" y="12" width="17" height="7" rx="2"/><rect class="body" x="31" y="14" width="14" height="3" rx="1.5"/><rect class="body" x="31" y="19" width="14" height="3" rx="1.5"/><circle class="cut" cx="11" cy="34" r="2.2"/><circle class="cut" cx="20" cy="34" r="2.2"/><circle class="cut" cx="29" cy="34" r="2.2"/><circle class="cut" cx="38" cy="34" r="2.2"/>`,
    rocket: `<path class="body" d="M26 5c7 5 10 14 8 23l-8 8-7-7c0-10 2-18 7-24z"/><path class="body" d="M19 25l-7 4 4 4zM31 29l5 8 3-9z"/><circle class="cut" cx="27" cy="17" r="3"/><path class="body" d="M22 34l4 9 4-9z"/>`,
    commander: `<path class="body" d="M9 35h30l-3-12-12-7-12 7z"/><path class="body" d="M16 15l8-10 8 10-8 4z"/><path class="cut" d="M24 22l2 4 5 .7-3.5 3.3.8 5-4.3-2.2-4.3 2.2.8-5-3.5-3.3 5-.7z"/>`,
    infantry: `<circle class="body" cx="21" cy="13" r="6"/><path class="body" d="M13 40l2-17 6-4 7 5 5 16z"/><path class="line" d="M29 21l11 16M34 26l5-3"/>`,
    kamikaze: `<circle class="body" cx="24" cy="28" r="13"/><path class="line" d="M29 15c2-6 6-8 11-7"/><path class="line" d="M37 8l4-3"/><path class="cut" d="M17 26h14v4H17z"/>`,
    viking: `<path class="body" d="M12 24c2-9 7-14 12-14s10 5 12 14v14H12z"/><path class="body" d="M15 20C8 18 5 13 6 8c5 5 9 5 13 4zM33 20c7-2 10-7 9-12-5 5-9 5-13 4z"/><rect class="cut" x="18" y="25" width="12" height="4" rx="2"/>`,
    pope: `<path class="body" d="M17 39h14l3-16-10-17-10 17z"/><path class="line" d="M24 5v18M18 13h12"/><path class="body" d="M12 40h24v4H12z"/>`,
    ninja: `<circle class="body" cx="24" cy="22" r="15"/><path class="cut" d="M11 20c8-4 18-4 26 0v8c-9-3-17-3-26 0z"/><circle class="body" cx="19" cy="23" r="1.6"/><circle class="body" cx="29" cy="23" r="1.6"/><path class="body" d="M16 34h16l5 10H11z"/>`,
    radar: `<path class="body" d="M9 10c14 0 25 11 25 25H9z"/><path class="line" d="M13 34L37 10M24 34v9M17 43h14"/><circle class="body" cx="36" cy="10" r="3"/>`,
    hypnotist: `<path class="line" d="M24 7c11 0 17 8 17 17S34 41 24 41 7 34 7 24 14 9 24 9c8 0 13 6 13 13s-5 12-12 12-11-4-11-10 4-9 9-9 8 3 8 7-3 7-7 7-6-2-6-5 2-4 4-4"/>`,
    hero: `<path class="body" d="M24 5l5.5 11.2L42 18l-9 8.8 2.2 12.4L24 33.4 12.8 39.2 15 26.8 6 18l12.5-1.8z"/><path class="cut" d="M21 16h6v13h-6zM17 21h14v5H17z"/>`,
    necromancer: `<circle class="body" cx="22" cy="18" r="9"/><circle class="cut" cx="19" cy="17" r="2"/><circle class="cut" cx="25" cy="17" r="2"/><path class="cut" d="M18 23h8v3h-8z"/><path class="body" d="M13 42l3-16h12l5 16z"/><path class="line" d="M35 8v34M31 12h8"/>`,
    fleetFrame: `<path class="body" d="M7 31h34l-5 9H13z"/><path class="line" d="M12 27h24M17 27V16M24 27V10M31 27V18"/>`,
    submarine: `<path class="body" d="M7 28c5-8 29-8 34 0-5 8-29 8-34 0z"/><rect class="body" x="21" y="17" width="8" height="7" rx="2"/><path class="line" d="M25 17v-5h7"/><circle class="cut" cx="15" cy="28" r="1.4"/><circle class="cut" cx="33" cy="28" r="1.4"/>`,
    battleship: `<path class="body" d="M5 31h38l-6 9H12z"/><rect class="body" x="12" y="24" width="23" height="7"/><rect class="body" x="19" y="17" width="10" height="7"/><path class="line" d="M26 19h15M17 26H7"/>`,
    superBattleship: `<path class="body" d="M3 31h42l-7 10H10z"/><rect class="body" x="9" y="23" width="30" height="8"/><rect class="body" x="18" y="15" width="13" height="8"/><path class="line" d="M29 17h16M29 21h16M18 26H4M18 29H4"/>`,
    carrier: `<path class="body" d="M4 30h40l-6 10H10z"/><path class="body" d="M8 18h33l3 9H5z"/><rect class="body" x="12" y="12" width="7" height="6"/><path class="line" d="M23 21h13M29 18l7 6M36 18l-7 6"/>`
  };
  return svgWrap(art[type] || `<path class="body" d="M10 10h28v28H10z"/>`, name);
}


// ===== UI / 온라인 =====
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const screens = {
  main: $("#mainScreen"),
  browser: $("#roomBrowserScreen"),
  create: $("#createRoomScreen"),
  waiting: $("#waitingRoomScreen"),
  loadout: $("#loadoutScreen"),
  game: $("#gameScreen"),
};

const boardEl = $("#board");
const sideEl = $("#sidePanel");
const toastEl = $("#toast");

let socket = null;
let socketPromise = null;
let roomDirectory = [];
let selectedRoomCode = null;
let currentRoomSnapshot = null;
let roomCode = null;
let myColor = null;
let localMode = false;
let state = null;

let chosenLoadout = new Set();
let selectedId = null;
let subAction = null;
let uiMode = null;
let forgeIds = [];
let pendingCraft = null;
let clockTicker = null;
let pieceDrag = null;
let suppressBoardClickUntil = 0;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function showScreen(name) {
  Object.values(screens).forEach(el => el.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function setNetworkText(text) {
  $("#networkText").textContent = text;
}

function ensureSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
  if (socketPromise) return socketPromise;

  const proto = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${proto}://${location.host}`);
  bindSocket(socket);
  setNetworkText("서버 연결 중");

  socketPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 8000);

    socket.addEventListener("open", () => {
      clearTimeout(timer);
      socketPromise = null;
      setNetworkText("온라인");
      socket.send(JSON.stringify({type: "list_rooms"}));
      resolve(socket);
    }, {once: true});

    socket.addEventListener("error", () => {
      clearTimeout(timer);
      socketPromise = null;
      setNetworkText("연결 실패");
      reject(new Error("socket error"));
    }, {once: true});
  });

  return socketPromise;
}

async function sendMessage(payload) {
  try {
    const ws = await ensureSocket();
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    toast("서버 연결 실패.");
    return false;
  }
}

function bindSocket(ws) {
  ws.addEventListener("message", e => {
    let msg;
    try { msg = JSON.parse(e.data); }
    catch { return; }

    if (msg.type === "error") {
      toast(msg.message);
      return;
    }

    if (msg.type === "room_list") {
      roomDirectory = Array.isArray(msg.rooms) ? msg.rooms : [];
      if (selectedRoomCode && !roomDirectory.some(r => r.code === selectedRoomCode)) {
        selectedRoomCode = null;
      }
      renderRoomBrowser();
      return;
    }

    if (msg.type === "room_joined") {
      myColor = msg.color;
      roomCode = msg.room;
      currentRoomSnapshot = msg.snapshot;
      renderWaitingRoom();
      showScreen("waiting");
      return;
    }

    if (msg.type === "left_room") {
      roomCode = null;
      myColor = null;
      currentRoomSnapshot = null;
      selectedRoomCode = null;
      showScreen("main");
      return;
    }

    if (msg.type === "role_update") {
      myColor = msg.color;
      return;
    }

    if (msg.type === "room_snapshot") {
      currentRoomSnapshot = msg.snapshot;
      if (!screens.waiting.classList.contains("hidden")) renderWaitingRoom();
      if (!screens.loadout.classList.contains("hidden")) updateLoadoutWaiting();
      return;
    }

    if (msg.type === "phase_loadout") {
      currentRoomSnapshot = msg.snapshot;
      showLoadout(false);
      return;
    }

    if (msg.type === "start_game") {
      state = createInitialState(msg.loadouts);
      startGame();
      if (myColor === "white") sendState();
      return;
    }

    if (msg.type === "state") {
      state = msg.state;
      ensureClockState();
      clearTransient();
      render();
    }
  });

  ws.addEventListener("close", () => {
    socket = null;
    socketPromise = null;
    setNetworkText("연결 끊김");
  });
}

// ---------- 메인 / 방 목록 ----------
$("#openRoomList").onclick = async () => {
  showScreen("browser");
  await sendMessage({type: "list_rooms"});
  renderRoomBrowser();
};

$("#openCreateRoom").onclick = () => {
  $("#createRoomName").value = "";
  $("#createRoomPassword").value = "";
  showScreen("create");
  $("#createRoomName").focus();
};

$("#roomListBack").onclick = () => showScreen("main");
$("#createBack").onclick = () => showScreen("main");
$("#cancelCreate").onclick = () => showScreen("main");

$("#refreshRooms").onclick = () => sendMessage({type: "list_rooms"});

$("#confirmCreate").onclick = async () => {
  const name = $("#createRoomName").value.trim() || "개잼체스 방";
  const password = $("#createRoomPassword").value;

  $("#confirmCreate").disabled = true;
  const ok = await sendMessage({type: "create_room", name, password});
  $("#confirmCreate").disabled = false;
  if (!ok) return;
};

$("#createRoomName").addEventListener("keydown", e => {
  if (e.key === "Enter") $("#confirmCreate").click();
});
$("#createRoomPassword").addEventListener("keydown", e => {
  if (e.key === "Enter") $("#confirmCreate").click();
});

function roomStatusLabel(room) {
  if (room.status === "playing") return "게임 중";
  if (room.status === "loadout") return "선택 중";
  if (room.status === "full") return "가득 참";
  return "입장 가능";
}

function renderRoomBrowser() {
  const list = $("#roomList");
  const details = $("#roomDetails");
  if (!list || !details) return;

  list.innerHTML = "";

  if (!roomDirectory.length) {
    list.innerHTML = `<div class="empty-detail">열린 방이 없음.</div>`;
    details.innerHTML = `<div class="empty-detail">방을 만들거나 새로고침.</div>`;
    return;
  }

  if (!selectedRoomCode) selectedRoomCode = roomDirectory[0].code;

  for (const room of roomDirectory) {
    const btn = document.createElement("button");
    btn.className = "room-list-item" + (room.code === selectedRoomCode ? " selected" : "");
    btn.innerHTML = `
      <span class="room-name">${room.locked ? "⌁ " : ""}${escapeHtml(room.name)}</span>
      <span class="room-small">${room.players}/2 · ${roomStatusLabel(room)}</span>
    `;
    btn.onclick = () => {
      selectedRoomCode = room.code;
      renderRoomBrowser();
    };
    list.appendChild(btn);
  }

  const room = roomDirectory.find(r => r.code === selectedRoomCode) || roomDirectory[0];
  if (!room) return;

  const canJoin = room.status === "waiting" && room.players < 2;
  details.innerHTML = `
    <div class="detail-title-row">
      <div>
        <span class="section-label">ROOM</span>
        <h2>${escapeHtml(room.name)}</h2>
      </div>
      <span class="player-count">${room.players}/2</span>
    </div>

    <div class="detail-lines">
      <div>코드: <strong>${escapeHtml(room.code)}</strong></div>
      <div>상태: ${roomStatusLabel(room)}</div>
      <div>${room.locked ? "비밀번호가 필요한 방" : "공개방"}</div>
    </div>

    <div class="detail-password">
      ${room.locked ? `
        <label for="joinPassword">비밀번호</label>
        <input id="joinPassword" type="password" placeholder="비밀번호 입력">
      ` : ""}
      <button id="joinSelectedRoom" class="join-selected primary-button" ${canJoin ? "" : "disabled"}>
        ${canJoin ? "입장" : "입장 불가"}
      </button>
    </div>
  `;

  $("#joinSelectedRoom").onclick = async () => {
    const password = room.locked ? ($("#joinPassword")?.value || "") : "";
    await sendMessage({type: "join_room", room: room.code, password});
  };

  if (room.locked) {
    $("#joinPassword").addEventListener("keydown", e => {
      if (e.key === "Enter") $("#joinSelectedRoom").click();
    });
  }
}

// ---------- 대기실 ----------
$("#leaveRoom").onclick = () => sendMessage({type: "leave_room"});
$("#readyButton").onclick = () => sendMessage({type: "toggle_ready"});

function renderWaitingRoom() {
  const s = currentRoomSnapshot;
  if (!s) return;

  $("#waitingRoomName").textContent = s.name;
  $("#waitingRoomCode").textContent = `방 코드 ${s.code}${s.locked ? " · 비밀번호방" : ""}`;

  const box = $("#waitingPlayers");
  box.innerHTML = "";

  for (let slot = 1; slot <= 2; slot++) {
    const p = s.players.find(x => x.slot === slot);
    const row = document.createElement("div");
    row.className = "waiting-player" + (p ? "" : " empty");

    row.innerHTML = p ? `
      <div>
        <div class="player-title">Player ${slot}</div>
        <div class="player-sub">${p.host ? "HOST · " : ""}${p.color === "white" ? "백" : "흑"}${p.color === myColor ? " · YOU" : ""}</div>
      </div>
      <div class="ready-state ${p.ready ? "ready" : ""}">
        ${p.ready ? "준비됨" : "대기 중"}
      </div>
    ` : `
      <div>
        <div class="player-title">Player ${slot}</div>
        <div class="player-sub">EMPTY</div>
      </div>
      <div class="ready-state">비어 있음</div>
    `;
    box.appendChild(row);
  }

  const me = s.players.find(p => p.color === myColor);
  $("#readyButton").textContent = me?.ready ? "준비 취소" : "준비";
  $("#readyButton").disabled = s.players.length < 2;
  $("#waitingHint").textContent =
    s.players.length < 2 ? "상대 입장을 기다리는 중…" :
    s.players.every(p => p.ready) ? "기물 선택으로 이동 중…" :
    "두 플레이어가 준비하면 기물 선택 시작.";
}

// ---------- 기물 선택 ----------
function showLoadout(local = false) {
  showScreen("loadout");
  const box = $("#loadoutChoices");
  box.innerHTML = "";
  chosenLoadout.clear();

  $("#roomInfo").textContent = local
    ? "로컬 테스트"
    : `${currentRoomSnapshot?.name || "방"} · ${roomCode}`;

  for (const [id, label] of LOADOUTS) {
    const b = document.createElement("button");
    b.className = "loadout-card";
    b.dataset.id = id;
    b.innerHTML = `<strong>${label}</strong>${id === "necromancer" ? "<small>세부 구현 예정</small>" : ""}`;

    b.onclick = () => {
      if (chosenLoadout.has(id)) chosenLoadout.delete(id);
      else if (chosenLoadout.size < 6) chosenLoadout.add(id);
      else return toast("6개까지만 선택 가능.");
      refreshLoadout();
    };

    box.appendChild(b);
  }

  $("#readyLoadout").textContent = local ? "이 구성으로 시작" : "선택 완료";
  $("#readyLoadout").disabled = true;
  $("#waiting").textContent = "";
  refreshLoadout();
}

function refreshLoadout() {
  $$(".loadout-card").forEach(b => b.classList.toggle("selected", chosenLoadout.has(b.dataset.id)));
  $("#loadoutCount").textContent = `${chosenLoadout.size} / 6`;
  $("#readyLoadout").disabled = chosenLoadout.size !== 6;
}

$("#readyLoadout").onclick = () => {
  const items = [...chosenLoadout];

  if (localMode) {
    state = createInitialState({white: items, black: items});
    startGame();
    return;
  }

  socket.send(JSON.stringify({type: "loadout", items}));
  $("#readyLoadout").disabled = true;
  $("#waiting").textContent = "상대 선택 완료 대기 중…";
};

function updateLoadoutWaiting() {
  const s = currentRoomSnapshot;
  if (!s) return;
  const ready = s.players.filter(p => p.loadoutReady).length;
  $("#waiting").textContent = `선택 완료 ${ready}/2`;
}

// ---------- 로컬 ----------
$("#localTest").onclick = () => {
  localMode = true;
  myColor = "both";
  roomCode = "LOCAL";
  showLoadout(true);
};

// ---------- 게임 ----------
function startGame() {
  showScreen("game");
  ensureClockState();
  buildBoard();
  setupForgeDnD();
  startClockTicker();
  render();
}

function buildBoard() {
  boardEl.innerHTML = "";

  const rows = Array.from({length: SIZE}, (_, i) => i);
  const cols = Array.from({length: SIZE}, (_, i) => i);

  // 온라인에서 흑으로 들어온 플레이어는 일반 체스처럼 흑 진영이 아래에 오도록 180도 회전.
  if (!localMode && myColor === "black") {
    rows.reverse();
    cols.reverse();
    boardEl.dataset.perspective = "black";
  } else {
    boardEl.dataset.perspective = "white";
  }

  for (const r of rows) {
    for (const c of cols) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener("click", e => {
        if (Date.now() < suppressBoardClickUntil) return;
        cellClick(r, c, e);
      });
      boardEl.appendChild(cell);
    }
  }
}

function canControlTurn() {
  return localMode || myColor === state.turn;
}

function clearTransient() {
  closeActionChooser();
  selectedId = null;
  subAction = null;
  uiMode = null;
  forgeIds = [];
  pendingCraft = null;
}

function sendState() {
  if (!localMode && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({type: "state", state}));
  }
}

function finishTurn() {
  if (!state || state.winner) return;
  commitActiveClock();
  if (state.clocks[state.turn] <= 0) {
    finishByClock();
    return;
  }
  subAction = null;
  selectedId = null;
  uiMode = null;
  forgeIds = [];
  pendingCraft = null;
  endTurn(state);
  state.turnStartedAt = Date.now();
  sendState();
  render();
}

function ensureClockState() {
  if (!state) return;
  if (!state.clocks) state.clocks = {white:600000, black:600000};
  if (!Number.isFinite(state.clocks.white)) state.clocks.white = 600000;
  if (!Number.isFinite(state.clocks.black)) state.clocks.black = 600000;
  if (!Number.isFinite(state.turnStartedAt)) state.turnStartedAt = Date.now();
}

function displayedClockMs(color) {
  ensureClockState();
  let ms = state.clocks[color];
  if (!state.winner && state.turn === color) {
    ms -= Math.max(0, Date.now() - state.turnStartedAt);
  }
  return Math.max(0, ms);
}

function commitActiveClock() {
  ensureClockState();
  if (!state || state.winner) return;
  const color = state.turn;
  state.clocks[color] = displayedClockMs(color);
  state.turnStartedAt = Date.now();
}

function formatClock(ms) {
  ms = Math.max(0, ms);
  const totalSeconds = Math.ceil(ms / 1000);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  if (ms < 10000) {
    const tenth = Math.floor((ms % 1000) / 100);
    return `${min}:${String(sec).padStart(2,"0")}.${tenth}`;
  }
  return `${min}:${String(sec).padStart(2,"0")}`;
}

function updateClockUI() {
  if (!state || screens.game.classList.contains("hidden")) return;
  for (const color of ["white","black"]) {
    const el = document.querySelector(`[data-clock="${color}"]`);
    if (el) el.textContent = formatClock(displayedClockMs(color));
  }
  if (!state.winner && displayedClockMs(state.turn) <= 0 && canControlTurn()) {
    finishByClock();
  }
}

function finishByClock() {
  if (!state || state.winner) return;
  ensureClockState();
  const loser = state.turn;
  state.clocks[loser] = 0;
  state.winner = other(loser);
  state.log.push(`${loser === "white" ? "백" : "흑"} 시간 초과.`);
  sendState();
  render();
}

function startClockTicker() {
  if (clockTicker) clearInterval(clockTicker);
  clockTicker = setInterval(updateClockUI, 100);
}

function currentPiece() {
  return state?.pieces.find(p => p.id === selectedId) || null;
}


function allowedActionsFor(p) {
  if (!subAction || subAction.pieceId !== p.id) return {move:true, attack:true};
  const traits = effectiveTraits(state, p);
  if (traits.includes("breakthrough")) {
    return {move:!subAction.moved, attack:!subAction.attacked};
  }
  if (traits.includes("mobility")) {
    return {move:subAction.moved && !subAction.secondMove, attack:false};
  }
  return {move:false, attack:false};
}

function closeActionChooser() {
  const box = $("#actionChooser");
  box.classList.add("hidden");
  box.innerHTML = "";
}

function showActionChooser(event, choices) {
  const box = $("#actionChooser");
  box.innerHTML = "";
  for (const choice of choices) {
    const b = document.createElement("button");
    b.textContent = choice.label;
    b.addEventListener("click", e => {
      e.stopPropagation();
      closeActionChooser();
      choice.run();
    });
    box.appendChild(b);
  }
  box.style.left = `${Math.min(window.innerWidth - 150, Math.max(10, event.clientX + 8))}px`;
  box.style.top = `${Math.min(window.innerHeight - 70, Math.max(10, event.clientY + 8))}px`;
  box.classList.remove("hidden");
}

document.addEventListener("click", e => {
  if (!e.target.closest("#actionChooser")) closeActionChooser();
});

function executeMove(sel, r, c) {
  const res = movePiece(state, sel, r, c, state.turn);
  if (!res.ok) return toast(res.msg);
  handleActionContinuation(sel, "move");
}

function executeAttack(sel, r, c) {
  if (isOverwhelmed(state, sel)) return toast("압도: 공격 불가.");
  const res = attackPoint(state, sel, r, c, state.turn);
  if (!res.ok) return toast(res.msg);
  handleActionContinuation(sel, "attack");
}

function cellClick(r, c, event) {
  if (!state || state.winner || !canControlTurn()) return;
  closeActionChooser();

  if (pendingCraft) {
    if (canPlaceCraft(state, state.turn, pendingCraft, r, c)) {
      const res = placeCraft(state, state.turn, pendingCraft, r, c);
      if (res.ok) {
        consumePieces(state, forgeIds);
        finishTurn();
      }
    } else toast("여기에는 배치 못 함.");
    return;
  }

  if (uiMode === "harbor") {
    const res = installHarbor(state, state.turn, r, c);
    if (res.ok) finishTurn();
    else toast(res.msg);
    return;
  }

  const clicked = at(state, r, c);

  if (uiMode === "prince") {
    const res = appointPrince(state, clicked);
    if (res.ok) finishTurn();
    else toast(res.msg);
    return;
  }

  if (uiMode === "hypnosis") {
    const caster = currentPiece();
    const res = applyHypnosis(state, caster, clicked);
    if (res.ok) finishTurn();
    else toast(res.msg);
    return;
  }

  if (uiMode === "commandLast" || uiMode === "commandInd") {
    const cmd = currentPiece();
    const res = applyCommand(state, cmd, clicked, uiMode === "commandLast" ? "lastStand" : "indiscriminate");
    if (res.ok) {
      uiMode = null;
      render();
      sendState();
    } else toast(res.msg);
    return;
  }

  const sel = currentPiece();
  if (!sel) {
    if (clicked && canAct(state, clicked, state.turn)) {
      selectedId = clicked.id;
      subAction = null;
      render();
    }
    return;
  }

  if (clicked && clicked.id === sel.id) {
    if (subAction) return;
    selectedId = null;
    render();
    return;
  }

  const allowed = allowedActionsFor(sel);
  const legalMove = allowed.move && canMove(state, sel, r, c, state.turn);
  const legalAttack = allowed.attack && !isOverwhelmed(state, sel) && canAttackPoint(state, sel, r, c, state.turn);

  if (legalMove && legalAttack) {
    showActionChooser(event, [
      {label:"이동", run:()=>executeMove(sel,r,c)},
      {label:"공격", run:()=>executeAttack(sel,r,c)},
    ]);
    return;
  }
  if (legalAttack) return executeAttack(sel, r, c);
  if (legalMove) return executeMove(sel, r, c);

  // 공격할 수 없는 자기 기물을 누르면 선택 전환.
  if (clicked && canAct(state, clicked, state.turn) && !subAction) {
    selectedId = clicked.id;
    render();
  }
}

function handleActionContinuation(piece, kind) {
  const still = state.pieces.find(p => p.id === piece.id);
  if (!still) return finishTurn();

  const traits = effectiveTraits(state, still);

  if (traits.includes("breakthrough")) {
    subAction = subAction || {pieceId:still.id, moved:false, attacked:false};
    if (kind === "move") subAction.moved = true;
    if (kind === "attack") subAction.attacked = true;
    if (subAction.moved && subAction.attacked) return finishTurn();
    selectedId = still.id;
    render();
    sendState();
    return;
  }

  if (traits.includes("mobility") && kind === "move") {
    if (!subAction) {
      subAction = {pieceId:still.id, moved:true, secondMove:false};
      selectedId = still.id;
      render();
      sendState();
      return;
    }
    if (subAction.pieceId === still.id && !subAction.secondMove) {
      subAction.secondMove = true;
      return finishTurn();
    }
  }

  finishTurn();
}

$("#endAction").onclick = () => {
  if (state && subAction && canControlTurn()) finishTurn();
};

$("#forgeFocusButton").onclick = () => {
  if (!state) return;
  $(".forge-box").scrollIntoView({behavior: "smooth", block: "center"});
};


function setupForgeDnD() {
  const box = $("#forgeSlots");
  if (!box || box.dataset.dndReady) return;
  box.dataset.dndReady = "1";
  // 데스크톱 HTML5 drop도 백업으로 유지.
  box.addEventListener("dragover", e => {
    e.preventDefault();
    box.classList.add("drag-over");
  });
  box.addEventListener("dragleave", e => {
    if (!box.contains(e.relatedTarget)) box.classList.remove("drag-over");
  });
  box.addEventListener("drop", e => {
    e.preventDefault();
    box.classList.remove("drag-over");
    const id = e.dataTransfer?.getData("text/plain");
    if (id) addPieceToForge(id);
  });
}

function beginPiecePointerDrag(e, piece, chip) {
  if (!canControlTurn() || piece.controller !== state.turn) return;
  if (e.button !== undefined && e.button !== 0) return;
  pieceDrag = {
    id: piece.id,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    active: false,
    ghost: null,
  };
  try { chip.setPointerCapture(e.pointerId); } catch {}
}

function movePiecePointerDrag(e) {
  if (!pieceDrag || e.pointerId !== pieceDrag.pointerId) return;
  const dx = e.clientX - pieceDrag.startX;
  const dy = e.clientY - pieceDrag.startY;
  if (!pieceDrag.active && Math.hypot(dx,dy) > 6) {
    pieceDrag.active = true;
    const p = state.pieces.find(x => x.id === pieceDrag.id);
    if (!p) return;
    const ghost = document.createElement("div");
    ghost.className = `drag-ghost ${p.controller}`;
    ghost.innerHTML = pieceArt(p.type);
    document.body.appendChild(ghost);
    pieceDrag.ghost = ghost;
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
    document.body.classList.add("piece-dragging");
    $("#forgeSlots")?.classList.add("drag-ready");
  }
  if (pieceDrag.active && pieceDrag.ghost) {
    pieceDrag.ghost.style.left = `${e.clientX}px`;
    pieceDrag.ghost.style.top = `${e.clientY}px`;
    const target = document.elementFromPoint(e.clientX,e.clientY);
    $("#forgeSlots")?.classList.toggle("drag-over", !!target?.closest("#forgeSlots"));
    e.preventDefault();
  }
}

function endPiecePointerDrag(e) {
  if (!pieceDrag || e.pointerId !== pieceDrag.pointerId) return;
  const drag = pieceDrag;
  pieceDrag = null;
  if (drag.active) {
    const target = document.elementFromPoint(e.clientX,e.clientY);
    if (target?.closest("#forgeSlots")) addPieceToForge(drag.id);
    suppressBoardClickUntil = Date.now() + 180;
    e.preventDefault();
    e.stopPropagation();
  }
  drag.ghost?.remove();
  document.body.classList.remove("piece-dragging");
  $("#forgeSlots")?.classList.remove("drag-over","drag-ready");
}

// 드래그 중 포인터가 원래 기물 밖으로 나가도 계속 추적한다.
window.addEventListener("pointermove", movePiecePointerDrag, {passive:false});
window.addEventListener("pointerup", endPiecePointerDrag, {passive:false});
window.addEventListener("pointercancel", endPiecePointerDrag, {passive:false});

function addPieceToForge(id) {
  if (!state || !canControlTurn()) return;
  const p = state.pieces.find(x => x.id === id);
  if (!p || p.controller !== state.turn) return toast("현재 자기 기물만 연성대에 넣을 수 있음.");
  if (forgeIds.includes(id)) return toast("이미 연성대에 있음.");
  if (forgeIds.length >= 9) return toast("연성대가 가득 참.");
  forgeIds.push(id);
  pendingCraft = null;
  render();
}

$("#forgeReset").onclick = () => {
  forgeIds = [];
  pendingCraft = null;
  render();
};

$("#forgeCraft").onclick = () => {
  if (!state || !forgeIds.length) return;

  const pieces = forgeIds.map(id => state.pieces.find(p => p.id === id)).filter(Boolean);
  if (pieces.some(p => p.controller !== state.turn)) return toast("자기 기물만 재료 가능.");

  const rec = recipeFor(
    pieces.map(p => p.type),
    state.loadouts[state.turn] || []
  );

  if (!rec) return toast("가능한 조합이 아님.");

  pendingCraft = rec.result;
  toast(`${PIECES[rec.result].name} 배치 위치를 선택.`);
  render();
};

$("#harborMode").onclick = () => {
  if (!state || !canControlTurn()) return;
  if (!state.loadouts[state.turn]?.includes("fleet_tree")) return toast("함대류를 선택하지 않음.");
  if (state.portsPlaced[state.turn] >= 3) return toast("항구는 최대 3개.");

  uiMode = "harbor";
  render();
};

$("#princeMode").onclick = () => {
  if (!state || !canControlTurn()) return;
  if (!canAppointPrince(state, state.turn)) return toast("왕 사망 후 4턴이 지나야 함.");

  uiMode = "prince";
  render();
};

$("#resignButton").onclick = () => {
  if (!state || state.winner) return;
  const loser = localMode ? state.turn : myColor;
  if (!loser) return;

  if (!confirm("정말 기권할까?")) return;
  state.winner = other(loser);
  state.log.push(`${loser === "white" ? "백" : "흑"} 기권.`);
  sendState();
  render();
};

function render() {
  if (!state) return;

  const viewer = localMode ? state.turn : myColor;
const selected = currentPiece();

  $$(".cell").forEach(cell => {
    const r = +cell.dataset.r;
    const c = +cell.dataset.c;
    const tileClass = isLand(r,c) ? `land ${(r+c)%2===0 ? "land-light" : "land-dark"}` : "sea";
    cell.className = `cell ${tileClass} terr-${state.territory[key(r,c)]}`;
    cell.innerHTML = "";

    const h = harborAt(state, r, c);
    if (h) {
      const port = document.createElement("span");
      port.className = `harbor ${h.color}`;
      port.innerHTML = harborArt();
      port.title = "항구";
      cell.appendChild(port);
    }

    const p = at(state, r, c);
    if (p && isVisibleTo(state, p, viewer)) {
      const chip = document.createElement("span");
      chip.className = `piece ${p.controller} ${p.prince ? "prince" : ""}`;
      chip.innerHTML = pieceArt(p.type);
      if (p.prince) {
        const crown = document.createElement("span");
        crown.className = "prince-crown";
        crown.innerHTML = princeCrownArt();
        chip.appendChild(crown);
      }
      chip.title = `${PIECES[p.type].name}${p.prince ? " · 왕자" : ""} HP ${p.hp}`;
      const draggable = canControlTurn() && p.controller === state.turn;
      chip.draggable = false;
      if (draggable) {
        chip.addEventListener("pointerdown", e => beginPiecePointerDrag(e,p,chip));
      }
      cell.appendChild(chip);

      if (p.hp !== maxHp(p, state)) {
        const hp = document.createElement("small");
        hp.className = "hp";
        hp.textContent = p.hp;
        cell.appendChild(hp);
      }
    }

    if (selected && selected.id === p?.id) cell.classList.add("selected-piece");
    if (forgeIds.includes(p?.id)) cell.classList.add("forge-selected");

    if (selected && !uiMode && canControlTurn()) {
      const allowed = allowedActionsFor(selected);
      const lm = allowed.move && canMove(state, selected, r, c, state.turn);
      const la = allowed.attack && !isOverwhelmed(state, selected) && canAttackPoint(state, selected, r, c, state.turn);
      if (lm && la) cell.classList.add("legal-both");
      else if (lm) cell.classList.add("legal-move");
      else if (la) cell.classList.add("legal-attack");
    }

    if (uiMode === "harbor" && canInstallHarbor(state, state.turn, r, c)) {
      cell.classList.add("legal-harbor");
    }
    if (pendingCraft && canPlaceCraft(state, state.turn, pendingCraft, r, c)) {
      cell.classList.add("legal-craft");
    }
  });
  $("#endAction").classList.toggle("hidden", !subAction);
$("#harborCount").textContent = `${state.portsPlaced[state.turn]}/3`;

  renderPlayers();
  renderSide(selected);
  renderForge();
  updateClockUI();
}

function renderPlayers() {
  const box = $("#gamePlayers");

  const statusFor = color => {
    if (state.winner) return state.winner === color ? "WIN" : "LOSE";
    return state.turn === color ? "TURN" : "";
  };

  box.innerHTML = `
    <div class="game-player-card ${state.turn === "white" && !state.winner ? "turn" : ""}">
      <div class="player-line"><span>Player 1</span><span>백 · ${statusFor("white")}</span></div>
      <div class="game-clock" id="whiteClock">${formatClock(clockRemaining("white"))}</div>
    </div>
    <div class="game-player-card ${state.turn === "black" && !state.winner ? "turn" : ""}">
      <div class="player-line"><span>Player 2</span><span>흑 · ${statusFor("black")}</span></div>
      <div class="game-clock" id="blackClock">${formatClock(clockRemaining("black"))}</div>
    </div>
  `;
}

function renderSide(p) {
  if (!p) {
    sideEl.innerHTML = `<div class="rail-title">기물</div><p class="muted">기물을 클릭하면 정보가 표시됨.</p>`;
    return;
  }

  const d = pieceDef(p);
  const confused = isConfused(state, p);
  const tr = confused ? ["혼란"] : traitNames(effectiveTraits(state, p));

  sideEl.innerHTML = `
    <h3>${d.name}${p.prince ? " · 왕자" : ""}</h3>
    <div class="statrow"><span>체력</span><b>${p.hp} / ${maxHp(p,state)}</b></div>
    <div class="statrow"><span>공격력</span><b>${attackPower(state,p)}</b></div>
    <div class="tags">${tr.length ? tr.map(x => `<span>${x}</span>`).join("") : "<span>특성 없음</span>"}</div>
    <p class="muted">${p.synthetic ? "합성 기물" : "기본 기물"} · ${d.naval ? "해상" : "지상"}</p>
    ${p.cooldownUntilOwnTurn > state.ownTurns[p.color] ? `<p class="danger">폭주 쿨다운</p>` : ""}
    ${isOverwhelmed(state,p) ? `<p class="danger">압도: 공격 불가</p>` : ""}
    <div id="abilityButtons"></div>
  `;

  const ab = $("#abilityButtons");

  if (p.type === "hypnotist" && p.controller === state.turn && !confused) {
    const b = document.createElement("button");
    b.textContent = "최면 사용";
    b.onclick = () => { uiMode = "hypnosis"; render(); };
    ab.appendChild(b);
  }

  if (p.type === "commander" && p.controller === state.turn && !confused) {
    const a = document.createElement("button");
    a.textContent = "최후의 저항";
    a.onclick = () => { uiMode = "commandLast"; render(); };

    const b = document.createElement("button");
    b.textContent = "무차별 공격";
    b.onclick = () => { uiMode = "commandInd"; render(); };

    ab.append(a, b);
  }
}


function renderForge() {
  const selectedPieces = forgeIds
    .map(id => state.pieces.find(p => p.id === id))
    .filter(Boolean);

  // 죽었거나 보드에서 사라진 재료는 자동 제거
  forgeIds = selectedPieces.map(p => p.id);

  const names = selectedPieces.map(p => PIECES[p.type].name);
  $("#forgeItems").textContent = names.length ? names.join(" + ") : "기물을 보드에서 이곳으로 드래그";

  const rec = recipeFor(selectedPieces.map(p => p.type), state.loadouts[state.turn] || []);

  $("#forgeResult").textContent = pendingCraft
    ? `배치 대기: ${PIECES[pendingCraft].name}`
    : rec ? `결과: ${PIECES[rec.result].name}` : "결과: -";

  const out = $("#forgeOutput");
  out.innerHTML = pendingCraft
    ? pieceArt(pendingCraft)
    : rec ? pieceArt(rec.result) : "?";

  const slots = $$("#forgeSlots > div");
  slots.forEach((slot, i) => {
    slot.innerHTML = "";
    slot.classList.toggle("filled", i < selectedPieces.length);
    slot.classList.add("drop-ready");
    const p = selectedPieces[i];
    if (!p) return;
    const icon = document.createElement("span");
    icon.className = `forge-slot-piece ${p.controller}`;
    icon.innerHTML = pieceArt(p.type);
    icon.title = `${PIECES[p.type].name} · 클릭하면 연성대에서 제거`;
    icon.addEventListener("click", e => {
      e.stopPropagation();
      forgeIds = forgeIds.filter(id => id !== p.id);
      pendingCraft = null;
      render();
    });
    slot.appendChild(icon);
  });

  $("#forgeCraft").disabled = !rec || !!pendingCraft;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

showScreen("main");
ensureSocket().catch(() => setNetworkText("오프라인"));
