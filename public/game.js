// 개잼체스 1.0 Alpha - 단일 game.js 버전

// ===== 기물/특성/조합 정의 =====
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

// ===== UI / 네트워크 클라이언트 =====

