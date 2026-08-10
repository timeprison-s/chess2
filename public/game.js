let socket = null;

let myColor = null;
let roomCode = null;

let boardState = null;
let currentTurn = "white";

let selected = null;

let gameEnded = false;

let moves = [];

let time = {
    white: 600,
    black: 600
};


/* =====================================================
   연결
===================================================== */

function connect() {

    /*
     * 현재 페이지를 연 서버와
     * 같은 주소로 WebSocket 연결.
     */
    const protocol =
        location.protocol === "https:"
            ? "wss:"
            : "ws:";

    socket =
        new WebSocket(
            protocol +
            "//" +
            location.host
        );


    socket.onopen = () => {

        document.getElementById(
            "connectionStatus"
        ).textContent =
            "서버 연결 완료";

        document.getElementById(
            "joinButton"
        ).disabled = false;
    };


    socket.onmessage = event => {

        const msg =
            JSON.parse(event.data);


        if (msg.type === "joined") {

            myColor =
                msg.color;

            roomCode =
                msg.room;

            document.getElementById(
                "lobby"
            ).classList.add("hidden");

            document.getElementById(
                "game"
            ).classList.remove("hidden");

            document.getElementById(
                "roomInfo"
            ).textContent =
                "ROOM: " +
                roomCode +
                " / YOU: " +
                myColor.toUpperCase();

            return;
        }


        if (msg.type === "state") {

            const previousSelected =
                selected;

            boardState =
                msg.board;

            currentTurn =
                msg.currentTurn;

            moves =
                msg.moves;

            time =
                msg.time;

            gameEnded =
                msg.gameEnded;

            /*
             * 타이머 갱신 등으로 인한
             * state 메시지에서는 선택을
             * 유지한다. 선택했던 칸의
             * 기물이 사라졌거나 더 이상
             * 내 기물이 아니면(=실제로
             * 이동/포획이 일어난 경우)만
             * 선택을 해제한다.
             */
            if (
                previousSelected &&
                boardState[previousSelected.r][previousSelected.c] &&
                boardState[previousSelected.r][previousSelected.c].color === myColor
            ) {

                selected =
                    previousSelected;
            }

            else {

                selected = null;
            }

            drawBoard();
            renderMoves();
            updateUI();
	

            return;
        }


        if (msg.type === "error") {

            alert(msg.message);

            return;
        }
    };


    socket.onclose = () => {

        document.getElementById(
            "connectionStatus"
        ).textContent =
            "서버 연결 끊김";
    };
}


/* =====================================================
   방 입장
===================================================== */

document.getElementById(
    "joinButton"
).addEventListener(
    "click",
    joinRoom
);


document.getElementById(
    "roomInput"
).addEventListener(
    "keydown",
    e => {

        if (e.key === "Enter") {
            joinRoom();
        }
    }
);


function joinRoom() {

    const code =
        document.getElementById(
            "roomInput"
        ).value.trim();


    if (!code) {

        alert(
            "방 코드를 입력해라."
        );

        return;
    }


    if (
        !socket ||
        socket.readyState !== WebSocket.OPEN
    ) {

        alert(
            "서버에 연결되지 않았다."
        );

        return;
    }


    socket.send(
        JSON.stringify({
            type: "join",
            room: code
        })
    );
}


/* =====================================================
   서버 액션
===================================================== */

function sendAction(action) {

    if (
        !socket ||
        socket.readyState !== WebSocket.OPEN
    ) {
        return;
    }

    socket.send(
        JSON.stringify({
            type: "action",
            action
        })
    );
}


/* =====================================================
   좌표
===================================================== */

function squareName(r,c) {
    return "abcdefgh"[c] + (8-r);
}


function inside(r,c) {
    return (
        r >= 0 &&
        r < 8 &&
        c >= 0 &&
        c < 8
    );
}


/* =====================================================
   클라이언트 표시용 이동 판정
===================================================== */

function clearPath(fr,fc,tr,tc) {

    const dr =
        Math.sign(tr-fr);

    const dc =
        Math.sign(tc-fc);

    let r =
        fr + dr;

    let c =
        fc + dc;


    while (
        r !== tr ||
        c !== tc
    ) {

        if (boardState[r][c]) {
            return false;
        }

        r += dr;
        c += dc;
    }

    return true;
}


function canMove(fr,fc,tr,tc) {

    const p =
        boardState[fr][fc];

    const target =
        boardState[tr][tc];


    if (!p) return false;

    if (
        target &&
        target.color === p.color
    ) {
        return false;
    }


    if (
        p.type === "pawn" &&
        p.gun
    ) {
        return false;
    }


    if (
        p.type === "turret"
    ) {
        return false;
    }


    const dr =
        Math.abs(tr-fr);

    const dc =
        Math.abs(tc-fc);


    if (
        p.type === "pawn" ||
        p.type === "king"
    ) {

        return (
            dr <= 1 &&
            dc <= 1 &&
            !(dr === 0 && dc === 0)
        );
    }


    if (
        p.type === "knight"
    ) {

        return (
            (dr === 2 && dc === 1) ||
            (dr === 1 && dc === 2)
        );
    }


    if (
        p.type === "rook"
    ) {

        if (
            fr !== tr &&
            fc !== tc
        ) {
            return false;
        }

        return clearPath(
            fr,fc,tr,tc
        );
    }


    if (
        p.type === "bishop"
    ) {

        if (dr !== dc) {
            return false;
        }

        return clearPath(
            fr,fc,tr,tc
        );
    }


    if (
        p.type === "queen"
    ) {

        if (
            fr !== tr &&
            fc !== tc &&
            dr !== dc
        ) {
            return false;
        }

        return clearPath(
            fr,fc,tr,tc
        );
    }


    if (
        p.type === "wildHorse"
    ) {

        return (
            dr <= 2 &&
            dc <= 2 &&
            !(dr === 0 && dc === 0)
        );
    }


    if (
        p.type === "cavalry"
    ) {

        return (
            (
                fr === tr ||
                fc === tc
            ) &&
            !(dr === 0 && dc === 0)
        );
    }


    if (
        p.type === "necromancer"
    ) {

        if (
            dr === dc &&
            dr !== 0
        ) {

            return clearPath(
                fr,fc,tr,tc
            );
        }

        return (
            dr <= 1 &&
            dc <= 1 &&
            !(dr === 0 && dc === 0)
        );
    }


    return false;
}


/* =====================================================
   이동 목록
===================================================== */

function getMoves(r,c) {

    const result = [];

    for (
        let tr=0;
        tr<8;
        tr++
    ) {

        for (
            let tc=0;
            tc<8;
            tc++
        ) {

            if (
                canMove(
                    r,c,tr,tc
                )
            ) {

                result.push({
                    r: tr,
                    c: tc
                });
            }
        }
    }

    return result;
}


/* =====================================================
   총 공격
===================================================== */

function getGunTargets(r,c) {

    const p =
        boardState[r][c];

    if (
        !p ||
        !p.gun
    ) {
        return [];
    }


    const result = [];


    for (
        let tr=r-3;
        tr<=r+3;
        tr++
    ) {

        for (
            let tc=c-3;
            tc<=c+3;
            tc++
        ) {

            if (!inside(tr,tc)) {
                continue;
            }

            if (
                tr === r &&
                tc === c
            ) {
                continue;
            }

            const target =
                boardState[tr][tc];

            if (
                target &&
                target.color !== p.color
            ) {

                result.push({
                    r: tr,
                    c: tc
                });
            }
        }
    }

    return result;
}


/* =====================================================
   포탑 공격
===================================================== */

function getTurretTargets(r,c) {

    const p =
        boardState[r][c];

    if (
        !p ||
        p.type !== "turret" ||
        p.turretDisabled ||
        p.ammo <= 0
    ) {
        return [];
    }


    const result = [];


    for (
        let tr=0;
        tr<8;
        tr++
    ) {

        for (
            let tc=0;
            tc<8;
            tc++
        ) {

            const target =
                boardState[tr][tc];

            if (!target) {
                continue;
            }

            if (
                target.color === p.color
            ) {
                continue;
            }

            if (
                target.type === "king"
            ) {
                continue;
            }

            result.push({
                r: tr,
                c: tc
            });
        }
    }

    return result;
}


/* =====================================================
   합체
===================================================== */

function getCombinationTargets(r,c) {

    const p =
        boardState[r][c];

    if (!p) {
        return [];
    }


    const result = [];


    for (
        let tr=0;
        tr<8;
        tr++
    ) {

        for (
            let tc=0;
            tc<8;
            tc++
        ) {

            if (
                tr === r &&
                tc === c
            ) {
                continue;
            }


            const q =
                boardState[tr][tc];


            if (
                !q ||
                q.color !== p.color
            ) {
                continue;
            }


            if (
                p.type === "knight" &&
                q.type === "knight"
            ) {

                result.push({
                    r: tr,
                    c: tc
                });
            }


            if (
                p.type === "bishop" &&
                q.type === "bishop"
            ) {

                result.push({
                    r: tr,
                    c: tc
                });
            }


            if (
                (
                    p.type === "pawn" &&
                    q.type === "rook"
                ) ||
                (
                    p.type === "rook" &&
                    q.type === "pawn"
                )
            ) {

                if (
                    !p.gun &&
                    !q.gun
                ) {

                    result.push({
                        r: tr,
                        c: tc
                    });
                }
            }


            if (
                (
                    p.type === "pawn" &&
                    q.type === "knight"
                ) ||
                (
                    p.type === "knight" &&
                    q.type === "pawn"
                )
            ) {

                if (
                    !p.gun &&
                    !q.gun
                ) {

                    result.push({
                        r: tr,
                        c: tc
                    });
                }
            }
        }
    }

    return result;
}


/* =====================================================
   부활
===================================================== */

function getResurrectionTargets(r,c) {

    const p =
        boardState[r][c];

    /*
     * 현재 클라이언트에는 deadPieces를
     * 서버가 보내지 않기 때문에
     * 부활 가능 여부는 서버에서 판정한다.
     *
     * UI에서는 죽은 말의 위치를 알 수 없으므로
     * 여기서는 부활 기능을 위해
     * 별도 표시 데이터를 추가하는 단계에서 확장 가능.
     */
    return [];
}


/* =====================================================
   보드 렌더링
===================================================== */

function drawBoard() {

    const board =
        document.getElementById(
            "board"
        );


    board.innerHTML = "";


    if (!boardState) {
        return;
    }


    let possibleMoves = [];
    let gunTargets = [];
    let turretTargets = [];
    let combinations = [];


    if (
        selected &&
        currentTurn === myColor
    ) {

        possibleMoves =
            getMoves(
                selected.r,
                selected.c
            );


        gunTargets =
            getGunTargets(
                selected.r,
                selected.c
            );


        turretTargets =
            getTurretTargets(
                selected.r,
                selected.c
            );


        combinations =
            getCombinationTargets(
                selected.r,
                selected.c
            );
    }


    for (
        let displayR=0;
        displayR<8;
        displayR++
    ) {

        for (
            let displayC=0;
            displayC<8;
            displayC++
        ) {

            /*
             * 흑으로 입장한 경우
             * 보드를 180도 뒤집어서 표시.
             * (실제 좌표 r,c는 그대로 두고
             *  화면에 그리는 순서만 반전)
             */
            const r =
                myColor === "black"
                    ? 7 - displayR
                    : displayR;

            const c =
                myColor === "black"
                    ? 7 - displayC
                    : displayC;

            const square =
                document.createElement(
                    "div"
                );


            square.className =
                "square " +
                (
                    (r+c)%2 === 0
                        ? "light"
                        : "dark"
                );


            const p =
                boardState[r][c];


            if (p) {

                let element;


                /*
                 * 총 든 폰
                 */
                if (
                    p.type === "pawn" &&
                    p.gun
                ) {

                    element =
                        document.createElement(
                            "div"
                        );

                    element.className =
                        "gun-pawn " +
                        (
                            p.color === "white"
                                ? "white-gun"
                                : "black-gun"
                        );
                }


                /*
                 * 야생마
                 */
                else if (
                    p.type === "wildHorse"
                ) {

                    element =
                        document.createElement(
                            "span"
                        );

                    element.className =
                        "special wildhorse";

                    element.textContent =
                        p.color === "white"
                            ? "♘"
                            : "♞";
                }


                /*
                 * 네크로맨서
                 */
                else if (
                    p.type === "necromancer"
                ) {

                    element =
                        document.createElement(
                            "span"
                        );

                    element.className =
                        "special necromancer";

                    element.textContent =
                        p.color === "white"
                            ? "♗"
                            : "♝";
                }


                /*
                 * 기병
                 */
                else if (
                    p.type === "cavalry"
                ) {

                    element =
                        document.createElement(
                            "span"
                        );

                    element.className =
                        "special cavalry";

                    element.textContent =
                        p.color === "white"
                            ? "♘"
                            : "♞";
                }


                /*
                 * 포탑
                 */
                else if (
                    p.type === "turret"
                ) {

                    element =
                        document.createElement(
                            "span"
                        );

                    element.className =
                        "turret";


                    if (
                        p.turretDisabled
                    ) {

                        element.classList.add(
                            "turret-disabled"
                        );
                    }


                    const symbol =
                        document.createElement(
                            "span"
                        );

                    symbol.className =
                        "turret-symbol";

                    symbol.textContent =
                        p.symbol;


                    const ammo =
                        document.createElement(
                            "span"
                        );

                    ammo.className =
                        "ammo";

                    ammo.textContent =
                        p.ammo +
                        "/" +
                        p.maxAmmo;


                    element.appendChild(
                        symbol
                    );

                    element.appendChild(
                        ammo
                    );
                }


                /*
                 * 일반 기물
                 */
                else {

                    element =
                        document.createElement(
                            "span"
                        );

                    element.textContent =
                        p.symbol;
                }


                element.classList.add(
                    p.color === "white"
                        ? "white-piece"
                        : "black-piece"
                );


                square.appendChild(
                    element
                );
            }


            /*
             * 선택
             */
            if (
                selected &&
                selected.r === r &&
                selected.c === c
            ) {

                square.classList.add(
                    "selected"
                );
            }


            /*
             * 이동
             */
            if (
                possibleMoves.some(
                    x =>
                        x.r === r &&
                        x.c === c
                )
            ) {

                square.classList.add(
                    "possible"
                );

                square.classList.add(
                    boardState[r][c]
                        ? "capture"
                        : "empty"
                );
            }


            /*
             * 총
             */
            if (
                gunTargets.some(
                    x =>
                        x.r === r &&
                        x.c === c
                )
            ) {

                square.classList.add(
                    "attack"
                );
            }


            /*
             * 포탑
             */
            if (
                turretTargets.some(
                    x =>
                        x.r === r &&
                        x.c === c
                )
            ) {

                square.classList.add(
                    "attack"
                );
            }


            /*
             * 합체
             */
            if (
                combinations.some(
                    x =>
                        x.r === r &&
                        x.c === c
                )
            ) {

                square.classList.add(
                    "combine"
                );
            }


            square.addEventListener(
                "click",
                () => {

                    handleSquareClick(
                        r,c
                    );
                }
            );


            board.appendChild(
                square
            );
        }
    }
}


/* =====================================================
   클릭
===================================================== */

function handleSquareClick(r,c) {

    if (
        gameEnded ||
        currentTurn !== myColor
    ) {
        return;
    }


    const p =
        boardState[r][c];


    /*
     * 선택 없음
     */
    if (!selected) {

        if (
            !p ||
            p.color !== myColor
        ) {
            return;
        }


        selected = {
            r,
            c
        };


        drawBoard();

        return;
    }


    const fr =
        selected.r;

    const fc =
        selected.c;


    const selectedPiece =
        boardState[fr][fc];


    /*
     * 같은 칸
     */
    if (
        fr === r &&
        fc === c
    ) {

        selected = null;

        drawBoard();

        return;
    }


    /*
     * 총
     */
    if (
        selectedPiece &&
        selectedPiece.gun
    ) {

        const targets =
            getGunTargets(
                fr,fc
            );


        if (
            targets.some(
                x =>
                    x.r === r &&
                    x.c === c
            )
        ) {

            sendAction({
                type: "gunAttack",

                fr,
                fc,
                tr: r,
                tc: c
            });

            selected = null;

            return;
        }
    }


    /*
     * 포탑
     */
    if (
        selectedPiece &&
        selectedPiece.type === "turret"
    ) {

        const targets =
            getTurretTargets(
                fr,fc
            );


        if (
            targets.some(
                x =>
                    x.r === r &&
                    x.c === c
            )
        ) {

            sendAction({
                type: "turretAttack",

                fr,
                fc,
                tr: r,
                tc: c
            });

            selected = null;

            return;
        }
    }


    /*
     * 합체
     */
    const combinations =
        getCombinationTargets(
            fr,
            fc
        );


    if (
        combinations.some(
            x =>
                x.r === r &&
                x.c === c
        )
    ) {

        sendAction({
            type: "combine",

            fr,
            fc,
            tr: r,
            tc: c
        });

        selected = null;

        return;
    }


    /*
     * 일반 이동
     */
    if (
        canMove(
            fr,
            fc,
            r,
            c
        )
    ) {

        sendAction({
            type: "move",

            fr,
            fc,
            tr: r,
            tc: c
        });

        selected = null;

        return;
    }


    /*
     * 다른 내 기물 선택
     */
    if (
        p &&
        p.color === myColor
    ) {

        selected = {
            r,
            c
        };

        drawBoard();
    }
}


/* =====================================================
   G = 총 장착
===================================================== */

document.addEventListener(
    "keydown",
    e => {

        if (
            e.key.toLowerCase() !== "g"
        ) {
            return;
        }


        if (
            !selected ||
            currentTurn !== myColor
        ) {
            return;
        }


        const p =
            boardState[
                selected.r
            ][
                selected.c
            ];


        if (
            !p ||
            p.type !== "pawn" ||
            p.color !== myColor ||
            p.gun
        ) {
            return;
        }


        sendAction({
            type: "gun",

            r: selected.r,
            c: selected.c
        });


        selected = null;
    }
);


/* =====================================================
   기보
===================================================== */

function renderMoves() {

    const list =
        document.getElementById(
            "moveList"
        );


    list.innerHTML = "";


    for (
        let i=0;
        i<moves.length;
        i+=2
    ) {

        const row =
            document.createElement(
                "div"
            );

        row.className = "move";


        const number =
            document.createElement(
                "span"
            );

        number.textContent =
            (i/2 + 1) + ". ";


        const white =
            document.createElement(
                "span"
            );

        white.textContent =
            moves[i] || "";


        const black =
            document.createElement(
                "span"
            );

        black.textContent =
            moves[i+1]
                ? " " + moves[i+1]
                : "";


        row.appendChild(number);
        row.appendChild(white);
        row.appendChild(black);


        list.appendChild(row);
    }


    list.scrollTop =
        list.scrollHeight;
}


/* =====================================================
   UI
===================================================== */

function formatTime(seconds) {

    const min =
        Math.floor(seconds / 60);

    const sec =
        seconds % 60;


    return (
        String(min)
            .padStart(2,"0") +
        ":" +
        String(sec)
            .padStart(2,"0")
    );
}


function updateUI() {

    document.getElementById(
        "whiteTimer"
    ).textContent =
        formatTime(
            time.white
        );


    document.getElementById(
        "blackTimer"
    ).textContent =
        formatTime(
            time.black
        );


    document.getElementById(
        "whitePlayer"
    ).classList.toggle(
        "active",
        currentTurn === "white"
    );


    document.getElementById(
        "blackPlayer"
    ).classList.toggle(
        "active",
        currentTurn === "black"
    );


    const status =
        document.getElementById(
            "status"
        );

    const restartButton =
        document.getElementById(
            "restartButton"
        );


    if (gameEnded) {

        status.textContent =
            "GAME OVER";

        restartButton.classList.remove(
            "hidden"
        );

        return;
    }


    restartButton.classList.add(
        "hidden"
    );


    if (
        currentTurn === myColor
    ) {

        status.textContent =
            "YOUR TURN";
    }

    else {

        status.textContent =
            "OPPONENT'S TURN";
    }
}


/* =====================================================
   재시작 버튼
===================================================== */

document.getElementById(
    "restartButton"
).addEventListener(
    "click",
    () => {

        /*
         * 게임이 끝난 뒤 재시작 버튼을
         * 누르면 방 입력 화면으로
         * 돌아간다.
         */
        location.reload();
    }
);


/* =====================================================
   시작
===================================================== */

connect();
